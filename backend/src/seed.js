import "./env.js";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";

// Seeds topics and inserts reviewed decks from the pipeline into the
// database. Run after the pipeline has produced reviewed decks:
//   npm run seed
// Usage: node src/seed.js

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEWED_DIR = join(__dirname, "..", "..", "pipeline", "reviewed");

const TOPICS = [
  {
    slug: "operating-systems",
    name: "Operating Systems",
    accent: "accent-os",
    blurb: "Processes, memory, scheduling, and the syscalls that tie them together.",
  },
  {
    slug: "computer-networks",
    name: "Computer Networks",
    accent: "accent-net",
    blurb: "Packets, protocols, and how data crosses the wire in practice.",
  },
  {
    slug: "data-structures",
    name: "Data Structures",
    accent: "accent-dsa",
    blurb: "The shapes data takes in memory and the cost of each choice.",
  },
  {
    slug: "system-design",
    name: "System Design",
    accent: "accent-sys",
    blurb: "Scaling, caching, and the tradeoffs behind real systems.",
  },
  {
    slug: "databases",
    name: "Databases",
    accent: "accent-db",
    blurb: "Storage, indexing, and transactions under the hood.",
  },
  {
    slug: "network-security",
    name: "Network Security",
    accent: "accent-sec",
    blurb: "Threats, cryptography, and how data stays safe on the wire.",
  },
  {
    slug: "network-protocols",
    name: "Network Protocols",
    accent: "accent-proto",
    blurb: "The layered stack behind every packet, frame by frame.",
  },
  {
    slug: "quantitative-aptitude",
    name: "Quantitative Aptitude",
    accent: "accent-apt",
    blurb: "The math and reasoning problems asked in interviews and aptitude tests.",
  },
];

async function upsertTopic(t) {
  const { rows } = await query(
    `insert into topics (name, slug, accent, blurb)
     values ($1, $2, $3, $4)
     on conflict (slug) do update set
       name = excluded.name,
       accent = excluded.accent,
       blurb = excluded.blurb
     returning id`,
    [t.name, t.slug, t.accent, t.blurb]
  );
  return rows[0].id;
}

async function insertDeck(topicId, deck) {
  const { rows } = await query(
    `insert into decks (topic_id, deck_index, difficulty, generated_at, reviewed_at)
     values ($1, $2, $3, now(), now())
     on conflict (topic_id, deck_index) do update set
       difficulty = excluded.difficulty,
       reviewed_at = now()
     returning id`,
    [topicId, deck.deck_index, deck.difficulty]
  );
  const deckId = rows[0].id;

  for (const card of deck.cards) {
    // Quiz cards use the quiz columns and leave the
    // concept-only fields empty; concept cards keep the existing
    // template/title/body layout. options is serialized for the jsonb
    // column. Reviewed decks predating the feature have no type and are
    // inserted as concept cards (the column default).
    const isQuiz = card.type === "quiz";
    await query(
      `insert into cards
         (deck_id, order_index, type, template, title, body, code_snippet, diagram_ref, concept,
          question, options, correct_option_id, tests_card_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (deck_id, order_index) do update set
         type = excluded.type,
         template = excluded.template,
         title = excluded.title,
         body = excluded.body,
         code_snippet = excluded.code_snippet,
         diagram_ref = excluded.diagram_ref,
         concept = excluded.concept,
         question = excluded.question,
         options = excluded.options,
         correct_option_id = excluded.correct_option_id,
         tests_card_id = excluded.tests_card_id`,
      [
        deckId,
        card.order_index,
        isQuiz ? "quiz" : "concept",
        isQuiz ? "" : card.template,
        isQuiz ? "" : card.title,
        isQuiz ? "" : card.body,
        isQuiz ? null : card.code_snippet,
        isQuiz ? null : card.diagram_ref,
        isQuiz ? null : card.concept,
        isQuiz ? card.question : null,
        isQuiz ? JSON.stringify(card.options) : null,
        isQuiz ? card.correct_option_id : null,
        isQuiz ? card.tests_card_id : null,
      ]
    );
  }
}

async function main() {
  const topicIds = {};
  for (const t of TOPICS) {
    topicIds[t.slug] = await upsertTopic(t);
  }
  console.log(`Seeded ${TOPICS.length} topics.`);

  let files = [];
  try {
    files = await readdir(REVIEWED_DIR);
  } catch {
    console.warn(`No reviewed deck directory at ${REVIEWED_DIR}.`);
  }

  let inserted = 0;
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const match = file.match(/^(.*)-deck-(\d+)\.json$/);
    if (!match) continue;
    const [, slug] = match;
    const topicId = topicIds[slug];
    if (!topicId) {
      console.warn(`Skipping ${file}: unknown topic ${slug}`);
      continue;
    }
    const deck = JSON.parse(await readFile(join(REVIEWED_DIR, file), "utf8"));
    await insertDeck(topicId, deck);
    console.log(
      `Inserted ${slug} deck ${deck.deck_index} (${deck.cards.length} cards)`
    );
    inserted += 1;
  }

  console.log(`Done. ${inserted} decks inserted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
