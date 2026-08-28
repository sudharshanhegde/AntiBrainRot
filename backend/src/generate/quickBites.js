import { pool, query } from "../db.js";
import { chat } from "./deepseek.js";
import { checkQuickBites } from "./checks.js";
import {
  buildQuickBitesGenerationMessages,
  buildQuickBitesValidationMessages,
} from "./quickBitesPrompts.js";

// The Quick Bites daily generation job ().
//
// A separate, additive part of the daily pipeline, alongside the topic
// deck generation, not a replacement for it. At 80 bites a day across
// the whole of computer science, curating reference material per fact is
// not practical, so generation runs from DeepSeek's own knowledge and is
// mitigated with a separate self-check validation pass: given the draft
// batch with clean context, the model flags anything it is not confident
// is factually accurate, and anything flagged is cut or regenerated.
//
// The batch is generated in a few smaller calls (PER_CALL per call)
// rather than one huge call, so a large daily target (80) does not strain
// a single completion's output quality or length. Passing bites are
// inserted together with their fact_labels into covered_facts in one
// transaction, stamped with today's generated_date. Same failure handling
// and alerting as the rest of the pipeline: on failure log it and alert,
// never publish, never silently drop the day's batch without a record.

const MAX_ATTEMPTS = 2; // one generation + one retry, hard cap
// Bites per generation/validation call. Keep well under a large 80-bite
// target so the model does not drift on length or quality in one call.
const PER_CALL = 20;
// The full daily target (80 bites a day). The loop is proven at the
// default now, so it runs at the production volume. Override with
// QUICK_BITES_BATCH_SIZE to tune.
const DEFAULT_BATCH = Number(process.env.QUICK_BITES_BATCH_SIZE || 80);

// Scheduling anchors to IST like the rest of the pipeline, so
// generated_date matches the product timezone.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateString(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function sendFailureAlert(payload) {
  const url = process.env.FAILURE_WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `AntiBrainRot pipeline failure: quick bites batch - ${payload.reason}`,
      ...payload,
    }),
  }).catch((err) => console.error("could not send failure webhook:", err.message));
}

function logRun({ status, reason, tokens, inserted }) {
  try {
    // Reuse generation_runs for queryable history; topic/deck columns
    // stay null for the module-level Quick Bites batch, and the reason
    // text records what happened (status, count inserted, or failure).
    const detail = JSON.stringify({
      module: "quick_bites",
      status,
      inserted,
      reason: reason || null,
    });
    return query(
      `insert into generation_runs (topic_id, topic_slug, deck_index, status, failure_reason, tokens_used)
       values (null, 'quick-bites', null, $1, $2, $3)`,
      [status, detail, tokens || null]
    );
  } catch (err) {
    console.error("could not log quick bites generation run:", err.message);
  }
}

