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
//      organization/model, so one key is all you need. Cheap and generous.
//   2. The legacy job key pool (DeepSeek/Gemini slots 6..20) as automatic
//      failover when Groq is not configured or a Groq call fails.
//   3. The shared content client (DeepSeek) as a final fallback so the
//      pipeline still runs out of the box with no job keys at all.
//
// Load balancing applies to the failover pool: the least-loaded key is chosen
// per call and the sync fans listings out across them. 429 / quota errors
// retry on a different key.

// --- Groq -----------------------------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
// Extraction model (the doc's "model A", high volume).
const GROQ_EXTRACT_MODEL = process.env.GROQ_EXTRACT_MODEL || "openai/gpt-oss-20b";

export function groqConfigured() {
  return Boolean(GROQ_API_KEY);
}

let groqClient = null;
function getGroqClient() {
  if (!groqClient) groqClient = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: GROQ_BASE_URL });
  return groqClient;
}

// One Groq completion. Respects 429 retry-after where available, with a few
// bounded retries, then throws so the caller can fall over to another
// provider.
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
        response_format: opts?.json ? { type: "json_object" } : undefined,
      });
      const content = completion.choices[0]?.message?.content;
      return { content, tokens: completion.usage ? completion.usage.total_tokens || 0 : 0 };
    } catch (err) {
      lastError = err;
      const msg = `${err?.message || ""}`;
      if (!/429|rate\s?limit|RESOURCE_EXHAUSTED|503|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(msg)) {
        throw err; // non-retryable
      }
      // Respect retry-after if the provider returned one.
      const after = err?.headers?.get?.("retry-after");
      const waitMs = after ? Math.min(Number(after) || 1, 30) * 1000 : 500 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
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

// Concurrency bound. When Groq is the active default it is a single key, so
// one in-flight call is the safe default; the failover pool fans out across
// its many keys. Override with JOB_CONCURRENCY.
export function jobConcurrency() {
  const explicit = Number(process.env.JOB_CONCURRENCY);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
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

let rr = 0;
function pickKey() {
  const keys = collectKeys();
  if (keys.length === 0) return null;
  keys.sort((a, b) => (inFlight.get(a) || 0) - (inFlight.get(b) || 0));
  const min = inFlight.get(keys[0]) || 0;
  const candidates = keys.filter((k) => (inFlight.get(k) || 0) === min);
  const idx = rr % candidates.length;
  rr += 1;
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
      const msg = `${err?.message || ""}`;
      const retryable = /429|rate\s?limit|quota|RESOURCE_EXHAUSTED|503|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(msg);
      if (!retryable) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("all job model keys are rate-limited or failing");
}

// One extraction completion. Groq is the default; DeepSeek/Gemini slots and
// the shared client are automatic failover. Returns { content, tokens }.
export async function jobChat(messages, opts = {}) {
  if (groqConfigured()) {
    try {
      return await groqChat(GROQ_EXTRACT_MODEL, messages, opts);
    } catch (err) {
      console.warn(`[jobs] groq extraction failed (${err?.message}); using failover keys`);
    }
  }
  return jobKeyPoolChat(messages, opts);
}
