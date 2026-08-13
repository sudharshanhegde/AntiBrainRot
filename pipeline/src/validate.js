import "./env.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "./coverage.js";
import { validateDeck } from "./deckWorkflow.js";

// Pass 2 CLI: node src/validate.js <topic-slug> <deck-index> [--dry-run]
function usage() {
  console.error("Usage: node src/validate.js <topic-slug> <deck-index> [--dry-run]");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [topicSlug, deckIndexArg] = args.filter((a) => a !== "--dry-run");
  const deckIndex = Number(deckIndexArg);
  if (!topicSlug || !Number.isInteger(deckIndex) || deckIndex < 0) usage();

  const draftPath = join(ROOT, "generated", `${topicSlug}-deck-${deckIndex}.json`);
  let draft;
  try {
    draft = JSON.parse(await readFile(draftPath, "utf8"));
  } catch {
    console.error(`Draft not found at ${draftPath}. Run generation first.`);
    process.exit(1);
  }

  const result = await validateDeck(topicSlug, deckIndex, draft, { dryRun });
  if (result.ok) {
    console.log(`Deck promoted to ${result.reviewedPath}`);
    console.log(`Coverage updated for ${topicSlug}.`);
  } else {
    console.error("Validation FAILED. Send back for regeneration:");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
