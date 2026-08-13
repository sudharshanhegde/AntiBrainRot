import "./env.js";
import { generateDeck } from "./deckWorkflow.js";

// Pass 1 CLI: node src/generate.js <topic-slug> <deck-index> [--dry-run]
function usage() {
  console.error("Usage: node src/generate.js <topic-slug> <deck-index> [--dry-run]");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [topicSlug, deckIndexArg] = args.filter((a) => a !== "--dry-run");
  const deckIndex = Number(deckIndexArg);
  if (!topicSlug || !Number.isInteger(deckIndex) || deckIndex < 0) usage();

  try {
    const result = await generateDeck(topicSlug, deckIndex, { dryRun });
    if (result.dryRun) {
      console.log(`Dry run. Prompt written to ${result.promptPath}`);
    } else {
      console.log(`Draft written to ${result.draftPath}`);
      console.log(
        `Cards: ${result.draft.cards.length}. Next: npm run validate -- ${topicSlug} ${deckIndex}`
      );
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
