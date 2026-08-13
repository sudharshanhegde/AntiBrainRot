import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../db.js";
import { chat } from "./deepseek.js";
import { checkDeck } from "./checks.js";
import {
  buildGenerationMessages,
  buildValidationMessages,
  difficultyForDeckIndex,
} from "./prompts.js";
import { insertReviewedDeck } from "./insert.js";
import { loadSources } from "./sources.js";

// The automated daily generation job.
//
// Reads pipeline/topics_queue.md and syncs it into the topics table.
// Each daily run generates one new deck for EVERY topic in the queue
// that is not yet complete, so every topic advances one deck per day
// and always has the next deck ready for users. Decks are generated
// from DeepSeek's own knowledge with a self-check validation pass. On
// success a deck is published in one transaction with its concept
// labels, decks_generated increments, and the topic is marked complete
// when it reaches target_decks. Max 2 attempts per deck (one generation
// + one retry). Every attempt is logged to generation_runs; failures
// also alert the failure webhook.

const MAX_ATTEMPTS = 2; // one generation + one retry, hard cap
const DAILY_CALL_LIMIT = Number(process.env.DAILY_CALL_LIMIT || 30);
const DEFAULT_TARGET_DECKS = Number(process.env.DEFAULT_TARGET_DECKS || 18);

// Per-topic deck targets. Deep topics need far more than a few days, so
// each topic gets a target sized to how long it takes to cover properly.
// A topic is marked complete only once it reaches its target. Tune these
// freely; DEFAULT_TARGET_DECKS is the fallback for unknown slugs.
const TARGET_BY_SLUG = {
  "data-structures": 200,
  "operating-systems": 150,
  "computer-networks": 120,
  databases: 120,
  "system-design": 120,
};

function targetFor(slug) {
  return TARGET_BY_SLUG[slug] || DEFAULT_TARGET_DECKS;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, "..", "..", "..", "pipeline", "topics_queue.md");

function sameUtcDay(a, b) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function sendFailureAlert(payload) {
  const url = process.env.FAILURE_WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `AntiBrainRot pipeline failure: ${payload.topic_slug} deck ${payload.deck_index} - ${payload.reason}`,
      ...payload,
    }),
  }).catch((err) => console.error("could not send failure webhook:", err.message));
}

async function logRun({ topicId, topicSlug, deckIndex, status, reason, tokens }) {
  try {
    await query(
      `insert into generation_runs (topic_id, topic_slug, deck_index, status, failure_reason, tokens_used)
       values ($1, $2, $3, $4, $5, $6)`,
      [topicId, topicSlug, deckIndex, status, reason || null, tokens || null]
    );
  } catch (err) {
    console.error("could not log generation run:", err.message);
  }
}

// Syncs the queue file into the topics table. New slugs are inserted as
// pending with target_decks and their line position; existing topics
// only get their line position refreshed so progress is preserved.
export async function syncQueue() {
  let lines = [];
  try {
    lines = (await readFile(QUEUE_FILE, "utf8"))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    console.warn(`topics_queue.md not found at ${QUEUE_FILE}`);
  }

  for (let i = 0; i < lines.length; i++) {
    const slug = lines[i];
    const deckCount = await query(
      "select count(*)::int as n from decks d join topics t on t.id = d.topic_id where t.slug = $1",
      [slug]
    );
    // Reconcile decks_generated against the actual deck count and the
    // target on every run so the counter never drifts from what is live.
    // A topic whose count reached its target is marked complete.
    const target = targetFor(slug);
    await query(
      `insert into topics (slug, name, queue_position, status, decks_generated, target_decks)
       values ($1, $1, $2, 'pending', $3, $4)
       on conflict (slug) do update set
         queue_position = $2,
         decks_generated = $3,
         target_decks = $4,
         status = case when $3 >= $4 then 'complete' else topics.status end`,
      [slug, i, deckCount.rows[0].n, target]
    );
  }
}

