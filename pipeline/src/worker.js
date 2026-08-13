import "./env.js";
import { TOPICS } from "./catalog.js";
import { createManifest, nextDeckIndex, readCoverage } from "./coverage.js";
import { generateDeck, validateDeck } from "./deckWorkflow.js";

// The automated content worker.
//
// It reads the topic catalog and, for each topic, reads that topic's
// coverage manifest to learn the current depth. It never guesses what
// exists: it generates only the next uncovered deck (plus a lookahead),
// validates it in a separate pass, and publishes it straight into the
// backend via POST /api/decks. Run once with --once, or let it loop on
// a schedule (default every 24h) to refresh content daily.
//
// Usage:
//   npm run worker:once -- --topic computer-networks   # one deck, one topic
//   npm run worker:once -- --lookahead=2               # keep 2 decks ahead
//   npm run worker:once -- --dry-run                   # prompts only, no cost
//   npm run worker                                     # loop on schedule

const RUN_INTERVAL_MS = Number(process.env.RUN_INTERVAL_MS || 24 * 60 * 60 * 1000);
const DECK_BUDGET = Number(process.env.DECK_BUDGET || 5);
const LOOKAHEAD = Number(process.env.LOOKAHEAD || 1);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 2);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

function parseArgs() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--")).join(",");
  const topics = positional
    ? positional.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const flagNum = (name, fallback) => {
    const found = args.find((a) => a.startsWith(`--${name}=`));
    return found ? Number(found.split("=")[1]) : fallback;
  };
  return {
    once: args.includes("--once"),
    dryRun: args.includes("--dry-run"),
    lookahead: flagNum("lookahead", LOOKAHEAD),
    budget: flagNum("budget", DECK_BUDGET),
    topics,
  };
}

async function publishDeck(topicSlug, deck) {
  const res = await fetch(`${BACKEND_URL}/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic_slug: topicSlug, deck }),
  });
  if (!res.ok) {
    throw new Error(`publish failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

async function runCycle({ dryRun, lookahead, budget, topics }) {
  const scope = topics.length
    ? TOPICS.filter((t) => topics.includes(t.slug))
    : TOPICS;
  if (scope.length === 0) {
    console.error(`No topics matched: ${topics.join(", ")}`);
    return;
  }

  let generated = 0;
  for (const topic of scope) {
    if (generated >= budget) break;

    let manifest = await readCoverage(topic.slug);
    if (!manifest) manifest = createManifest(topic.slug);

    const start = nextDeckIndex(manifest); // first deck not yet covered
    const end = start + 1 + lookahead; // keep `lookahead` decks ahead
    for (let deckIndex = start; deckIndex < end; deckIndex++) {
      if (generated >= budget) break;

      if (dryRun) {
        console.log(`[${topic.slug}] dry-run: would generate deck ${deckIndex}`);
        try {
          await generateDeck(topic.slug, deckIndex, { dryRun: true });
          generated++;
        } catch (err) {
          console.error(`  ${err.message}`);
        }
        continue;
      }

      console.log(`[${topic.slug}] generating deck ${deckIndex}...`);
      let feedback = "";
      let done = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
        try {
          const g = await generateDeck(topic.slug, deckIndex, { dryRun: false, feedback });
          const v = await validateDeck(topic.slug, deckIndex, g.draft, { dryRun: false });
          if (v.ok) {
            await publishDeck(topic.slug, g.draft);
            console.log(`  published ${topic.slug} deck ${deckIndex} (${g.draft.cards.length} cards)`);
            generated++;
            done = true;
          } else {
            feedback = `- ${v.errors.join("\n- ")}`;
            console.log(`  validation failed (attempt ${attempt}): ${v.errors.length} issue(s)`);
            if (attempt < MAX_ATTEMPTS) console.log(`  regenerating with feedback...`);
          }
        } catch (err) {
          console.error(`  error: ${err.message}`);
          if (err.code === "NO_SOURCES") break;
          if (attempt === MAX_ATTEMPTS) {
            console.error(`  giving up on ${topic.slug} deck ${deckIndex}`);
          }
        }
      }
    }
  }
  console.log(`Cycle done. ${generated} deck(s) generated/published.`);
}

async function main() {
  const opts = parseArgs();
  if (opts.dryRun) {
    console.log("DRY RUN: prompts written only, no DeepSeek calls, no inserts.");
  }
  await runCycle(opts);
  if (opts.once) return;
  console.log(`Worker looping. Next run in ~${Math.round(RUN_INTERVAL_MS / 3600000)}h. Ctrl+C to stop.`);
  setInterval(() => runCycle(opts).catch((err) => console.error(err)), RUN_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
