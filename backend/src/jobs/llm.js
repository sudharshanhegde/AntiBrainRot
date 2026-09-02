import OpenAI from "openai";
import { chat as sharedChat } from "../generate/deepseek.js";

// Jobs-only LLM client.
//
// The job extraction job is kept separate from the topic-deck generation pool
// so each can use its own provider/keys and neither starves the other.
// Deck generation and Quick Bites keep using DeepSeek untouched.
//
// PROVIDER ORDER for job extraction:
//   1. Groq (default). A single key (GROQ_API_KEY); Groq rate-limits per
//      organization AND per model, so extraction is spread across a pool of
//      similar models (each with its own TPM/RPD budget). Models that hit
//      their limit are marked exhausted for the run and skipped, not retried
//      into more 429s.
//   2. The legacy job key pool (DeepSeek/Gemini slots 6..20) as automatic
//      failover when Groq is not configured or every Groq model is down.
//   3. The shared content client (DeepSeek) as a final fallback so the
//      pipeline still runs out of the box with no job keys at all.

// --- Groq -----------------------------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");

// Extraction model pool. Each model has its own per-minute token budget, so
// round-robining across them raises aggregate throughput. Override with
// GROQ_EXTRACT_MODELS (comma-separated). gpt-oss-safeguard-20b is deliberately
// not here (specialized safety classifier, not a general extractor).
const GROQ_EXTRACT_MODELS = (
  process.env.GROQ_EXTRACT_MODELS ||
  "openai/gpt-oss-20b,qwen/qwen3.6-27b,qwen/qwen3.8-27b,openai/gpt-oss-120b"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Bound the structured-JSON output per request so a response never needlessly
// eats into that minute's token budget. Override with GROQ_MAX_TOKENS.
const GROQ_MAX_TOKENS = Number(process.env.GROQ_MAX_TOKENS || 300);

export function groqConfigured() {
  return Boolean(GROQ_API_KEY);
}

// Number of Groq extraction models available (used to size concurrency so
// requests spread across the per-model budgets).
export function groqExtractionModelCount() {
  return GROQ_EXTRACT_MODELS.length;
}

// Per-run Groq health state:
//   cooldownUntil - a model that got rate-limited waits here (gives it time
//                   to recover instead of being bombarded), then is retried.
//   exhausted     - models that failed repeatedly / hit a long retry-after;
//                   skipped for the whole run.
//   failCount     - how many times each model has rate-limited this run.
const GROQ_COOLDOWN_MS = Number(process.env.GROQ_COOLDOWN_MS || 20000);
let cooldownUntil = new Map();
let exhausted = new Set();
let failCount = new Map();
export function resetGroqExhaustion() {
  cooldownUntil = new Map();
  exhausted = new Set();
  failCount = new Map();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let groqClient = null;
function getGroqClient() {
  if (!groqClient) groqClient = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: GROQ_BASE_URL });
  return groqClient;
}

function isRetryableRateLimit(err) {
  return /429|rate\s?limit|RESOURCE_EXHAUSTED|503|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(
    `${err?.message || ""}`
  );
}

