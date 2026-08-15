import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "./deepseek.js";
import {
  createManifest,
  readCoverage,
  recordReviewedDeck,
  writeCoverage,
  ROOT,
} from "./coverage.js";
import { checkDeck } from "./checks.js";
import {
  buildGenerationMessages,
  buildValidationMessages,
  difficultyForDeckIndex,
} from "./prompts.js";

// Shared, programmatic deck generation and validation. The CLI scripts
// (generate.js, validate.js) and the automated worker both call into
// this module, so the two-pass rules live in one place.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(ROOT, "sources");
export const GENERATED_DIR = join(ROOT, "generated");
export const REVIEWED_DIR = join(ROOT, "reviewed");
// Manual quiz overrides (SKILL_quiz.md): one file per card at
// manual_quizzes/<topic>/<deck_index>/<card_order_index>.json, same
// quiz schema. When a file exists, that quiz card is used as-is and no
// generation happens for it.
const MANUAL_QUIZ_DIR = join(ROOT, "manual_quizzes");
const SOURCE_CHAR_CAP = 6000;
const TOTAL_SOURCE_CAP = 24000;

export async function loadSources(topicSlug) {
  let files;
  try {
    files = await readdir(join(SOURCES_DIR, topicSlug));
  } catch {
    return [];
  }
  const sources = [];
  let total = 0;
  for (const file of files) {
    if (file === "README.md") continue;
    const text = await readFile(join(SOURCES_DIR, topicSlug, file), "utf8");
    const capped = text.slice(0, SOURCE_CHAR_CAP);
    sources.push({ name: `sources/${topicSlug}/${file}`, text: capped });
    total += capped.length;
    if (total > TOTAL_SOURCE_CAP) break;
  }
  return sources;
}

// Loads hand-written quiz cards for a deck (SKILL_quiz.md). Returns a
// Map of order_index -> quiz card. A file at
// manual_quizzes/<topic>/<deck_index>/<order_index>.json is used as-is:
// the deck's generated quiz at that slot is replaced with it, so that
// card never depends on the LLM. order_index and tests_card_id are
// pinned to the slot so the file stays consistent even if hand-typed.
export async function loadManualQuizzes(topicSlug, deckIndex) {
  const dir = join(MANUAL_QUIZ_DIR, topicSlug, String(deckIndex));
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return new Map();
  }
  const manual = new Map();
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const orderIndex = Number(file.replace(/\.json$/, ""));
    if (!Number.isInteger(orderIndex)) continue;
    try {
      const quiz = JSON.parse(await readFile(join(dir, file), "utf8"));
      quiz.order_index = orderIndex;
      quiz.type = "quiz";
      quiz.tests_card_id = orderIndex - 1; // always the preceding concept
      manual.set(orderIndex, quiz);
    } catch (err) {
      console.warn(`[manual_quiz] could not read ${join(dir, file)}: ${err.message}`);
    }
  }
  return manual;
}

// Applies the manual quiz overrides to a generated draft and normalizes
// the alternating concept/quiz layout so order_index matches the array
// position (0-19), which the automated checks rely on.
export function applyManualQuizzes(draft, manualQuizzes) {
  for (const card of draft.cards || []) {
    if (!card.type) card.type = "concept";
  }
  if (manualQuizzes && manualQuizzes.size > 0) {
    for (const [orderIndex, quiz] of manualQuizzes) {
      const idx = (draft.cards || []).findIndex((c) => c.order_index === orderIndex);
      if (idx !== -1) {
        draft.cards[idx] = quiz;
      } else {
        draft.cards.splice(orderIndex, 0, quiz);
      }
    }
  }
  draft.cards.sort((a, b) => a.order_index - b.order_index);
  return draft;
}

