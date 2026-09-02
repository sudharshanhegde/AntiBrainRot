import OpenAI from "openai";
import { chat as sharedChat } from "../generate/deepseek.js";

// Jobs-only model pool.
//
// The job extraction job is kept entirely separate from the topic-deck
// generation pool so each can use its own provider/keys and neither starves
// the other. The new keys added for jobs are Gemini 3.5 Flash Lite keys, but
// they are stored in Render under the legacy `…_API_KEY_6..20` slots — naming
// here is irrelevant, only the values matter. This pool scans those slots
// (6..20, the range the deck pool does not use) across the common key
// families, and treats every key it finds as a Gemini Flash Lite key.
//
// Load balancing: instead of pinning each listing to a single key (which
// would make requests queue behind one key's rate limit), the pool picks the
// least-loaded key for each call and the sync job fans listings out across
// all keys concurrently. 429 / quota errors retry on a different key.

// Gemini OpenAI-compatible endpoint + model for the job pool. Overridable so
// the same keys can target DeepSeek or another provider if ever wanted.
const BASE_URL = (
  process.env.JOB_LLM_BASE_URL ||
  process.env.GEMINI_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta/openai/"
).replace(/\/+$/, "");

const MODEL = process.env.JOB_LLM_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// Key slots this pool reads. The deck pool uses 1..(LLM_KEY_COUNT||5); jobs
// uses the slots above that, so the two never collide even though they share
// the same legacy env-var family on the host.
const JOB_KEYS_START = Number(process.env.JOB_KEYS_START || 6);
const JOB_KEYS_END = Number(process.env.JOB_KEYS_END || 20);

// Candidate env-var getters, most explicit first. Each returns the secret at
// slot i for that family, or undefined.
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
        break; // one value per slot
      }
    }
  }
  return [...new Set(keys.filter(Boolean))];
}

const clients = new Map(); // apiKey -> OpenAI client (Gemini endpoint)
const inFlight = new Map(); // apiKey -> number of calls currently running
function getClient(apiKey) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new OpenAI({ apiKey, baseURL: BASE_URL });
    clients.set(apiKey, c);
  }
  return c;
}

export function activeJobKeyCount() {
  return collectKeys().length;
}

// A sensible concurrency bound for the sync job: at most one in-flight call
// per key by default, so all keys run in parallel without any single key
// exceeding its per-minute limit. Override with JOB_CONCURRENCY.
export function jobConcurrency() {
  const explicit = Number(process.env.JOB_CONCURRENCY);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  return Math.max(1, activeJobKeyCount());
}

// Picks the key with the fewest in-flight requests (least-loaded). Ties break
// by round-robin so a key is not chosen twice in a row when idle.
let rr = 0;
function pickKey() {
  const keys = collectKeys();
  if (keys.length === 0) return null;
  keys.sort((a, b) => (inFlight.get(a) || 0) - (inFlight.get(b) || 0));
  const min = inFlight.get(keys[0]) || 0;
  const candidates = keys.filter((k) => (inFlight.get(k) || 0) === min);
  // Prefer keys that have handled fewer calls overall (rotation).
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
    const tokens = completion.usage ? completion.usage.total_tokens || 0 : 0;
    return { content, tokens, key };
  } finally {
    inFlight.set(key, Math.max(0, (inFlight.get(key) || 0) - 1));
  }
}

// One completion through the job pool: picks the least-loaded key, and on a
// rate-limit/quota failure retries on another key. Returns { content, tokens }.
export async function jobChat(messages, opts = {}) {
  const keys = collectKeys();
  // No job keys configured yet: fall back to the shared content-generation
  // client so the pipeline still works out of the box.
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
      const retryable = /429|rate\s?limit|quota|RESOURCE_EXHAUSTED|503|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(
        msg
      );
      if (!retryable) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("all job model keys are rate-limited or failing");
}
