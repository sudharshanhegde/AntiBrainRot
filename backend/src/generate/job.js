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

// The automated daily generation job (SKILL_pipeline.md +
// SKILL_topic_queue.md).
//
// Reads pipeline/topics_queue.md and syncs it into the topics table
// (new slugs get status=pending, target_decks=18, their line position).
// The active topic is the lowest incomplete entry in the file. One deck
// (10 cards) is generated per run: grounded on curated sources when they
// exist, otherwise from DeepSeek's own knowledge with a self-check
// validation pass. On success the deck is published in one transaction
// with its concept labels, decks_generated increments, and the topic is
// marked complete when it reaches target_decks. Max 2 attempts (one
// generation + one retry). Every run is logged to generation_runs;
// failures also alert the failure webhook.

const MAX_ATTEMPTS = 2; // one generation + one retry, hard cap
const DAILY_CALL_LIMIT = Number(process.env.DAILY_CALL_LIMIT || 10);
const DEFAULT_TARGET_DECKS = Number(process.env.DEFAULT_TARGET_DECKS || 18);

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
async function syncQueue() {
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
    // Reconcile decks_generated against the actual deck count on every
    // run so the counter never drifts from what is live. A topic whose
    // count reached its target is marked complete.
    await query(
      `insert into topics (slug, name, queue_position, status, decks_generated, target_decks)
       values ($1, $1, $2, 'pending', $3, $4)
       on conflict (slug) do update set
         queue_position = $2,
         decks_generated = $3,
         status = case when $3 >= topics.target_decks then 'complete' else topics.status end`,
      [slug, i, deckCount.rows[0].n, DEFAULT_TARGET_DECKS]
    );
  }
}

// The active topic: the lowest incomplete entry in the queue file.
async function pickActiveTopic() {
  const res = await query(
    "select slug, target_decks, decks_generated from topics where status <> 'complete' order by queue_position desc limit 1"
  );
  return res.rows[0] || null;
}

export async function runDailyJob({ dryRun = false } = {}) {
  // Daily guard: one run per day (idempotent for the cron trigger).
  const lastRun = await query(
    "select ran_at from generation_runs order by ran_at desc limit 1"
  );
  if (lastRun.rows[0] && sameUtcDay(new Date(lastRun.rows[0].ran_at), new Date())) {
    return { status: "already-ran", message: "a generation run already happened today" };
  }

  await syncQueue();
  const topic = await pickActiveTopic();
  if (!topic) {
    return { status: "all-complete", message: "all queued topics are complete" };
  }

  const topicSlug = topic.slug;
  const deckIndex = topic.decks_generated; // next deck to generate
  console.log(`[generate] daily job: topic=${topicSlug} deck=${deckIndex} (${topic.decks_generated}/${topic.target_decks})`);

  const topicRes = await query("select id from topics where slug = $1", [topicSlug]);
  const topicId = topicRes.rows[0].id;

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

  const sources = await loadSources(topicSlug);

  if (dryRun) {
    const messages = buildGenerationMessages(topicSlug, deckIndex, coveredConcepts, priorTitles, sources);
    return {
      status: "dry-run",
      topic_slug: topicSlug,
      deck_index: deckIndex,
      mode: sources.length > 0 ? "grounded" : "self-knowledge",
      messages,
    };
  }

  let totalTokens = 0;
  let calls = 0;
  let feedback = "";
  let lastError = "unknown failure";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (calls >= DAILY_CALL_LIMIT) {
      const reason = "daily DeepSeek call limit exceeded";
      await logRun({ topicId, topicSlug, deckIndex, status: "aborted", reason, tokens: totalTokens });
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
      calls++;
      const gen = await chat(messages, { temperature: 0.2, json: true });
      totalTokens += gen.tokens;
      draft = JSON.parse(gen.content);
      draft.deck_index = deckIndex;
      draft.topic = topicSlug;
      draft.difficulty = draft.difficulty || difficultyForDeckIndex(deckIndex);
    } catch (err) {
      lastError = `generation error: ${err.message}`;
      console.error(`[generate] attempt ${attempt}: ${lastError}`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    // Automated hard gates.
    const auto = checkDeck(draft);
    if (!auto.ok) {
      lastError = auto.errors.join("; ");
      feedback = auto.errors.map((e) => `- ${e}`).join("\n");
      console.error(`[generate] attempt ${attempt}: automated checks failed`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    // Pass 2: LLM validation, separate DeepSeek call with clean context.
    if (calls >= DAILY_CALL_LIMIT) {
      const reason = "daily DeepSeek call limit exceeded";
      await logRun({ topicId, topicSlug, deckIndex, status: "aborted", reason, tokens: totalTokens });
      sendFailureAlert({ topic_slug: topicSlug, deck_index: deckIndex, reason });
      return { status: "aborted", topic_slug: topicSlug, deck_index: deckIndex, reason };
    }
    let verdict;
    try {
      calls++;
      const vres = await chat(
        buildValidationMessages(topicSlug, deckIndex, draft, coveredConcepts, priorTitles, sources),
        { temperature: 0, json: true }
      );
      totalTokens += vres.tokens;
      verdict = JSON.parse(vres.content);
    } catch (err) {
      lastError = `validation error: ${err.message}`;
      console.error(`[generate] attempt ${attempt}: ${lastError}`);
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
      console.error(`[generate] attempt ${attempt}: validation failed`);
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

    await logRun({ topicId, topicSlug, deckIndex, status: "success", tokens: totalTokens });
    console.log(`[generate] published ${topicSlug} deck ${deckIndex} (${draft.cards.length} cards)`);
    return {
      status: "success",
      topic_slug: topicSlug,
      deck_index: deckIndex,
      decks_generated: topic.decks_generated + 1,
      target_decks: topic.target_decks,
      cards: draft.cards.length,
      tokens: totalTokens,
    };
  }

  // Both attempts failed: log with full detail and alert, never publish.
  await logRun({ topicId, topicSlug, deckIndex, status: "failure", reason: lastError, tokens: totalTokens });
  sendFailureAlert({ topic_slug: topicSlug, deck_index: deckIndex, reason: lastError, tokens: totalTokens });
  return { status: "failure", topic_slug: topicSlug, deck_index: deckIndex, reason: lastError, tokens: totalTokens };
}