// One completion against a specific Groq model. Respects 429 retry-after with
// a few bounded retries before giving up on that model.
async function groqChat(model, messages, opts = {}) {
  const client = getGroqClient();
  let lastError;
  const maxRetries = Number(process.env.GROQ_RETRIES || 3);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: opts?.temperature ?? 0,
        max_tokens: GROQ_MAX_TOKENS,
        response_format: opts?.json ? { type: "json_object" } : undefined,
      });
      const content = completion.choices[0]?.message?.content;
      return { content, tokens: completion.usage ? completion.usage.total_tokens || 0 : 0 };
    } catch (err) {
      lastError = err;
      if (!isRetryableRateLimit(err)) throw err;
      const after = err?.headers?.get?.("retry-after");
      // Respect retry-after; never hammer again within the same second. When
      // no retry-after is given, back off longer on each attempt.
      const waitMs = after ? Math.max(Number(after) || 1, 1) * 1000 : 1500 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

// Extraction across the Groq model pool.
// Round-robins over models that are currently available. When a model gets
// rate-limited it is put into a short cooldown (respecting retry-after) so it
// has time to recover, and the next available model is tried — it is NOT
// bombarded again in the next second. A model only becomes permanently
// exhausted for the run after repeated failures or a long retry-after. If no
// model is available it waits for the soonest cooldown and retries; if all are
// exhausted it throws so the caller falls over to the failover keys.
let rr = 0;
async function groqExtraction(messages, opts) {
  const now = Date.now();
  const available = GROQ_EXTRACT_MODELS.filter(
    (m) => !exhausted.has(m) && now >= (cooldownUntil.get(m) || 0)
  );

  if (available.length === 0) {
    const cooling = GROQ_EXTRACT_MODELS.filter((m) => !exhausted.has(m));
    if (cooling.length === 0) {
      throw new Error("all Groq extraction models exhausted for this run");
    }
    const soonest = Math.min(...cooling.map((m) => cooldownUntil.get(m) || now));
    if (soonest > now) await sleep(Math.min(soonest - now, 60000));
    return groqExtraction(messages, opts);
  }

  const model = available[rr % available.length];
  rr += 1;
  try {
    return await groqChat(model, messages, opts);
  } catch (err) {
    if (!(err && (err.status === 429 || isRetryableRateLimit(err)))) throw err;
    const after = err?.headers?.get?.("retry-after");
    const afterSec = after ? Math.max(Number(after) || 1, 1) : 0;
    failCount.set(model, (failCount.get(model) || 0) + 1);
    if (afterSec >= 300 || (failCount.get(model) || 0) >= 4) {
      // Long retry-after (e.g. daily budget) or repeated failures -> give up
      // on this model for the rest of the run.
      exhausted.add(model);
    } else {
      // Short cooldown so the model can recover before being tried again.
      const cooldownMs = afterSec > 0 ? afterSec * 1000 : GROQ_COOLDOWN_MS;
      cooldownUntil.set(model, Date.now() + cooldownMs);
    }
    await sleep(300); // brief pause before hitting the next model
    return groqExtraction(messages, opts);
  }
}

// --- Legacy failover pool (DeepSeek/Gemini slots 6..20) -------------------
const BASE_URL = (
  process.env.JOB_LLM_BASE_URL ||
  process.env.GEMINI_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta/openai/"
).replace(/\/+$/, "");

const MODEL = process.env.JOB_LLM_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const JOB_KEYS_START = Number(process.env.JOB_KEYS_START || 6);
const JOB_KEYS_END = Number(process.env.JOB_KEYS_END || 20);

const KEY_GETTERS = [
  (i) => process.env[`JOB_LLM_API_KEY_${i}`],
  (i) => (i === 1 ? process.env.JOB_LLM_API_KEY : undefined),
  (i) => process.env[`GEMINI_API_KEY_${i}`],
  (i) => process.env[`DEEPSEEK_API_KEY_${i}`],
  (i) => process.env[`LLM_API_KEY_${i}`],
];

function collectKeys() {
  const keys = [];
  for (let i = JOB_KEYS_START; i <= JOB_KEYS_END; i++) {
    for (const getter of KEY_GETTERS) {
      const k = getter(i);
      if (k) {
        keys.push(k);
        break;
      }
    }
  }
  return [...new Set(keys.filter(Boolean))];
}

export function activeJobKeyCount() {
  return collectKeys().length;
}

// Concurrency bound. With Groq active we fan out across the extraction-model
// pool (each model has its own budget), so default to one in-flight per model.
// The failover pool fans out across its many keys. Override with
// JOB_CONCURRENCY.
export function jobConcurrency() {
  const explicit = Number(process.env.JOB_CONCURRENCY);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  // Groq rate-limits requests-per-minute (a 429 arrives immediately, TTFT 0),
  // so run calls SEQUENTIALLY — one in-flight — and round-robin across the
  // model pool to still spread the token budget. Raising JOB_CONCURRENCY
  // above 1 with Groq is what causes the bursts of 429s.
  if (groqConfigured()) return 1;
  return Math.max(1, activeJobKeyCount());
}

const clients = new Map();
const inFlight = new Map();
function getClient(apiKey) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new OpenAI({ apiKey, baseURL: BASE_URL });
    clients.set(apiKey, c);
  }
  return c;
}

let krr = 0;
function pickKey() {
  const keys = collectKeys();
  if (keys.length === 0) return null;
  keys.sort((a, b) => (inFlight.get(a) || 0) - (inFlight.get(b) || 0));
  const min = inFlight.get(keys[0]) || 0;
  const candidates = keys.filter((k) => (inFlight.get(k) || 0) === min);
  const idx = krr % candidates.length;
  krr += 1;
  return candidates[idx];
}

async function runOnKey(key, messages, opts) {
  const client = getClient(key);
  inFlight.set(key, (inFlight.get(key) || 0) + 1);
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: opts?.temperature ?? 0,
      response_format: opts?.json ? { type: "json_object" } : undefined,
    });
    const content = completion.choices[0]?.message?.content;
    return { content, tokens: completion.usage ? completion.usage.total_tokens || 0 : 0 };
  } finally {
    inFlight.set(key, Math.max(0, (inFlight.get(key) || 0) - 1));
  }
}

// The failover pool (DeepSeek/Gemini slots 6..20), then the shared client.
async function jobKeyPoolChat(messages, opts) {
  const keys = collectKeys();
  if (keys.length === 0) {
    const res = await sharedChat(messages, { ...opts, json: true });
    return { content: res.content, tokens: res.tokens };
  }
  const used = new Set();
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = pickKey();
    if (used.has(key)) continue;
    used.add(key);
    try {
      const res = await runOnKey(key, messages, opts);
      return { content: res.content, tokens: res.tokens };
    } catch (err) {
      const retryable = isRetryableRateLimit(err);
      if (!retryable) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("all job model keys are rate-limited or failing");
}

// One extraction completion. Groq model pool first; DeepSeek/Gemini slots and
// the shared client are automatic failover. Returns { content, tokens }.
export async function jobChat(messages, opts = {}) {
  if (groqConfigured()) {
    try {
      return await groqExtraction(messages, opts);
    } catch (err) {
      console.warn(`[jobs] groq extraction failed (${err?.message}); using failover keys`);
    }
  }
  return jobKeyPoolChat(messages, opts);
}
