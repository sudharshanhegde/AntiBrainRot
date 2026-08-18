import { coveredConceptList } from "./coverage.js";

export function difficultyForDeckIndex(index) {
  if (index <= 0) return "fundamentals";
  if (index === 1) return "intermediate";
  return "advanced";
}

// A deck is 20 cards, concept, quiz, concept, quiz,
// repeated. Even order_index (0, 2, ... 18) are concept cards; odd
// (1, 3, ... 19) are quiz cards that test the concept immediately
// before them.
const GENERATION_SYSTEM = `You write content decks for a swipeable computer science learning app. Each deck teaches 10 independent, self-contained concepts at one difficulty level, followed immediately by a quiz card per concept, and together they form a coherent progression through the topic.

Hard writing rules, non-negotiable:
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure the sentence instead.
- Every card body must be between 110 and 180 words. Write 130 to 160 words per body, and count them. Never write fewer than 110 words; a body under 100 words fails validation.
- Explain the mechanism, not just the definition. State what actually happens, step by step.
- Titles are specific and name the exact mechanism or structure, not a topic area. Avoid vague titles such as "Why X matters" or "Introduction to X". At most 8 words. Example: "DNS resolves names through a chain of servers".
- No filler openers such as "in this card we will learn about". Start with the content.
- Every technical term is either common knowledge for a CS major or explained inline on first use.
- Every factual claim must be traceable to the source material in the user message. If you cannot ground a claim, cut it or soften it to a general statement.
- Do not repeat any concept in the "already covered concepts" list. Those decks already exist, and the user must never feel they are seeing the same topic again.

Deck structure, non-negotiable:
- The deck has exactly 20 cards: 10 concept cards and 10 quiz cards, alternating concept, quiz, concept, quiz. Even order_index values (0, 2, 4, ... 18) are concept cards; odd order_index values (1, 3, 5, ... 19) are quiz cards. Each quiz card immediately follows the concept card it tests.

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

function sourceBlock(sources) {
  if (!sources || sources.length === 0) {
    return "No source material was provided for this subtopic. Flag the gap; do not generate from memory.";
  }
  return sources
    .map(
      (s) => `--- ${s.name} ---\n${s.text}`
    )
    .join("\n\n");
}

function coverageContext(manifest) {
  const covered = coveredConceptList(manifest);
  const priorTitles =
    manifest && Array.isArray(manifest.decks)
      ? manifest.decks.flatMap((d) =>
          (d.card_titles || []).map((t) => `  - ${t}`)
        )
      : [];
  return (
    `Already covered concepts (do not repeat these):\n${
      covered.length ? covered.map((c) => `  - ${c}`).join("\n") : "  (none yet)"
    }\n\n` +
    `Prior deck titles for overlap context:\n${
      priorTitles.length ? priorTitles.join("\n") : "  (none yet)"
    }`
  );
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

export function buildGenerationMessages(topicSlug, deckIndex, sources, manifest, manualQuizzes) {
  const difficulty = difficultyForDeckIndex(deckIndex);
  const user = `Topic: ${topicSlug}
Deck index: ${deckIndex}
Difficulty: ${difficulty} (assumes all lower decks are already known to the reader)

${coverageContext(manifest)}

Source material to ground every claim:
${sourceBlock(sources)}${manualQuizBlock(manualQuizzes)}`;

  return [
    { role: "system", content: GENERATION_SYSTEM },
    { role: "user", content: user },
  ];
}

// Quiz-specific judging is added to the checklist. The
// automated checks (schema shape, one matching correct_option_id,
// unique options, em dash/emoji, word count) already ran separately.
const VALIDATION_SYSTEM = `You are the validation pass for a content pipeline. Your job is to judge a draft deck, not to rewrite it. Given the draft, the same source material used in generation, and the list of prior deck titles, output pass/fail per card with a short reason.

Checklist, judge each card against all of these:
1. Every factual claim traces to the provided source material.
2. No concept overlaps with the prior deck titles for this topic.
3. Title is specific, not generic or teaser-style.
4. Template matches the content needs: text_diagram only when a diagram meaningfully helps, text_code only when a snippet clarifies, otherwise text_only.
5. The deck reads as a coherent progression, not 10 unrelated facts.
6. For every quiz card: the correct answer must be derivable entirely from the body of the concept card immediately before it. The three distractors must be plausible-sounding but clearly wrong for someone who actually read that card. Flag any unfair question: a trick question, a negation trick ("which of these is NOT true"), a distractor that is really a matter of interpretation, or a question that tests a minor aside while ignoring the card's main point.

Note: automated checks (no em dashes, no emojis, word count 100-200, 20-card alternating schema shape, exactly one matching correct_option_id, unique option text) already ran separately and passed. Do not re-check those.

Reply with ONLY a single JSON object:
{
  "verdict": "pass" | "fail",
  "cards": [
    { "order_index": 0, "pass": true, "reason": "short reason" }
  ],
  "notes": "optional overall note"
}`;

export function buildValidationMessages(topicSlug, deckIndex, draft, sources, manifest) {
  const priorTitles =
    manifest && Array.isArray(manifest.decks)
      ? manifest.decks.flatMap((d) =>
          (d.card_titles || []).map((t) => `  - ${t}`)
        )
      : [];
  const user = `Topic: ${topicSlug}
Deck index: ${deckIndex}

Prior deck titles for this topic (check overlap against these):
${priorTitles.length ? priorTitles.join("\n") : "  (none yet)"}

Source material:
${sourceBlock(sources)}

Draft deck to judge:
${JSON.stringify(draft, null, 2)}`;

  return [
    { role: "system", content: VALIDATION_SYSTEM },
    { role: "user", content: user },
  ];
}
