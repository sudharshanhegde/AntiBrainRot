import OpenAI from "openai";

// DeepSeek client for the automated generation job. OpenAI-compatible,
// configured via env (DEEPSEEK_API_KEY from backend/.env or the
// pipeline/.env fallback). Returns token usage so the job can track
// daily spend.

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Add it to backend/.env or pipeline/.env."
    );
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
  return client;
}

// One chat completion. Returns { content, tokens }. Transient network
// failures are retried with backoff; non-transient errors are not.
export async function chat(messages, { temperature = 0.2, json = false, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await getClient().chat.completions.create({
        model: MODEL,
        messages,
        temperature,
        response_format: json ? { type: "json_object" } : undefined,
      });
      const content = completion.choices[0]?.message?.content;
      if (content == null) {
        throw new Error("DeepSeek returned an empty completion");
      }
      const tokens = completion.usage ? completion.usage.total_tokens || 0 : 0;
      return { content, tokens };
    } catch (err) {
      lastError = err;
      const transient = /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|network|timeout/i.test(
        err && err.message ? err.message : String(err)
      );
      if (!transient || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}
