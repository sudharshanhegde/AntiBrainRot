import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Per-topic coverage registry. Each topic keeps a manifest in
// coverage/<topic_slug>/manifest.json recording every reviewed deck,
// the concepts covered, and the depth reached. Generation reads it to
// avoid repeats; validation updates it only when a deck passes review.

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");
export const COVERAGE_DIR = join(ROOT, "coverage");

function manifestPath(topicSlug) {
  return join(COVERAGE_DIR, topicSlug, "manifest.json");
}

// Returns the parsed manifest for a topic, or null if none exists.
export async function readCoverage(topicSlug) {
  try {
    const raw = await readFile(manifestPath(topicSlug), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCoverage(topicSlug, manifest) {
  const dir = join(COVERAGE_DIR, topicSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    manifestPath(topicSlug),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
}

export function createManifest(topicSlug) {
  return {
    topic_slug: topicSlug,
    updated_at: new Date().toISOString(),
    depth_reached: -1,
    decks: [],
    covered_concepts: [],
  };
}

// The flattened list of already-covered concepts, used in generation
// prompts so the LLM does not repeat prior decks.
export function coveredConceptList(manifest) {
  return manifest && Array.isArray(manifest.covered_concepts)
    ? manifest.covered_concepts
    : [];
}

// How deep the topic has been explored: the highest reviewed deck index.
// The next deck to generate is depth_reached + 1.
export function nextDeckIndex(manifest) {
  const depth = manifest && Number.isInteger(manifest.depth_reached)
    ? manifest.depth_reached
    : -1;
  return depth + 1;
}

// Records a reviewed deck into the manifest, recomputing depth_reached
// and the flattened covered-concept list. Returns the updated manifest.
// Only concept cards register titles and concepts; quiz cards have no
// title or concept and must not pollute the
// overlap context or the coverage registry.
export function recordReviewedDeck(manifest, deck) {
  const decks = (manifest.decks || []).filter(
    (d) => d.deck_index !== deck.deck_index
  );
  const conceptCards = (deck.cards || []).filter((c) => c.type !== "quiz");
  decks.push({
    deck_index: deck.deck_index,
    difficulty: deck.difficulty,
    card_titles: conceptCards.map((c) => c.title),
    concepts: conceptCards.map((c) => c.concept || c.title),
    reviewed_at: new Date().toISOString(),
  });
  decks.sort((a, b) => a.deck_index - b.deck_index);

  const covered = decks.flatMap((d) => d.concepts || []);
  manifest.decks = decks;
  manifest.depth_reached = decks.length ? decks[decks.length - 1].deck_index : -1;
  manifest.covered_concepts = [...new Set(covered)];
  manifest.updated_at = new Date().toISOString();
  return manifest;
}
