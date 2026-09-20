// Prompt builders for the cognitive speed and accuracy test pipeline.
//
// Same two-pass shape as the rest of the pipeline: a generation call writes
// a batch of multiple-choice questions for one category, then a separate
// validation call with a clean context judges that batch.
//
// These are SPEED tests in the style of Thomas GIA and similar recruitment
// assessments: the individual items are deliberately easy, and the challenge
// is answering many of them quickly. The thing being measured is reaction time
// and pattern recognition, not deep reasoning, so the prompts below push hard
// for single-step, instantly-recognisable items and explicitly reject anything
// that needs careful working out.
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
  numerical: "Quick mental arithmetic, percentages, ratios, and simple data reading, easy items against the clock.",
  verbal: "Everyday vocabulary, odd-word-out, sentence completion, and one-line comprehension.",
  abstract: "Sequence and pattern completion, recognising the rule fast rather than solving it the hard way.",
  logical: "Simple ordering and deduction from stated relationships, like short ordering puzzles.",
};

const SHARED_RULES = `Hard rules, non-negotiable:
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure.
- Exactly four options with ids "a", "b", "c", "d". Exactly one is correct.
- Options are short, a few words each, never full sentences.
- SPEED OVER DIFFICULTY. Every item must be individually EASY, the kind anyone can answer in a few seconds once they spot the simple pattern or do one step of mental arithmetic. The challenge is finishing quickly, never thinking hard. This measures speed and pattern recognition, not deep reasoning.
- Favour pattern recognition: sequences, simple transformations, odd-one-out, and analogies with an obvious rule.
- ONE STEP ONLY. If an item needs two or more steps, careful multi-step reasoning, or niche knowledge, it is too hard: replace it with a simpler item.
- Each question must be self-contained and answerable in a few seconds of focused thought.
- No trick questions, no negation puzzles ("which is NOT"), no trivia that depends on outside knowledge.
- The distractors must be plausible to someone who is rushing: they should look reasonable but be clearly wrong once actually worked out.
- Never reuse a question_label from the "already covered question labels" list, and do not repeat an idea within the batch.`;

const CATEGORY_GUIDANCE = {
  numerical: `Numerical reasoning guidance:
- Cover single-step arithmetic, easy percentages, simple ratios, and averages, all doable mentally in a few seconds.
- Keep the numbers small and round (tens and hundreds), so the arithmetic is trivial to do in your head.
- Avoid long word problems and multi-step setups; one clean calculation per item.
- question_text states the problem plainly and may carry a short arithmetic expression.`,
  verbal: `Verbal reasoning guidance:
- Cover common-word synonyms, antonyms, odd-word-out, and sentence completion with an obvious single fit.
- A comprehension item quotes one short line inside question_text; the answer follows immediately from it.
- Use everyday vocabulary, never obscure or advanced words, and never rely on outside knowledge.`,
  abstract: `Abstract reasoning guidance:
- This is pure pattern recognition, so lean on it hardest. Use letters, numbers, or simple symbols as a stand-in for visual shapes (for example "2, 4, 6, 8, ?" or "A, B, D, E, ?").
- Favour sequences with an obvious single rule: +1 each time, +2 each time, alternating up/down, or a short repeating cycle.
- Also use odd-one-out and simple analogies ("A is to B as C is to ?") where the rule is immediately visible.
- Describe the sequence in question_text using plain characters, and make the rule unique and unambiguous. Avoid layered or combined rules.`,
  logical: `Logical reasoning guidance:
- Keep it to simple, short ordering or deduction from one or two stated relationships, exactly the "Ravi is taller than Meera. Meera is taller than Arjun. Who is the shortest?" shape.
- State the relationships using "<Name> is <comparative> than <Name>" sentences (taller, shorter, faster, slower, older, younger, heavier, lighter).
- You may also use a simple odd-one-out ("which does not belong") once in a while.
- Include a "Cannot be determined" option whenever the stated relationships genuinely do not establish a full ordering, and make it the correct answer in that case. When the ordering IS fully determined, the correct answer must be the named person, never "Cannot be determined".
- question_label names the specific relationship set, e.g. "height ordering Ravi Meera Arjun".`,
};

const SCHEMA = `Reply with ONLY a single JSON object. No markdown fences, no commentary. Schema:
{
  "category": "<category>",
  "questions": [
    {
      "order_index": 0,
      "question_text": "string, at most 30 words",
      "question_label": "string, short and specific, the dedupe key",
      "options": [
        { "id": "a", "text": "string" },
        { "id": "b", "text": "string" },
        { "id": "c", "text": "string" },
        { "id": "d", "text": "string" }
      ],
      "correct_option_id": "one of a/b/c/d",
      "difficulty": "easy | medium",
      "explanation": "string, one line, why the correct answer is right"
    }
  ]
}`;

export function buildCognitiveGenerationMessages(category, count, coveredLabels) {
  const guidance = CATEGORY_GUIDANCE[category] || "";
  const system = `You write timed multiple-choice questions for the ${CATEGORY_LABELS[category] || category} category of a cognitive speed and accuracy test. The user answers one question at a time against a countdown, so speed and instant clarity matter far more than difficulty.

${guidance}

${SHARED_RULES}

Difficulty spread: keep almost every item easy, roughly three quarters "easy" and the rest "medium". Do NOT write "hard" or tricky items. If an item feels hard, simplify it until it is quick and obvious.

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

This is a SPEED test in the style of Thomas GIA: items are meant to be easy and answered in a few seconds. An over-hard item is a defect, not a plus.

Checklist, judge the whole batch:
1. Flag any question with more than one defensible correct answer, or a distractor that could also be correct.
2. Flag any question whose stated correct_option_id does not match the option you would choose.
3. Flag any question that needs outside knowledge the question_text does not supply.
4. Flag any question_label that overlaps the "already covered question labels" list, or any two questions that test the same idea.
5. Flag any logical ordering question whose "Cannot be determined" answer is wrong, or that claims a specific answer when the stated relationships do not determine one.
6. Flag any question that is too long, too fiddly, needs more than one step or more than a few seconds of thought, or is marked "hard". The test is about speed on easy items, so an over-hard item is a failure.

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
