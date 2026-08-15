// Prompt builders for the automated generation job.
//
// Two modes (SKILL_topic_queue.md): when curated sources exist for a
// topic, generation is grounded on them and validation checks claims
// against them. When no sources exist, generation uses DeepSeek's own
// knowledge and validation is a self-check that flags any claim the
// model is not confident is factually correct.
//
// In both modes the already-covered concepts (from covered_concepts)
// and prior deck titles are included so the model never repeats itself.
//
// SKILL_quiz.md: every concept card is immediately followed by a quiz
// card that tests it. A deck is 20 cards: concept, quiz, concept, quiz,
// repeated.

export function difficultyForDeckIndex(index) {
  if (index <= 0) return "fundamentals";
  if (index === 1) return "intermediate";
  return "advanced";
}

const COMMON_RULES = `Hard writing rules, non-negotiable:
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure the sentence instead.
- Every card body must be between 110 and 180 words. Write 130 to 160 words per body, and count them. Never write fewer than 110 words; a body under 100 words fails validation.
- Explain the mechanism, not just the definition. State what actually happens, step by step.
- Titles are specific and name the exact mechanism or structure, not a topic area. Avoid vague titles such as "Why X matters" or "Introduction to X". At most 8 words. Example: "DNS resolves names through a chain of servers".
- No filler openers such as "in this card we will learn about". Start with the content.
- Every technical term is either common knowledge for a CS major or explained inline on first use.
- Do not repeat any concept in the "already covered concepts" list. Those concepts already exist in live decks, and the user must never feel they are seeing the same topic again.

Deck structure, non-negotiable:
- The deck has exactly 20 cards: 10 concept cards and 10 quiz cards, alternating concept, quiz, concept, quiz. Even order_index values (0, 2, 4, ... 18) are concept cards; odd order_index values (1, 3, 5, ... 19) are quiz cards. Each quiz card immediately follows the concept card it tests.
- The 10 concept cards are the 10 independent concepts the deck teaches. They must form a coherent progression through the topic.

Quiz card writing rules, non-negotiable:
- Each quiz card tests only the concept card immediately before it. The user must be able to answer purely from that card's body, never from outside knowledge. If the card did not say it, do not ask it.
- "question" is exactly one sentence, directly about the preceding card.
- Exactly 4 options with ids "a", "b", "c", "d". Options are short, a few words each, not full sentences.
- Exactly one "correct_option_id", one of a/b/c/d. The three other options are plausible distractors: they sound reasonable but are clearly wrong once the card is actually read. Never make a distractor that is really a matter of interpretation.
- No trick questions, no negation tricks ("which of these is NOT true"), never test a minor detail buried in the middle of the body while ignoring the actual point of the card. Test the core idea the card was teaching.
- "tests_card_id" must equal the order_index of the immediately preceding concept card.
- The question and every option must obey the no em dash / no emoji rule.

Reply with ONLY a single JSON object. No markdown fences, no commentary. Schema:
{
  "deck_index": <integer>,
  "topic": "<topic-slug>",
  "difficulty": "fundamentals | intermediate | advanced",
  "cards": [
    {
      "order_index": 0,
      "type": "concept",
      "template": "text_only | text_code | text_diagram",
      "title": "string, at most 8 words",
      "body": "string, 110 to 180 words",
      "code_snippet": "string or null",
      "diagram_ref": "string or null",
      "concept": "short noun phrase naming the single concept this card teaches, used for de-duplication across decks"
    },
    {
      "order_index": 1,
      "type": "quiz",
      "tests_card_id": 0,
      "question": "string, one sentence, directly about the preceding card",
      "options": [
        { "id": "a", "text": "string" },
        { "id": "b", "text": "string" },
        { "id": "c", "text": "string" },
        { "id": "d", "text": "string" }
      ],
      "correct_option_id": "one of a/b/c/d"
    }
  ]
}
Use text_code only when a short code or syscall snippet genuinely clarifies. Use text_diagram only when a simple diagram meaningfully helps; otherwise use text_only.`;

const GENERATION_SYSTEM_GROUNDED = `${COMMON_RULES}
- Every factual claim must be traceable to the source material in the user message. If you cannot ground a claim, cut it or soften it to a general statement.`;

const GENERATION_SYSTEM_SELF = `${COMMON_RULES}
- No source material is provided for this topic, so generate from your own knowledge. State only facts you are confident are correct and well-established. For anything niche, version-specific, or uncertain, prefer a general, safe statement over a specific one you cannot verify.`;

function sourceBlock(sources) {
  return sources
    .map((s) => `--- ${s.name} ---\n${s.text}`)
    .join("\n\n");
}

function bulletList(items, emptyLabel) {
  return items && items.length ? items.map((c) => `  - ${c}`).join("\n") : `  (${emptyLabel})`;
}

