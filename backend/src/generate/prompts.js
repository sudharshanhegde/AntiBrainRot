// Prompt builders for the automated generation job.
//
// A deck teaches one subject (Array, Linked List) through a fixed
// progression, so generation is driven by the topic's syllabus: the deck is
// handed its assigned concepts in order and must cover exactly those, with
// each card connecting back to the one before it and one running analogy for
// the whole subject.
//
// Two modes: when curated sources exist for a
// topic, generation is grounded on them and validation checks claims
// against them. When no sources exist, generation uses DeepSeek's own
// knowledge and validation is a self-check that flags any claim the model
// is not confident is factually correct.
//
// In both modes the already-covered concepts (from covered_concepts)
// and prior deck titles are included so the model never repeats itself.
//
// Every concept card is immediately followed by a quiz card that tests it.

export function difficultyForDeckIndex(index) {
  if (index <= 0) return "fundamentals";
  if (index === 1) return "intermediate";
  return "advanced";
}

const WRITING_RULES = `Hard writing rules, non-negotiable:
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure the sentence instead.
- Every card body must be between 110 and 180 words. Write 130 to 160 words per body, and count them. Never write fewer than 110 words; a body under 100 words fails validation.
- Explain the mechanism, not just the definition. State what actually happens, step by step.
- Lead with a relatable, everyday comparison before the technical explanation, then map the comparison onto the real mechanism explicitly instead of leaving the reader to connect it. The comparison must be accurate about how the thing actually works, never merely entertaining. Depth and complexity after the comparison are fine; an unexplained wall of jargon on the first line is not.
- Write like you are explaining it to a curious friend, not writing a textbook. Second person, plain words, a warm and slightly playful voice. Forced jokes or puns are not the goal; sounding human is.
- Keep the energy up. Vary sentence length, use concrete images instead of abstract nouns, and never stack jargon into one sentence. If a paragraph reads like a lecture, rewrite it.
- Titles are specific and name the exact mechanism or structure, not a topic area. Avoid vague titles such as "Why X matters" or "Introduction to X". At most 8 words. Example: "DNS resolves names through a chain of servers".
- No filler openers such as "in this card we will learn about". Start with the content.
- Every technical term is either common knowledge for a CS major or explained inline on first use.
- Do not repeat any concept in the "already covered concepts" list. Those concepts already exist in live decks, and the user must never feel they are seeing the same topic again.`;

// Deck shape follows CARDS_PER_DECK (the number of assigned concepts). The
// deck is that many concept cards, each immediately followed by its quiz.
function deckStructureRules(cardsPerDeck) {
  return `Deck structure, non-negotiable:
- This deck teaches exactly ONE subject, through ${cardsPerDeck} assigned concepts listed in the user message. The deck has exactly ${cardsPerDeck * 2} cards: ${cardsPerDeck} concept cards and ${cardsPerDeck} quiz cards, alternating concept, quiz, concept, quiz. Even order_index values (0, 2, 4, ...) are concept cards; odd order_index values (1, 3, 5, ...) are quiz cards. Each quiz card immediately follows the concept card it tests.
- The ${cardsPerDeck} concept cards are exactly the ${cardsPerDeck} assigned concepts, in the given order. Do not add, drop, reorder, or replace a concept. Every concept card covers only its assigned concept: no side topics, no previews of later cards. Put the assigned concept label verbatim in that card's "concept" field.
- Every card after the first opens with a short clause connecting it to the card before it, for example "Now that you can index into an array, ...". Progression comes from the assigned order; never reorder it.`;
}

// One running analogy per subject: created on part 1 and reused verbatim on
// every later part so the whole subject uses a single picture.
function subjectAnalogyRule(analogy) {
  if (analogy) {
    return `- One running analogy per subject, not a fresh one per card. This subject already has an established analogy: "${analogy}". Reuse that exact picture in every card and return it unchanged in "subject_analogy". It must still map correctly onto the real mechanism and say where it stops holding.`;
  }
  return `- One running analogy per subject, not a fresh one per card. Create a single analogy for the whole subject now, reuse it in every card of this deck, and return it in the "subject_analogy" field. It must map correctly onto the real mechanism, not merely sound nice, and say where it stops holding.`;
}

const QUIZ_RULES = `Quiz card writing rules, non-negotiable:
- Each quiz card tests only the concept card immediately before it. The user must be able to answer purely from that card's body, never from outside knowledge. If the card did not say it, do not ask it.
- "question" is exactly one sentence, directly about the preceding card.
- Exactly 4 options with ids "a", "b", "c", "d". Options are short, a few words each, not full sentences.
- Exactly one "correct_option_id", one of a/b/c/d. The three other options are plausible distractors: they sound reasonable but are clearly wrong once the card is actually read. Never make a distractor that is really a matter of interpretation.
- No trick questions, no negation tricks ("which of these is NOT true"), never test a minor detail buried in the middle of the body while ignoring the actual point of the card. Test the core idea the card was teaching.
- "tests_card_id" must equal the order_index of the immediately preceding concept card.
- The question and every option must obey the no em dash / no emoji rule.`;

