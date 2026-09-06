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
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");

// Multiple Groq keys (one per account) each carry their OWN daily token budget
// and per-model rate limits. Load-balancing across accounts multiplies the
// tokens available for a large regeneration. GROQ_API_KEY is the primary;
// add GROQ_API_KEY_2..GROQ_API_KEY_N for more accounts (GROQ_KEY_COUNT caps
// how many are read).
function collectGroqKeys() {
  const keys = [];
  const first = process.env.GROQ_API_KEY;
  if (first) keys.push(first);
  const max = Number(process.env.GROQ_KEY_COUNT || 10);
  for (let i = 2; i <= max; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

// Extraction model pool (per key). Each (key, model) pair is an independent
// rate budget, so every pair is treated as its own endpoint. Override with
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
  return collectGroqKeys().length > 0;
}

// Models available per key.
export function groqExtractionModelCount() {
  return GROQ_EXTRACT_MODELS.length;
}

// Total independent (key, model) endpoints — used to size concurrency so we
// keep roughly one in-flight per endpoint without stacking 429s on one.
export function activeGroqEndpointCount() {
  return collectGroqKeys().length * GROQ_EXTRACT_MODELS.length;
}

// Per-run Groq health state, tracked per ENDPOINT (key index "::" model) since
// the same model under a different key is a different budget:
//   cooldownUntil - an endpoint that got rate-limited waits here, then retried.
//   exhausted     - endpoints that failed repeatedly / hit a long retry-after.
//   keyDailyOut   - an ENTIRE key whose daily token budget is spent; all its
//                   endpoints are skipped for the run.
//   failCount     - how many times each endpoint has rate-limited this run.
const GROQ_COOLDOWN_MS = Number(process.env.GROQ_COOLDOWN_MS || 20000);
let cooldownUntil = new Map();
let exhausted = new Set();
let failCount = new Map();
let keyDailyOut = new Set();
export function resetGroqExhaustion() {
  cooldownUntil = new Map();
  exhausted = new Set();
  failCount = new Map();
  keyDailyOut = new Set();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One OpenAI client per key.
const groqClients = new Map();
function clientFor(apiKey) {
  let c = groqClients.get(apiKey);
  if (!c) {
    c = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
    groqClients.set(apiKey, c);
  }
  return c;
}

function isRetryableRateLimit(err) {
  // 429 / token-limit / transient network errors, plus structured-output
  // validation failures (json_validate_failed / "failed to validate JSON"):
  // those are often transient per-model, so retry on another endpoint rather
  // than dropping the listing to the deterministic fallback on the first try.
  return /429|rate\s?limit|RESOURCE_EXHAUSTED|503|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up|json_validate_failed|failed to validate json|invalid_request_error/i.test(
    `${err?.message || ""}`
  );
}

// The full set of (key, model) endpoints.
function buildEndpoints() {
  const keys = collectGroqKeys();
  const eps = [];
  for (let k = 0; k < keys.length; k++) {
    for (const model of GROQ_EXTRACT_MODELS) {
      eps.push({ id: `${k}::${model}`, key: keys[k], model });
    }
  }
  return eps;
}

// One completion against one (key, model) endpoint. Respects 429 retry-after
// with a few bounded retries before giving up on that endpoint.
async function endpointChat(apiKey, model, messages, opts = {}) {
  const client = clientFor(apiKey);
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

// Extraction across the Groq (key, model) pool.
// Round-robins over endpoints that are currently available. When an endpoint is
// rate-limited it is put into a short cooldown (respecting retry-after) so it
// has time to recover, and the next available endpoint is tried. A long
// retry-after (daily token cap) retires the WHOLE key for the run. If nothing
// is available it waits for the soonest cooldown and retries; if every key is
// out it throws so the caller falls over to the failover keys.
let rr = 0;
async function groqExtraction(messages, opts) {
  const now = Date.now();
  const eps = buildEndpoints();
  const available = eps.filter(
    (e) => !exhausted.has(e.id) && !keyDailyOut.has(e.key) && now >= (cooldownUntil.get(e.id) || 0)
  );

  if (available.length === 0) {
    const possible = eps.filter((e) => !exhausted.has(e.id) && !keyDailyOut.has(e.key));
    if (possible.length === 0) {
      // Every key is daily-exhausted or every endpoint errored out.
      throw new Error("all Groq keys/models exhausted for this run");
    }
    const soonest = Math.min(...possible.map((e) => cooldownUntil.get(e.id) || now));
    if (soonest > now) await sleep(Math.min(soonest - now, 60000));
    return groqExtraction(messages, opts);
  }

  const ep = available[rr % available.length];
  rr += 1;
  try {
    return await endpointChat(ep.key, ep.model, messages, opts);
  } catch (err) {
    if (!(err && (err.status === 429 || isRetryableRateLimit(err)))) throw err;
    const after = err?.headers?.get?.("retry-after");
    const afterSec = after ? Math.max(Number(after) || 1, 1) : 0;
    failCount.set(ep.id, (failCount.get(ep.id) || 0) + 1);
    if (afterSec >= 300) {
      // Long retry-after means this ACCOUNT's daily token budget is spent; all
      // its models are done for the day, so retire the whole key.
      keyDailyOut.add(ep.key);
      exhausted.add(ep.id);
    } else if ((failCount.get(ep.id) || 0) >= 4) {
      // Repeated failures -> give up on this endpoint for the rest of the run.
      exhausted.add(ep.id);
    } else {
      // Short cooldown so the endpoint can recover before being tried again.
      const cooldownMs = afterSec > 0 ? afterSec * 1000 : GROQ_COOLDOWN_MS;
      cooldownUntil.set(ep.id, Date.now() + cooldownMs);
    }
    await sleep(300); // brief pause before hitting the next endpoint
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

// Concurrency bound. With Groq active, each (key, model) endpoint has its own
// rate budget, so we can run roughly one in-flight per endpoint. With a single
// key this is just its model count; more keys multiply it. Override with
// GROQ_CONCURRENCY (or JOB_CONCURRENCY). The failover pool fans out across its
// many keys.
export function jobConcurrency() {
  const explicit = Number(process.env.JOB_CONCURRENCY);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  if (groqConfigured()) {
    const endpoints = activeGroqEndpointCount();
    const cap = Number(process.env.GROQ_CONCURRENCY);
    if (Number.isInteger(cap) && cap > 0) return cap;
    // Keep it bounded: distinct endpoints only, capped to avoid over-subscribing
    // a single (key, model) which is what caused bursts of 429s in the past.
    return Math.max(1, Math.min(endpoints, 8));
  }
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
