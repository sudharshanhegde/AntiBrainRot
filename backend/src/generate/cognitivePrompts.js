// Prompt builders for the cognitive speed and accuracy test pipeline.
//
// Same two-pass shape as the rest of the pipeline: a generation call writes
// a batch of multiple-choice questions for one category, then a separate
// validation call with a clean context judges that batch. Questions are
// written to be answered quickly under time pressure, so each is short and
// has exactly one unambiguous correct answer with plausible distractors.
//
// The four categories are deliberately kept as separate test types rather
// than mixed inside one session: the point is a clean, comparable
// measurement per category over time. logical/relational is a first-class
// category (ordering and deduction from stated relationships), not folded
// into abstract.

export const COGNITIVE_CATEGORIES = ["numerical", "verbal", "abstract", "logical"];

export const CATEGORY_LABELS = {
  numerical: "Numerical reasoning",
  verbal: "Verbal reasoning",
  abstract: "Abstract reasoning",
  logical: "Logical reasoning",
};

export const CATEGORY_DESCRIPTIONS = {
  numerical: "Arithmetic, percentages, ratios, and quick data interpretation under time pressure.",
  verbal: "Vocabulary, sentence completion, and short-passage comprehension.",
  abstract: "Shape, sequence, and pattern completion, visual logic with almost no words.",
  logical: "Deduction from stated relationships, like ordering puzzles.",
};

const SHARED_RULES = `Hard rules, non-negotiable:
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure.
- Exactly four options with ids "a", "b", "c", "d". Exactly one is correct.
- Options are short, a few words each, never full sentences.
- Each question must be self-contained and answerable in a few seconds of focused thought.
- No trick questions, no negation puzzles ("which is NOT"), no trivia that depends on outside knowledge.
- The distractors must be plausible to someone who is rushing: they should look reasonable but be clearly wrong once actually worked out.
- Never reuse a question_label from the "already covered question labels" list, and do not repeat an idea within the batch.`;

const CATEGORY_GUIDANCE = {
  numerical: `Numerical reasoning guidance:
- Cover arithmetic, percentages, ratios, averages, and tiny data-interpretation setups.
- Keep the numbers clean enough to compute mentally in well under a minute.
- question_text states the problem plainly and may carry a short arithmetic expression.`,
  verbal: `Verbal reasoning guidance:
- Cover vocabulary in context, sentence completion, and one or two line reading comprehension of a short passage quoted inside question_text.
- The answer must follow from the text given, never from outside knowledge.`,
  abstract: `Abstract reasoning guidance:
- Pattern and sequence completion using letters or symbols as a stand-in for visual shapes (for example "A, C, F, J, ?" or "Z, X, V, T, ?").
- Describe the sequence in question_text using plain characters, and make the rule unique and unambiguous.`,
  logical: `Logical reasoning guidance:
- Ordering and deduction from stated relationships, exactly like "Ravi is taller than Meera. Meera is taller than Arjun. Who is the shortest?"
- State the relationships using "<Name> is <comparative> than <Name>" sentences (taller, shorter, faster, slower, older, younger, heavier, lighter).
- Include a "Cannot be determined" option whenever the stated relationships genuinely do not establish a full ordering, and make it the correct answer in that case. When the ordering IS fully determined, the correct answer must be the named person, never "Cannot be determined".
- question_label names the specific relationship set, e.g. "height ordering Ravi Meera Arjun".`,
};

const SCHEMA = `Reply with ONLY a single JSON object. No markdown fences, no commentary. Schema:
{
  "category": "<category>",
  "questions": [
    {
      "order_index": 0,
      "question_text": "string, at most 40 words",
      "question_label": "string, short and specific, the dedupe key",
      "options": [
        { "id": "a", "text": "string" },
        { "id": "b", "text": "string" },
        { "id": "c", "text": "string" },
        { "id": "d", "text": "string" }
      ],
      "correct_option_id": "one of a/b/c/d",
      "difficulty": "easy | medium | hard",
      "explanation": "string, one line, why the correct answer is right"
    }
  ]
}`;

export function buildCognitiveGenerationMessages(category, count, coveredLabels) {
  const guidance = CATEGORY_GUIDANCE[category] || "";
  const system = `You write timed multiple-choice questions for the ${CATEGORY_LABELS[category] || category} category of a cognitive speed and accuracy test. The user answers one question at a time against a countdown, so speed and clarity matter as much as difficulty.

${guidance}

${SHARED_RULES}

Aim for a difficulty spread: roughly a third easy, a third medium, a third hard.

${SCHEMA}`;

  const user = `Generate ${count} questions for the "${category}" category.

Already covered question labels (do not repeat any of these ideas):
${
  coveredLabels && coveredLabels.length
    ? coveredLabels.map((c) => `  - ${c}`).join("\n")
    : "  (none yet)"
}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const VALIDATION_SYSTEM = `You are the validation pass for the cognitive test pipeline. Given a draft batch of multiple-choice questions, judge it and flag anything wrong. Do not rewrite anything.

Checklist, judge the whole batch:
1. Flag any question with more than one defensible correct answer, or a distractor that could also be correct.
2. Flag any question whose stated correct_option_id does not match the option you would choose.
3. Flag any question that needs outside knowledge the question_text does not supply.
4. Flag any question_label that overlaps the "already covered question labels" list, or any two questions that test the same idea.
5. Flag any logical ordering question whose "Cannot be determined" answer is wrong, or that claims a specific answer when the stated relationships do not determine one.
6. Flag any question that is too long or too fiddly to answer in a few seconds.

Note: mechanical checks (four options, ids a/b/c/d, valid correct_option_id, no em dashes, no emojis) already ran separately. Do not re-check those.

Reply with ONLY a single JSON object:
{
  "verdict": "pass" | "fail",
  "questions": [
    { "index": 0, "pass": true, "reason": "short reason" }
  ],
  "notes": "optional overall note"
}`;

export function buildCognitiveValidationMessages(category, batch, coveredLabels) {
  const user = `Category: ${category}

Batch to validate:
${JSON.stringify(batch, null, 2)}

Already covered question labels:
${
  coveredLabels && coveredLabels.length
    ? coveredLabels.map((c) => `  - ${c}`).join("\n")
    : "  (none yet)"
}`;
  return [
    { role: "system", content: VALIDATION_SYSTEM },
    { role: "user", content: user },
  ];
}