// The manual_quizzes map (order_index -> quiz card) is included so the
// model knows which quiz slots are already hand-written and does not
// waste tokens inventing them; those slots are replaced as-is after the
// call regardless of what the model returns.
function manualQuizBlock(manualQuizzes) {
  if (!manualQuizzes || manualQuizzes.size === 0) return "";
  const indexes = [...manualQuizzes.keys()].sort((a, b) => a - b);
  return `\n\nHand-written quiz cards already exist for order_index values ${indexes.join(
    ", "
  )}. Use those as-is, do not generate a question for them, and keep the other quiz cards pointing at the correct concept cards.`;
}

export function buildGenerationMessages(
  topicSlug,
  deckIndex,
  coveredConcepts,
  priorTitles,
  sources,
  manualQuizzes
) {
  const difficulty = difficultyForDeckIndex(deckIndex);
  const grounded = sources && sources.length > 0;
  const sourceSection = grounded
    ? `Source material to ground every claim:\n${sourceBlock(sources)}`
    : "No curated source material is provided for this topic. Generate from your own knowledge and only state facts you are confident about.";

  const user = `Topic: ${topicSlug}
Deck index: ${deckIndex}
Difficulty: ${difficulty} (assumes all lower decks are already known to the reader)

Already covered concepts (do not repeat these):
${bulletList(coveredConcepts, "none yet")}

Prior deck titles for overlap context:
${bulletList(priorTitles, "none yet")}

${sourceSection}${manualQuizBlock(manualQuizzes)}`;

  return [
    {
      role: "system",
      content: grounded ? GENERATION_SYSTEM_GROUNDED : GENERATION_SYSTEM_SELF,
    },
    { role: "user", content: user },
  ];
}

const VALIDATION_SYSTEM_GROUNDED = `You are the validation pass for a content pipeline. Your job is to judge a draft deck, not to rewrite it. Given the draft, the same source material used in generation, and the prior deck titles, output pass/fail per card with a short reason.

Checklist, judge each card against all of these:
1. Every factual claim traces to the provided source material.
2. No concept overlaps with the prior deck titles or already-covered concepts for this topic.
3. Title is specific, not generic or teaser-style.
4. Template matches the content needs: text_diagram only when a diagram meaningfully helps, text_code only when a snippet clarifies, otherwise text_only.
5. The deck reads as a coherent progression, not 10 unrelated facts.
6. For every quiz card: the correct answer must be derivable entirely from the body of the concept card immediately before it. The three distractors must be plausible-sounding but clearly wrong for someone who actually read that card. Flag any unfair question: a trick question, a negation trick ("which of these is NOT true"), a distractor that is really a matter of interpretation, or a question that tests a minor aside while ignoring the card's main point.

Note: automated checks (no em dashes, no emojis, word count, 20-card alternating schema shape, exactly one matching correct_option_id, unique option text) already ran separately and passed. Do not re-check those.

Reply with ONLY a single JSON object:
{
  "verdict": "pass" | "fail",
  "cards": [
    { "order_index": 0, "pass": true, "reason": "short reason" }
  ],
  "notes": "optional overall note"
}`;

const VALIDATION_SYSTEM_SELF = `You are the self-check validation pass for a content pipeline. Given a draft deck generated from your own knowledge, flag anything wrong, not rewrite it.

Checklist:
1. Flag any claim you are not confident is factually correct. Uncertain or niche details must be flagged, not silently passed.
2. Flag any concept that overlaps the already-covered concepts or prior deck titles for this topic.
3. Flag titles that are generic or teaser-style.
4. Flag template mismatches (text_diagram or text_code used without genuine need).
5. Flag a deck that is not a coherent progression.
6. For every quiz card: the correct answer must be derivable entirely from the body of the concept card immediately before it. The three distractors must be plausible-sounding but clearly wrong for someone who actually read that card. Flag any unfair question: a trick question, a negation trick ("which of these is NOT true"), a distractor that is really a matter of interpretation, or a question that tests a minor aside while ignoring the card's main point.

Note: automated checks (no em dashes, no emojis, word count, 20-card alternating schema shape, exactly one matching correct_option_id, unique option text) already ran separately and passed. Do not re-check those.

Reply with ONLY a single JSON object:
{
  "verdict": "pass" | "fail",
  "cards": [
    { "order_index": 0, "pass": true, "reason": "short reason" }
  ],
  "notes": "optional overall note"
}`;

export function buildValidationMessages(topicSlug, deckIndex, draft, coveredConcepts, priorTitles, sources) {
  const grounded = sources && sources.length > 0;
  const user = `Topic: ${topicSlug}
Deck index: ${deckIndex}

Already covered concepts for this topic:
${bulletList(coveredConcepts, "none yet")}

Prior deck titles for this topic:
${bulletList(priorTitles, "none yet")}

${grounded ? `Source material:\n${sourceBlock(sources)}` : "No source material was provided; validate against your own knowledge and flag anything you are not confident about."}

Draft deck to judge:
${JSON.stringify(draft, null, 2)}`;

  return [
    {
      role: "system",
      content: grounded ? VALIDATION_SYSTEM_GROUNDED : VALIDATION_SYSTEM_SELF,
    },
    { role: "user", content: user },
  ];
}
