// Prompt builders for the Quick Bites generation job ().
//
// Quick Bites is a separate content module from the structured topic
// decks: short, punchy, single-idea cards spanning all of computer
// science, not tied to any one topic. There is no curated source
// material at this volume and breadth, so generation always runs from
// the model's own knowledge, the same tradeoff already accepted for
// keyword-only topics, and validation is always a self-check pass that
// flags anything the model is not confident is factually accurate.
//
// Every bite carries a `fact_label` (the dedupe key, checked against
// covered_facts before generation) and a loose `tag` used only to keep
// the batch varied across categories.

export const QUICK_BITES_TAGS = [
  "algorithms",
  "security",
  "hardware",
  "plt-trivia",
  "internet-history",
  "famous-bugs",
  "systems",
  "databases",
  "networking",
  "history-of-computing",
];

const GENERATION_SYSTEM = `You generate Quick Bites, the low-commitment feed for a bored user. Each bite is one short, punchy, single-idea card spanning all of computer science. Think of it as a headline plus just enough context to actually be interesting, not a lesson. A user should read one in a few seconds and immediately want the next.

Hard rules, non-negotiable:
- Each bite is ONE interesting, true idea. A headline plus enough context to be genuinely interesting on its own.
- Body must be 40 to 60 words. Never fewer than 40, never more than 60. Count them.
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure the sentence instead.
- No filler openers such as "did you know" or "fun fact". Start with the content.
- Pull from the whole breadth of computer science: algorithms, security, hardware, programming language trivia, internet history, weird syscalls, famous bugs, databases, networking, and so on. Vary the tag across the batch; do not cluster on one or two tags.
- Only state facts you are confident are correct and well-established. For anything niche, version-specific, or uncertain, prefer a general safe statement over a specific one you cannot verify.
- Do not repeat any fact_label from the "already covered fact labels" list.
- "tag" is a loose category label for variety, one of: ${QUICK_BITES_TAGS.join(", ")}.
- "fact_label" is a short label naming the single fact, used for de-duplication. It must be specific enough to catch a repeat, e.g. "Merkle tree hash combining" not "cryptography".

Reply with ONLY a single JSON object. No markdown fences, no commentary. Schema:
{
  "bites": [
    { "tag": "algorithms", "fact_label": "string, specific fact label", "body": "string, 40 to 60 words" }
  ]
}`;

export function buildQuickBitesGenerationMessages(count, coveredLabels) {
  const user = `Generate ${count} Quick Bites, spread across a wide variety of tags rather than clustering on one or two.

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
1. Flag any claim you are not confident is factually correct. Uncertain or niche details must be flagged, not silently passed.
2. Flag any fact_label that overlaps the "already covered fact labels" list.
3. Flag any bite that is not a single self-contained, interesting idea.
4. Flag any two bites that effectively repeat the same fact under different labels.

Note: mechanical checks (40-60 word band, no em dashes, no emojis, unique fact_labels within the batch) already ran separately and passed. Do not re-check those.

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
