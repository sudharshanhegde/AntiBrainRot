// Prompt builders for the Quick Bites generation job ().
//
// Quick Bites is a separate content module from the structured topic
// decks: short, punchy, single-idea cards with something the reader can
// use today. The mix is career, learning, focus, psychology, money and
// energy, with the occasional odd-but-true fact when it teaches a
// practical point. Not tied to any one topic. There is no curated source
// material at this volume and breadth, so generation always runs from
// the model's own knowledge, the same tradeoff already accepted for
// keyword-only topics, and validation is always a self-check pass that
// flags anything the model is not confident is correct or safe.
//
// Every bite carries a `fact_label` (the dedupe key, checked against
// covered_facts before generation) and a loose `tag` used only to keep
// the batch varied across categories.

export const QUICK_BITES_TAGS = [
  "career",
  "learning",
  "focus",
  "psychology",
  "money",
  "burnout",
  "sleep",
  "communication",
  "history",
  "space",
];

const GENERATION_SYSTEM = `You generate Quick Bites, the low-commitment feed for a bored user. Each bite is one short, punchy, single-idea card with one thing the reader can actually use today: a career move, a way to learn faster, a focus or habit trick, a bit of psychology that explains behavior, a money basic, something about energy and burnout, a better way to say a hard thing. An occasional odd-but-true fact from history, space, or science is fine when it makes a practical point. Never hardware trivia, company history, or version-specific details. A user should read one in a few seconds and immediately want the next.

Hard rules, non-negotiable:
- Each bite is ONE idea, plus at most one concrete micro-action the reader can try in under two minutes.
- Body must be 60 to 100 words. Never fewer than 60, never more than 100. Count them.
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure the sentence instead.
- No filler openers such as "did you know", "fun fact", or "here is a trick". Start with the content.
- Practical over inspirational. No slogans, no "believe in yourself", no hustle cliches, no claims about the reader's potential or worth.
- Advice must be safe and general. No personalized medical, therapeutic, or investment advice, no dosage, no diagnosis, no guaranteed returns. Money and health points stay general principles with no promise of outcome.
- Do not invent studies, statistics, quotes, or attributions. If a name or number is not certain, state the idea without it.
- Do not address the reader about the feed itself, ask them questions, or offer to send something next. The card stands alone.
- Vary the tag across the batch; do not cluster on one or two tags.
- Only state claims you are confident are correct and well-established. For anything niche or uncertain, prefer a general safe statement over a specific one you cannot verify.
- Do not repeat any fact_label from the "already covered fact labels" list.
- "tag" is a loose category label for variety, one of: ${QUICK_BITES_TAGS.join(", ")}.
- "fact_label" is a short label naming the single idea, used for de-duplication. It must be specific enough to catch a repeat, e.g. "Zeigarnik effect on unfinished tasks" not "productivity".

Reply with ONLY a single JSON object. No markdown fences, no commentary. Schema:
{
  "bites": [
    { "tag": "career", "fact_label": "string, specific idea label", "body": "string, 60 to 100 words" }
  ]
}`;

export function buildQuickBitesGenerationMessages(count, coveredLabels) {
  const user = `Generate ${count} Quick Bites, spread across a wide variety of tags rather than clustering on one or two. Lean useful: every bite should leave the reader with something to try or a way of seeing a situation, not a quote or a platitude.

Already covered fact labels (do not repeat any of these):
${
  coveredLabels && coveredLabels.length
    ? coveredLabels.map((c) => `  - ${c}`).join("\n")
    : "  (none yet)"
}`;
  return [
    { role: "system", content: GENERATION_SYSTEM },
    { role: "user", content: user },
  ];
}

const VALIDATION_SYSTEM = `You are the self-check validation pass for the Quick Bites pipeline. Given a draft batch generated from your own knowledge, judge it and flag anything wrong. Do not rewrite it.

Checklist, judge the whole batch:
1. Flag any claim you are not confident is factually correct, including invented studies, statistics, quotes, or attributions. Uncertain or niche details must be flagged, not silently passed.
2. Flag any fact_label that overlaps the "already covered fact labels" list.
3. Flag any bite that is not a single self-contained idea, or that has no usable takeaway.
4. Flag any two bites that effectively repeat the same idea under different labels.
5. Flag any bite that gives personalized medical, therapeutic, or investment advice, states a dosage or diagnosis, or promises a financial outcome.
6. Flag any bite that is motivational filler or hype with no concrete idea.

Note: mechanical checks (60-100 word band, no em dashes, no emojis, unique fact_labels within the batch) already ran separately and passed. Do not re-check those.

Reply with ONLY a single JSON object:
{
  "verdict": "pass" | "fail",
  "bites": [
    { "index": 0, "pass": true, "reason": "short reason" }
  ],
  "notes": "optional overall note"
}`;

export function buildQuickBitesValidationMessages(batch, coveredLabels) {
  const user = `Already covered fact labels:
${
  coveredLabels && coveredLabels.length
    ? coveredLabels.map((c) => `  - ${c}`).join("\n")
    : "  (none yet)"
}

Draft batch to judge:
${JSON.stringify(batch, null, 2)}`;
  return [
    { role: "system", content: VALIDATION_SYSTEM },
    { role: "user", content: user },
  ];
}