// Pass 1. Returns { dryRun, draft, draftPath } or { dryRun, promptPath }.
// feedback (optional) appends rejected-attempt reasons so a regeneration
// fixes them instead of repeating the same mistakes.
export async function generateDeck(topicSlug, deckIndex, { dryRun = false, feedback = "" } = {}) {
  const sources = await loadSources(topicSlug);
  if (sources.length === 0) {
    const err = new Error(
      `No source material for ${topicSlug}. Add curated sources to ${join(SOURCES_DIR, topicSlug)} first.`
    );
    err.code = "NO_SOURCES";
    throw err;
  }

  let manifest = await readCoverage(topicSlug);
  if (!manifest) manifest = createManifest(topicSlug);

  // Hand-written quiz cards override whatever the model would produce for
  // those slots (SKILL_quiz.md manual override path).
  const manualQuizzes = await loadManualQuizzes(topicSlug, deckIndex);

  const messages = buildGenerationMessages(topicSlug, deckIndex, sources, manifest, manualQuizzes);
  if (feedback) {
    messages[1].content +=
      `\n\nA previous attempt at this deck was rejected. Fix these issues:\n${feedback}`;
  }

  await mkdir(GENERATED_DIR, { recursive: true });
  const draftPath = join(GENERATED_DIR, `${topicSlug}-deck-${deckIndex}.json`);

  if (dryRun) {
    const promptPath = join(
      GENERATED_DIR,
      `${topicSlug}-deck-${deckIndex}.prompt.txt`
    );
    await writeFile(
      promptPath,
      messages.map((m) => `==== ${m.role.toUpperCase()} ====\n${m.content}`).join("\n\n"),
      "utf8"
    );
    return { dryRun: true, promptPath };
  }

  const raw = await chat(messages, { temperature: 0.2, json: true });
  let deck;
  try {
    deck = JSON.parse(raw);
  } catch {
    const err = new Error(`Model output was not valid JSON: ${raw.slice(0, 500)}`);
    throw err;
  }

  deck.deck_index = deckIndex;
  deck.topic = deck.topic || topicSlug;
  deck.difficulty = deck.difficulty || difficultyForDeckIndex(deckIndex);
  applyManualQuizzes(deck, manualQuizzes);

  await writeFile(draftPath, JSON.stringify(deck, null, 2) + "\n", "utf8");
  return { dryRun: false, draft: deck, draftPath };
}

// Pass 2. Returns { ok, errors, reviewedPath }. On success the deck is
// promoted to reviewed/ and the topic's coverage manifest is updated.
export async function validateDeck(topicSlug, deckIndex, draft, { dryRun = false } = {}) {
  const auto = checkDeck(draft);
  if (!auto.ok) {
    return { ok: false, errors: auto.errors };
  }

  const sources = await loadSources(topicSlug);
  let manifest = await readCoverage(topicSlug);
  if (!manifest) manifest = createManifest(topicSlug);
  const messages = buildValidationMessages(topicSlug, deckIndex, draft, sources, manifest);

  if (dryRun) {
    console.log(
      messages.map((m) => `==== ${m.role.toUpperCase()} ====\n${m.content}`).join("\n\n")
    );
    return { ok: false, errors: ["dry run: validation messages printed, not judged"] };
  }

  const raw = await chat(messages, { temperature: 0, json: true });
  let verdict;
  try {
    verdict = JSON.parse(raw);
  } catch {
    return { ok: false, errors: [`validator output was not JSON: ${raw.slice(0, 500)}`] };
  }

  if (verdict.verdict !== "pass") {
    const errors = (verdict.cards || [])
      .filter((c) => !c.pass)
      .map((c) => `card ${c.order_index}: ${c.reason || "no reason"}`);
    if (verdict.notes) errors.push(`notes: ${verdict.notes}`);
    return { ok: false, errors };
  }

  await mkdir(REVIEWED_DIR, { recursive: true });
  const reviewedPath = join(REVIEWED_DIR, `${topicSlug}-deck-${deckIndex}.json`);
  await writeFile(reviewedPath, JSON.stringify(draft, null, 2) + "\n", "utf8");

  recordReviewedDeck(manifest, draft);
  await writeCoverage(topicSlug, manifest);

  return { ok: true, reviewedPath };
}
