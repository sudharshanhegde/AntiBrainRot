import OpenAI from "openai";

// DeepSeek exposes an OpenAI-compatible API, so the official OpenAI
// client works when pointed at DeepSeek's base URL. Configuration comes
// from the environment (.env). The client is created lazily so that
// dry runs and other tooling can import this module without a key set.

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

let client = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Copy pipeline/.env.example to pipeline/.env and add your key."
    );
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
  return client;
}

// One chat completion. Returns the assistant text.
//   json: true requests a JSON object response (DeepSeek json mode).
// Transient network failures (timeouts, dropped connections) are retried
// with backoff; non-transient errors (bad key, bad request, model
// output) are not retried.
export async function chat(messages, { temperature = 0.2, json = false, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await getClient().chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages,
        temperature,
        response_format: json ? { type: "json_object" } : undefined,
      });
      const content = completion.choices[0]?.message?.content;
      if (content == null) {
        throw new Error("DeepSeek returned an empty completion");
      }
      return content;
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