// Generates, validates, and publishes one deck for one topic. `state`
// holds the run-wide DeepSeek call counter and token total so the cost
// cap applies across all topics in the run.
async function generateOneDeck(
  { topicSlug, topicId, deckIndex, coveredConcepts, priorTitles, sources, targetDeckCount },
  state
) {
  let feedback = "";
  let lastError = "unknown failure";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (state.calls >= DAILY_CALL_LIMIT) {
      const reason = "daily DeepSeek call limit exceeded";
      await logRun({ topicId, topicSlug, deckIndex, status: "aborted", reason, tokens: state.totalTokens });
      sendFailureAlert({ topic_slug: topicSlug, deck_index: deckIndex, reason });
      return { status: "aborted", topic_slug: topicSlug, deck_index: deckIndex, reason };
    }

    const messages = buildGenerationMessages(topicSlug, deckIndex, coveredConcepts, priorTitles, sources);
    if (feedback) {
      messages[1].content += `\n\nA previous attempt at this deck was rejected. Fix these issues:\n${feedback}`;
    }

    // Pass 1: generate.
    let draft;
    try {
      state.calls++;
      const gen = await chat(messages, { temperature: 0.2, json: true });
      state.totalTokens += gen.tokens;
      draft = JSON.parse(gen.content);
      draft.deck_index = deckIndex;
      draft.topic = topicSlug;
      draft.difficulty = draft.difficulty || difficultyForDeckIndex(deckIndex);
    } catch (err) {
      lastError = `generation error: ${err.message}`;
      console.error(`[generate] ${topicSlug} deck ${deckIndex} attempt ${attempt}: ${lastError}`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    // Automated hard gates.
    const auto = checkDeck(draft);
    if (!auto.ok) {
      lastError = auto.errors.join("; ");
      feedback = auto.errors.map((e) => `- ${e}`).join("\n");
      console.error(`[generate] ${topicSlug} deck ${deckIndex} attempt ${attempt}: automated checks failed`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    // Pass 2: LLM validation, separate DeepSeek call with clean context.
    if (state.calls >= DAILY_CALL_LIMIT) {
      const reason = "daily DeepSeek call limit exceeded";
      await logRun({ topicId, topicSlug, deckIndex, status: "aborted", reason, tokens: state.totalTokens });
      sendFailureAlert({ topic_slug: topicSlug, deck_index: deckIndex, reason });
      return { status: "aborted", topic_slug: topicSlug, deck_index: deckIndex, reason };
    }
    let verdict;
    try {
      state.calls++;
      const vres = await chat(
        buildValidationMessages(topicSlug, deckIndex, draft, coveredConcepts, priorTitles, sources),
        { temperature: 0, json: true }
      );
      state.totalTokens += vres.tokens;
      verdict = JSON.parse(vres.content);
    } catch (err) {
      lastError = `validation error: ${err.message}`;
      console.error(`[generate] ${topicSlug} deck ${deckIndex} attempt ${attempt}: ${lastError}`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    if (verdict.verdict !== "pass") {
      const reasons = (verdict.cards || [])
        .filter((c) => !c.pass)
        .map((c) => `card ${c.order_index}: ${c.reason || "no reason"}`);
      if (verdict.notes) reasons.push(`notes: ${verdict.notes}`);
      lastError = reasons.join("; ");
      feedback = reasons.map((r) => `- ${r}`).join("\n");
      console.error(`[generate] ${topicSlug} deck ${deckIndex} attempt ${attempt}: validation failed`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    // Publish in one transaction (deck + cards + covered_concepts).
    try {
      await insertReviewedDeck(topicSlug, draft);
    } catch (err) {
      lastError = `insert error: ${err.message}`;
      console.error(`[generate] insert error: ${lastError}`);
      break;
    }

    // Advance the topic: increment decks_generated, mark complete at target.
    await query(
      `update topics set
         decks_generated = decks_generated + 1,
         status = case when decks_generated + 1 >= target_decks then 'complete' else status end
       where slug = $1`,
      [topicSlug]
    );

    await logRun({ topicId, topicSlug, deckIndex, status: "success", tokens: state.totalTokens });
    console.log(`[generate] published ${topicSlug} deck ${deckIndex} (${draft.cards.length} cards)`);
    return {
      status: "success",
      topic_slug: topicSlug,
      deck_index: deckIndex,
      decks_generated: deckIndex + 1,
      target_decks: targetDeckCount,
      cards: draft.cards.length,
      tokens: state.totalTokens,
    };
  }

  // Both attempts failed: log with full detail and alert, never publish.
  await logRun({ topicId, topicSlug, deckIndex, status: "failure", reason: lastError, tokens: state.totalTokens });
  sendFailureAlert({ topic_slug: topicSlug, deck_index: deckIndex, reason: lastError, tokens: state.totalTokens });
  return { status: "failure", topic_slug: topicSlug, deck_index: deckIndex, reason: lastError, tokens: state.totalTokens };
}

export async function runDailyJob({ dryRun = false, force = false, topics = [] } = {}) {
  // Daily guard: one run per day (idempotent for the cron trigger).
  // force=1 bypasses it for on-demand runs (still requires the secret).
  if (!force) {
    const lastRun = await query(
      "select ran_at from generation_runs order by ran_at desc limit 1"
    );
    if (lastRun.rows[0] && sameUtcDay(new Date(lastRun.rows[0].ran_at), new Date())) {
      return { status: "already-ran", message: "a generation run already happened today" };
    }
  }

  await syncQueue();
  const activeRes = await query(
    "select slug, target_decks, decks_generated from topics where status <> 'complete' order by queue_position"
  );
  // Optional topic filter (comma-separated slugs) so an on-demand run can
  // generate for one topic quickly instead of all of them.
  let activeRows = activeRes.rows;
  if (topics.length > 0) {
    activeRows = activeRows.filter((t) => topics.includes(t.slug));
  }
  if (activeRows.length === 0) {
    return { status: "all-complete", message: "no matching active topics" };
  }

  const state = { calls: 0, totalTokens: 0 };
  const results = [];

  for (const t of activeRows) {
    if (state.calls >= DAILY_CALL_LIMIT) {
      results.push({ status: "skipped", topic_slug: t.slug, reason: "daily DeepSeek call limit reached" });
      continue;
    }

    const topicId = (await query("select id from topics where slug = $1", [t.slug])).rows[0].id;
    const deckIndex = t.decks_generated;

    const covRes = await query(
      "select concept_label from covered_concepts where topic_id = $1 order by covered_at",
      [topicId]
    );
    const coveredConcepts = covRes.rows.map((r) => r.concept_label);

    const titlesRes = await query(
      `select c.title from cards c
         join decks d on d.id = c.deck_id
        where d.topic_id = $1
        order by d.deck_index, c.order_index`,
      [topicId]
    );
    const priorTitles = titlesRes.rows.map((r) => r.title);

    const sources = await loadSources(t.slug);
    console.log(`[generate] daily job: topic=${t.slug} deck=${deckIndex} (${t.decks_generated}/${t.target_decks})`);

    if (dryRun) {
      results.push({
        status: "dry-run",
        topic_slug: t.slug,
        deck_index: deckIndex,
        mode: sources.length > 0 ? "grounded" : "self-knowledge",
      });
      continue;
    }

    const result = await generateOneDeck(
      { topicSlug: t.slug, topicId, deckIndex, coveredConcepts, priorTitles, sources, targetDeckCount: t.target_decks },
      state
    );
    results.push(result);
  }

  return { status: "success", results };
}