// Generates, mechanically checks, LLM self-check validates, and returns
// one sub-batch of accepted bites. `state` carries the run-wide call and
// token counters so the cost cap applies across sub-batches.
async function generateOneChunk(count, coveredLabels, state, dryRun) {
  let feedback = "";
  let lastError = "unknown failure";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (dryRun) {
      console.log(`[quick-bites] dry-run: would generate ${count} bites`);
      return { accepted: [], dryRun: true };
    }

    // Pass 1: generate this sub-batch.
    let batch;
    try {
      state.calls++;
      const gen = await chat(
        buildQuickBitesGenerationMessages(count, coveredLabels),
        { temperature: 0.7, json: true, topic: "quick-bites" }
      );
      state.totalTokens += gen.tokens;
      batch = JSON.parse(gen.content);
    } catch (err) {
      lastError = `generation error: ${err.message}`;
      console.error(`[quick-bites] attempt ${attempt}: ${lastError}`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    // Mechanical hard gates: word band, no em dash / emoji, unique labels.
    const auto = checkQuickBites(batch);
    if (!auto.ok) {
      lastError = auto.errors.join("; ");
      feedback = auto.errors.map((e) => `- ${e}`).join("\n");
      console.error(`[quick-bites] attempt ${attempt}: mechanical checks failed`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    // Pass 2: self-check validation, separate DeepSeek call, clean context.
    let verdict;
    try {
      state.calls++;
      const vres = await chat(
        buildQuickBitesValidationMessages(batch, coveredLabels),
        { temperature: 0, json: true, topic: "quick-bites" }
      );
      state.totalTokens += vres.tokens;
      verdict = JSON.parse(vres.content);
    } catch (err) {
      lastError = `validation error: ${err.message}`;
      console.error(`[quick-bites] attempt ${attempt}: ${lastError}`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    if (verdict.verdict !== "pass") {
      const reasons = (verdict.bites || [])
        .filter((b) => !b.pass)
        .map((b) => `bite ${b.index}: ${b.reason || "no reason"}`);
      if (verdict.notes) reasons.push(`notes: ${verdict.notes}`);
      lastError = reasons.join("; ");
      feedback = reasons.map((r) => `- ${r}`).join("\n");
      console.error(`[quick-bites] attempt ${attempt}: self-check validation failed`);
      if (attempt === MAX_ATTEMPTS) break;
      continue;
    }

    return { accepted: batch.bites, dryRun: false };
  }

  throw new Error(lastError);
}

export async function runQuickBitesJob({ dryRun = false, batchSize = DEFAULT_BATCH } = {}) {
  const generatedDate = istDateString(Date.now());

  // Pull already-used fact labels so the same fact never resurfaces.
  const covRes = await query("select fact_label from covered_facts order by covered_at");
  const coveredLabels = covRes.rows.map((r) => r.fact_label);

  const state = { calls: 0, totalTokens: 0 };
  const allAccepted = [];
  let dryRunMode = dryRun;
  let failures = [];

  // Split the target into sub-batches of at most PER_CALL each.
  const chunks = [];
  for (let n = batchSize; n > 0; n -= PER_CALL) {
    chunks.push(Math.min(PER_CALL, n));
  }

  for (const count of chunks) {
    // Refresh covered labels per chunk so a label accepted by an earlier
    // chunk is not accepted again by a later one.
    const coveredNow = allAccepted.map((b) => b.fact_label).concat(coveredLabels);
    try {
      const res = await generateOneChunk(count, coveredNow, state, dryRunMode);
      if (res.dryRun) dryRunMode = true;
      allAccepted.push(...res.accepted);
    } catch (err) {
      failures.push(err.message);
      // A chunk failure does not silently drop the whole day: it is
      // recorded below and alerted, while bites that already passed are
      // still published so a partial batch is never lost.
      console.error(`[quick-bites] chunk of ${count} failed: ${err.message}`);
    }
  }

  if (dryRunMode) {
    await logRun({ status: "dry-run", inserted: 0, tokens: state.totalTokens });
    return {
      status: "dry-run",
      generated_date: generatedDate,
      target: batchSize,
      tokens: state.totalTokens,
    };
  }

  if (allAccepted.length === 0) {
    const reason =
      failures.length > 0 ? failures.join("; ") : "generation produced no bites";
    await logRun({ status: "failure", reason, tokens: state.totalTokens });
    sendFailureAlert({ reason, tokens: state.totalTokens });
    return { status: "failure", reason, generated_date: generatedDate };
  }

  // Publish the passing bites with their fact_labels in one transaction,
  // stamped with today's generated_date.
  let inserted = 0;
  try {
    inserted = await insertAcceptedBites(allAccepted, generatedDate);
  } catch (err) {
    const reason = `insert error: ${err.message}`;
    console.error(`[quick-bites] insert error: ${reason}`);
    await logRun({ status: "failure", reason, tokens: state.totalTokens });
    sendFailureAlert({ reason, tokens: state.totalTokens });
    return { status: "failure", reason, generated_date: generatedDate };
  }

  await logRun({ status: "success", inserted, tokens: state.totalTokens });
  console.log(
    `[quick-bites] published ${inserted} bites for ${generatedDate} (${allAccepted.length} accepted)`
  );
  return {
    status: "success",
    generated_date: generatedDate,
    target: batchSize,
    inserted,
    accepted: allAccepted.length,
    failures: failures.length,
    tokens: state.totalTokens,
  };
}

// Inserts the accepted bites and their fact_labels into covered_facts in
// one transaction so the dedupe registry can never drift out of sync with
// what is actually live. Returns the number of bites inserted.
async function insertAcceptedBites(bites, generatedDate) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    let inserted = 0;
    for (const bite of bites) {
      const res = await client.query(
        `insert into quick_bites (tag, body, generated_date)
         values ($1, $2, $3)
         on conflict do nothing
         returning id`,
        [bite.tag, bite.body, generatedDate]
      );
      if (res.rows.length === 0) continue; // duplicate body/tag pair, skip
      inserted += 1;
      await client.query(
        `insert into covered_facts (fact_label, tag)
         values ($1, $2)
         on conflict (fact_label) do nothing`,
        [bite.fact_label, bite.tag]
      );
    }
    await client.query("commit");
    return inserted;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