const OUTPUT_SCHEMA = `Reply with ONLY a single JSON object. No markdown fences, no commentary. Schema:
{
  "deck_index": <integer>,
  "topic": "<topic-slug>",
  "difficulty": "fundamentals | intermediate | advanced",
  "subject_analogy": "string, the one running analogy for this subject",
  "cards": [
    {
      "order_index": 0,
      "type": "concept",
      "template": "text_only | text_code | text_diagram",
      "title": "string, at most 8 words",
      "body": "string, 110 to 180 words",
      "code_snippet": "string or null",
      "diagram_ref": "string or null",
      "concept": "the assigned concept label for this card, verbatim"
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
- Template choice, applies to every topic: prefer "text_code" whenever a short snippet makes the mechanism concrete, because seeing the code is how these concepts usually click. Use "text_only" when no short snippet genuinely clarifies the idea, and "text_diagram" when a layout or state diagram clarifies better than code or prose.
- A snippet does not replace the body: still write a full 110 to 180 word body explaining what the snippet shows.
- The snippet must be real, minimal, and correct: a real language, shell, or syscall example. No pseudo-code, no ellipses, no placeholder identifiers.`;

// The cardsPerDeck is the count of assigned concepts, so the deck shape and
// the schema agree with what the syllabus handed over.
function generationSystem(cardsPerDeck, grounded, analogy) {
  const base = `${WRITING_RULES}

${deckStructureRules(cardsPerDeck)}
${subjectAnalogyRule(analogy)}

${QUIZ_RULES}

${OUTPUT_SCHEMA}`;
  return grounded
    ? `${base}
- Every factual claim must be traceable to the source material in the user message. If you cannot ground a claim, cut it or soften it to a general statement.`
    : `${base}
- No source material is provided for this topic, so generate from your own knowledge. State only facts you are confident are correct and well-established. For anything niche, version-specific, or uncertain, prefer a general, safe statement over a specific one you cannot verify.`;
}

function sourceBlock(sources) {
  return sources
    .map((s) => `--- ${s.name} ---\n${s.text}`)
    .join("\n\n");
}

function bulletList(items, emptyLabel) {
  return items && items.length ? items.map((c) => `  - ${c}`).join("\n") : `  (${emptyLabel})`;
}

// Cost control: the "already covered" context is capped to the most
// recent entries. Overlap-prevention only needs the decks closest to the
// one being generated, and the covered_concepts unique constraint in the
// database is the hard guard against real duplicates. Sending the entire
// history would grow the prompt on every call as a topic deepens, which
// steadily raises input-token cost.
const MAX_COVERED_CONCEPTS = 40;
const MAX_PRIOR_TITLES = 30;

function recent(items, max) {
  if (!items || items.length === 0) return [];
  return items.slice(-max);
}

