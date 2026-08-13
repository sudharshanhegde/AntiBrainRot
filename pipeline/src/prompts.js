import { coveredConceptList } from "./coverage.js";

export function difficultyForDeckIndex(index) {
  if (index <= 0) return "fundamentals";
  if (index === 1) return "intermediate";
  return "advanced";
}

const GENERATION_SYSTEM = `You write content decks for a swipeable computer science learning app. Each deck teaches 10 independent, self-contained concepts at one difficulty level, and together they form a coherent progression through the topic.

Hard writing rules, non-negotiable:
- No em dashes anywhere. No emojis anywhere. Use a period, a comma, or restructure the sentence instead.
- Every card body must be between 110 and 180 words. Write 130 to 160 words per body, and count them. Never write fewer than 110 words; a body under 100 words fails validation.
- Explain the mechanism, not just the definition. State what actually happens, step by step.
- Titles are specific and name the exact mechanism or structure, not a topic area. Avoid vague titles such as "Why X matters" or "Introduction to X". At most 8 words. Example: "DNS resolves names through a chain of servers".
- No filler openers such as "in this card we will learn about". Start with the content.
- Every technical term is either common knowledge for a CS major or explained inline on first use.
- Every factual claim must be traceable to the source material in the user message. If you cannot ground a claim, cut it or soften it to a general statement.
- Do not repeat any concept in the "already covered concepts" list. Those decks already exist, and the user must never feel they are seeing the same topic again.

Reply with ONLY a single JSON object. No markdown fences, no commentary. Schema:
{
  "deck_index": <integer>,
  "topic": "<topic-slug>",
  "difficulty": "fundamentals | intermediate | advanced",
  "cards": [
    {
      "order_index": <integer 0-9>,
      "template": "text_only | text_code | text_diagram",
      "title": "string, at most 8 words",
      "body": "string, 100 to 200 words",
      "code_snippet": "string or null",
      "diagram_ref": "string or null",
      "concept": "short noun phrase naming the single concept this card teaches, used for de-duplication across decks"
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

export function buildGenerationMessages(topicSlug, deckIndex, sources, manifest) {
  const difficulty = difficultyForDeckIndex(deckIndex);
  const user = `Topic: ${topicSlug}
Deck index: ${deckIndex}
Difficulty: ${difficulty} (assumes all lower decks are already known to the reader)

${coverageContext(manifest)}

Source material to ground every claim:
${sourceBlock(sources)}`;

  return [
    { role: "system", content: GENERATION_SYSTEM },
    { role: "user", content: user },
  ];
}

const VALIDATION_SYSTEM = `You are the validation pass for a content pipeline. Your job is to judge a draft deck, not to rewrite it. Given the draft, the same source material used in generation, and the list of prior deck titles, output pass/fail per card with a short reason.

Checklist, judge each card against all of these:
1. Every factual claim traces to the provided source material.
2. No concept overlaps with the prior deck titles for this topic.
3. Title is specific, not generic or teaser-style.
4. Template matches the content needs: text_diagram only when a diagram meaningfully helps, text_code only when a snippet clarifies, otherwise text_only.
5. The deck reads as a coherent progression, not 10 unrelated facts.

Note: automated checks (no em dashes, no emojis, word count 100-200, schema shape) already ran separately and passed. Do not re-check those.

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
