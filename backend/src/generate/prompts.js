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
      "body": "string, 110 to 180 words",
      "code_snippet": "string or null",
      "diagram_ref": "string or null",
      "concept": "short noun phrase naming the single concept this card teaches, used for de-duplication across decks"
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

export function buildGenerationMessages(topicSlug, deckIndex, coveredConcepts, priorTitles, sources) {
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

${sourceSection}`;

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

Note: automated checks (no em dashes, no emojis, word count, schema shape) already ran separately and passed. Do not re-check those.

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

Note: automated checks (no em dashes, no emojis, word count, schema shape) already ran separately and passed. Do not re-check those.

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
