import OpenAI from "openai";

// Provider-agnostic LLM client for the automated generation job.
// OpenAI-compatible, so it works with DeepSeek, Gemini's OpenAI-compatible
// endpoint, or any other OpenAI-compatible provider just by pointing
// LLM_BASE_URL at it.
//
// MULTI-KEY LOAD BALANCING
// A single API key hits rate limits quickly and stops producing content,
// so multiple keys can be configured and topics are spread across them
// deterministically — roughly 2 topics per key with the default 5 keys.
// Keys are read from env in priority order:
//   LLM_API_KEY, LLM_API_KEY_2 ... LLM_API_KEY_5
// with legacy single-provider fallbacks (DEEPSEEK_API_KEY / GEMINI_API_KEY
// and their numbered variants). The first group that yields a key wins.
//
// A topic always maps to the same key (stable hash), so the load stays
// balanced day to day and no single topic hammers the same key's quota.
// chat() takes { topic } to pick the right key; keyIndexFor(topic) exposes
// the assignment for logging.

// Normalize the base URL by stripping trailing slashes. Some OpenAI SDK
// versions append "/chat/completions" without trimming, so a base URL that
// ends in "/" becomes ".../openai//chat/completions", which the endpoint
// answers with a bare 404 (no body). One trailing slash is exactly what
// these OpenAI-compatible endpoints expect.
const BASE_URL = (
  process.env.LLM_BASE_URL ||
  process.env.DEEPSEEK_BASE_URL ||
  process.env.GEMINI_BASE_URL ||
  "https://api.deepseek.com"
).replace(/\/+$/, "");

// Provider-aware default model. An OpenAI-compatible endpoint returns 404
// when handed a model name it does not have, so the default must match the
// endpoint: a Gemini model for the Gemini endpoint, a DeepSeek model for
// the DeepSeek endpoint. Explicit env vars (LLM_MODEL, then the
// provider-specific ones) always win over the auto-detected default.
// gemini-3.6-flash is what Gemini currently recommends for new projects;
// older flash models (e.g. gemini-2.5-flash / gemini-2.0-flash) return
// 404 "no longer available to new users". Override with LLM_MODEL /
// GEMINI_MODEL if your project needs a specific model.
const DEFAULT_MODEL = /generativelanguage\.googleapis\.com/i.test(BASE_URL)
  ? process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
  : process.env.DEEPSEEK_MODEL || "deepseek-chat";
const MODEL = process.env.LLM_MODEL || DEFAULT_MODEL;
const MAX_KEYS = Number(process.env.LLM_KEY_COUNT || 5);

// Ordered env-var groups, most generic first. The first group that yields
// at least one key is used; this keeps the config provider-agnostic while
// remaining backward compatible with the old single DEEPSEEK_API_KEY.
const KEY_GROUPS = [
  (i) => (i === 1 ? process.env.LLM_API_KEY : process.env[`LLM_API_KEY_${i}`]),
  (i) => (i === 1 ? process.env.GEMINI_API_KEY : process.env[`GEMINI_API_KEY_${i}`]),
  (i) => (i === 1 ? process.env.DEEPSEEK_API_KEY : process.env[`DEEPSEEK_API_KEY_${i}`]),
];

// Collects the configured keys (deduplicated) into an ordered array.
function collectKeys() {
  for (const getter of KEY_GROUPS) {
    const keys = [];
    for (let i = 1; i <= MAX_KEYS; i++) {
      const k = getter(i);
      if (k) keys.push(k);
    }
    if (keys.length > 0) return [...new Set(keys)];
  }
  return [];
}

const clients = new Map(); // apiKey -> OpenAI client
function getClient(apiKey) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new OpenAI({ apiKey, baseURL: BASE_URL });
    clients.set(apiKey, c);
  }
  return c;
}

// Stable string hash so a topic always lands on the same key.
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Number of API keys currently configured (0 if none).
export function activeKeyCount() {
  return collectKeys().length;
}

// The zero-based key index a given topic is assigned to.
export function keyIndexFor(topic) {
  const keys = collectKeys();
  if (keys.length <= 1) return 0;
  return topic ? hashString(String(topic)) % keys.length : 0;
}

function clientFor(topic) {
  const keys = collectKeys();
  if (keys.length === 0) {
    throw new Error(
      "No LLM API key is set. Add LLM_API_KEY (or DEEPSEEK_API_KEY / GEMINI_API_KEY) to backend/.env or pipeline/.env."
    );
  }
  return getClient(keys[keyIndexFor(topic)]);
}

// One chat completion. Returns { content, tokens }. Transient network
// failures are retried with backoff; non-transient errors are not.
export async function chat(messages, { temperature = 0.2, json = false, retries = 3, topic } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await clientFor(topic).chat.completions.create({
        model: MODEL,
        messages,
        temperature,
        response_format: json ? { type: "json_object" } : undefined,
      });
      const content = completion.choices[0]?.message?.content;
      if (content == null) {
        throw new Error("LLM returned an empty completion");
      }
      const tokens = completion.usage ? completion.usage.total_tokens || 0 : 0;
      return { content, tokens };
    } catch (err) {
      // Enrich the error so the failure reason surfaces the real provider
      // status/body (e.g. "400 [status 400] {"error":{"message":...}}").
      const status = err && typeof err.status === "number" ? err.status : "";
      const body = err && err.error ? JSON.stringify(err.error) : "";
      lastError = new Error(
        `${err.message}${status ? ` [status ${status}]` : ""}${body ? ` ${body}` : ""}`
      );
      const transient = /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|network|timeout|429|rate limit|quota/i.test(
        lastError.message
      );
      // Rate-limit / transient failures are retried so a key nearing its
      // quota does not abort a deck; the next attempt re-selects its key.
      if (!transient || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}