// Labels a section with how many entries are shown when the full list is
// longer, so the model knows the context was trimmed.
function contextHeading(label, shown, total) {
  return total > shown ? `${label} (most recent ${shown} of ${total})` : label;
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

// The assigned concepts, in syllabus order, are the whole deck: the model
// must cover exactly these and nothing else.
function subjectBlock(subject) {
  if (!subject) return "";
  const concepts = subject.concepts || [];
  const list = concepts.map((c, i) => `  ${i + 1}. ${c}`).join("\n");
  const part = subject.partNumber && subject.partCount
    ? ` (part ${subject.partNumber} of ${subject.partCount})`
    : "";
  return `Subject: ${subject.title}${part}
Assigned concepts for this deck, in teaching order (cover exactly these, in this order, nothing else):
${list}`;
}

export function buildGenerationMessages(
  topicSlug,
  deckIndex,
  coveredConcepts,
  priorTitles,
  sources,
  manualQuizzes,
  subject = null
) {
  const difficulty = difficultyForDeckIndex(deckIndex);
  const grounded = sources && sources.length > 0;
  const cardsPerDeck = subject && subject.concepts ? subject.concepts.length : 10;
  const analogy = subject ? subject.analogy : null;
  const sourceSection = grounded
    ? `Source material to ground every claim:\n${sourceBlock(sources)}`
    : "No curated source material is provided for this topic. Generate from your own knowledge and only state facts you are confident about.";

  const user = `Topic: ${topicSlug}
Deck index: ${deckIndex}
Difficulty: ${difficulty} (assumes all lower decks are already known to the reader)

${subjectBlock(subject)}

${contextHeading("Already covered concepts (do not repeat these)", MAX_COVERED_CONCEPTS, (coveredConcepts || []).length)}:
${bulletList(recent(coveredConcepts, MAX_COVERED_CONCEPTS), "none yet")}

${contextHeading("Prior deck titles for overlap context", MAX_PRIOR_TITLES, (priorTitles || []).length)}:
${bulletList(recent(priorTitles, MAX_PRIOR_TITLES), "none yet")}

${sourceSection}${manualQuizBlock(manualQuizzes)}`;

  return [
    {
      role: "system",
      content: generationSystem(cardsPerDeck, grounded, analogy),
    },
    { role: "user", content: user },
  ];
}

// Subject decks add three checks the LLM must judge (they are not
// machine-checkable): each card maps to its assigned concept, later cards
// connect back to the card before them, and the analogy matches the stored
// one and still maps onto the real mechanism.
function subjectValidationChecklist(subject) {
  if (!subject) return "";
  const assigned = (subject.concepts || []).join("; ");
  const analogyLine = subject.analogy
    ? `The subject's stored analogy is: "${subject.analogy}".`
    : "This is part 1, so it creates the subject analogy.";
  return `
7. This is a subject deck. Every concept card must map to one of these assigned concepts, in order, and no card may introduce a concept outside the assignment: ${assigned}
8. Every card after the first must open by connecting to the card before it, not read as a fresh unrelated concept.
9. The "subject_analogy" must be the single running analogy for the whole subject. ${analogyLine} It must still map correctly onto the real mechanism and say where it stops holding.`;
}

function validationSystem(grounded, subject) {
  const base = grounded
    ? `You are the validation pass for a content pipeline. Your job is to judge a draft deck, not to rewrite it. Given the draft, the same source material used in generation, and the prior deck titles, output pass/fail per card with a short reason.`
    : `You are the self-check validation pass for a content pipeline. Given a draft deck generated from your own knowledge, flag anything wrong, not rewrite it.`;
  const checklist = grounded
    ? `Checklist, judge each card against all of these:
1. Every factual claim traces to the provided source material.
2. No concept overlaps with the prior deck titles or already-covered concepts for this topic.
3. Title is specific, not generic or teaser-style.
4. Template matches the content needs: text_code when a short snippet clarifies the mechanism, text_diagram when a diagram does, otherwise text_only. Flag a snippet that is pseudo-code, incorrect, or unsafe.
5. For every quiz card: the correct answer must be derivable entirely from the body of the concept card immediately before it. The three distractors must be plausible-sounding but clearly wrong for someone who actually read that card. Flag any unfair question: a trick question, a negation trick ("which of these is NOT true"), a distractor that is really a matter of interpretation, or a question that tests a minor aside while ignoring the card's main point.`
    : `Checklist:
1. Flag any claim you are not confident is factually correct. Uncertain or niche details must be flagged, not silently passed.
2. Flag any concept that overlaps the already-covered concepts or prior deck titles for this topic.
3. Flag titles that are generic or teaser-style.
4. Flag template mismatches (text_diagram or text_code used without genuine need) and any snippet that is pseudo-code, incorrect, or unsafe.
5. For every quiz card: the correct answer must be derivable entirely from the body of the concept card immediately before it. The three distractors must be plausible-sounding but clearly wrong for someone who actually read that card. Flag any unfair question: a trick question, a negation trick ("which of these is NOT true"), a distractor that is really a matter of interpretation, or a question that tests a minor aside while ignoring the card's main point.`;
  return `${base}

${checklist}${subjectValidationChecklist(subject)}

Note: automated checks (no em dashes, no emojis, word count, card count and alternating schema shape, exactly one matching correct_option_id, unique option text, assigned-concept coverage) already ran separately and passed. Do not re-check those.

Reply with ONLY a single JSON object:
{
  "verdict": "pass" | "fail",
  "cards": [
    { "order_index": 0, "pass": true, "reason": "short reason" }
  ],
  "notes": "optional overall note"
}`;
}

export function buildValidationMessages(
  topicSlug,
  deckIndex,
  draft,
  coveredConcepts,
  priorTitles,
  sources,
  subject = null
) {
  const grounded = sources && sources.length > 0;
  const subjectLine = subject ? `\nSubject: ${subject.title} (part ${subject.partNumber} of ${subject.partCount})` : "";
  const user = `Topic: ${topicSlug}
Deck index: ${deckIndex}${subjectLine}

${contextHeading("Already covered concepts for this topic", MAX_COVERED_CONCEPTS, (coveredConcepts || []).length)}:
${bulletList(recent(coveredConcepts, MAX_COVERED_CONCEPTS), "none yet")}

${contextHeading("Prior deck titles for this topic", MAX_PRIOR_TITLES, (priorTitles || []).length)}:
${bulletList(recent(priorTitles, MAX_PRIOR_TITLES), "none yet")}

${grounded ? `Source material:\n${sourceBlock(sources)}` : "No source material was provided; validate against your own knowledge and flag anything you are not confident about."}

Draft deck to judge:
${JSON.stringify(draft, null, 2)}`;

  return [
    {
      role: "system",
      content: validationSystem(grounded, subject),
    },
    { role: "user", content: user },
  ];
}
