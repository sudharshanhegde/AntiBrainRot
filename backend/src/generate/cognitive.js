import { pool, query } from "../db.js";
import { jobChat } from "../jobs/llm.js";
import { EM_DASH_RE, EMOJI_RE } from "./checks.js";
import { verifyCognitiveQuestion } from "./cognitiveVerification.js";
import {
  COGNITIVE_CATEGORIES,
  buildCognitiveGenerationMessages,
  buildCognitiveValidationMessages,
} from "./cognitivePrompts.js";

// Cognitive speed and accuracy test generation.
//
// Same daily-batch pattern as the rest of the content pipeline: generate a
// batch of questions for one category, mechanically check the shape,
// deterministically verify the categories that can be checked in code, then
// run a separate self-check validation pass before publishing. Published
// questions are tagged in covered_cognitive_questions so the same question
// is never generated twice, the same dedupe idea as covered_facts and
// covered_concepts.
//
// This module also owns `ensureCognitiveSeed`, a small hardcoded set of
// tests (one per category) inserted on startup when a category has no test
// yet. That exists so the prefetch-then-run-locally client loop works before
// any generation has run, and it is the only content the module ships
// without going through the pipeline.

const MAX_ATTEMPTS = 2; // one generation plus one retry, hard cap
const DEFAULT_QUESTION_COUNT = 12;

// Cognitive generation runs through the Groq-first client (the same one the
// jobs pipeline uses): it round-robins over a pool of Groq models and keys,
// parks rate-limited models in a short cooldown instead of hammering them into
// 429s, and falls back to the job key pool then the shared content client when
// Groq is unconfigured or every model is down. Generation used to go straight
// to the shared DeepSeek/Gemini client, which surfaced provider 429s as
// outright failures; this keeps a single rate-limited provider from stalling
// the module.
//
// A batch of questions is far larger than a job-extraction response, so it
// asks for its own output bound rather than the small extraction default.
const COGNITIVE_MAX_TOKENS = Number(process.env.COGNITIVE_MAX_TOKENS || 2000);

function cognitiveChat(messages, opts = {}) {
  return jobChat(messages, { ...opts, maxTokens: COGNITIVE_MAX_TOKENS });
}

// Per-question time budget, one entry per category. This is the tunable
// number the skill warns against hardcoding blindly: it is what the overall
// session countdown and the skip penalty are derived from. Kept here so the
// generation job, the seed, and the routes all agree.
export const PER_QUESTION_MS = {
  numerical: 45000,
  verbal: 45000,
  abstract: 40000,
  logical: 40000,
};

// The overall budget is per-question budget times question count. The skip
// penalty is a full question's budget, so skipping always costs more than
// the average answered question would have, making a guess strictly better
// than skipping.
export function timeConfigFor(category, questionCount) {
  const per = PER_QUESTION_MS[category] || PER_QUESTION_MS.numerical;
  return { time_limit_ms: per * questionCount, skip_penalty_ms: per };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istDateString(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function logRun({ status, reason, tokens }) {
  try {
    const detail = JSON.stringify({ module: "cognitive_tests", status, reason: reason || null });
    return query(
      `insert into generation_runs (topic_id, topic_slug, deck_index, status, failure_reason, tokens_used)
       values (null, 'cognitive-tests', null, $1, $2, $3)`,
      [status, detail, tokens || null]
    );
  } catch (err) {
    console.error("could not log cognitive test generation run:", err.message);
  }
}

function sendFailureAlert(payload) {
  const url = process.env.FAILURE_WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `AntiBrainRot pipeline failure: cognitive tests - ${payload.reason}`,
      ...payload,
    }),
  }).catch((err) => console.error("could not send failure webhook:", err.message));
}

const OPTION_IDS = new Set(["a", "b", "c", "d"]);
const CATEGORY_SET = new Set(COGNITIVE_CATEGORIES);

// Mechanical shape gates for one generated batch. A batch that fails any of
// these is never published, regardless of what the validation pass says.
export function checkCognitiveBatch(category, batch) {
  const errors = [];
  if (!batch || typeof batch !== "object") return { ok: false, errors: ["batch is not an object"] };
  if (!CATEGORY_SET.has(category)) errors.push(`unknown category "${category}"`);
  const questions = Array.isArray(batch.questions) ? batch.questions : null;
  if (!questions || questions.length === 0) {
    return { ok: false, errors: ["batch has no questions"] };
  }

  const labels = new Set();
  questions.forEach((q, i) => {
    const at = `question ${i}`;
    if (!q || typeof q !== "object") {
      errors.push(`${at}: not an object`);
      return;
    }
    const text = typeof q.question_text === "string" ? q.question_text.trim() : "";
    if (!text) errors.push(`${at}: question_text required`);
    else {
      if (EM_DASH_RE.test(text)) errors.push(`${at}: question_text contains an em dash`);
      if (EMOJI_RE.test(text)) errors.push(`${at}: question_text contains an emoji`);
      if (text.split(/\s+/).length > 45) errors.push(`${at}: question_text is too long for a timed item`);
    }

    const label = typeof q.question_label === "string" ? q.question_label.trim() : "";
    if (!label) errors.push(`${at}: question_label required (the dedupe key)`);
    else if (labels.has(label.toLowerCase())) errors.push(`${at}: duplicate question_label "${label}"`);
    else labels.add(label.toLowerCase());

    const options = Array.isArray(q.options) ? q.options : [];
    if (options.length !== 4) {
      errors.push(`${at}: must have exactly 4 options, got ${options.length}`);
    } else {
      const ids = new Set();
      const texts = new Set();
      for (const opt of options) {
        if (!opt || typeof opt !== "object") {
          errors.push(`${at}: each option must be { id, text }`);
          continue;
        }
        if (!OPTION_IDS.has(opt.id)) errors.push(`${at}: option id "${opt.id}" must be a/b/c/d`);
        else if (ids.has(opt.id)) errors.push(`${at}: duplicate option id "${opt.id}"`);
        else ids.add(opt.id);

        const optText = typeof opt.text === "string" ? opt.text.trim() : "";
        if (!optText) errors.push(`${at}: option ${opt.id}.text required`);
        else {
          if (texts.has(optText.toLowerCase())) errors.push(`${at}: duplicate option text "${optText}"`);
          else texts.add(optText.toLowerCase());
          if (EM_DASH_RE.test(optText)) errors.push(`${at}: option ${opt.id} contains an em dash`);
          if (EMOJI_RE.test(optText)) errors.push(`${at}: option ${opt.id} contains an emoji`);
        }
      }
      if (!options.some((o) => o.id === q.correct_option_id)) {
        errors.push(`${at}: correct_option_id "${q.correct_option_id}" matches no option`);
      }
    }

    if (typeof q.correct_option_id !== "string" || !OPTION_IDS.has(q.correct_option_id)) {
      errors.push(`${at}: correct_option_id must be one of a/b/c/d`);
    }
  });

  return { ok: errors.length === 0, errors };
}

// Deterministic verification across a batch. Returns per-question failures
// for questions the code could parse and that provably contradict their
// claimed answer. Unparseable questions are simply left to the LLM pass.
function deterministicFailures(category, batch) {
  const failures = [];
  for (const [i, q] of (batch.questions || []).entries()) {
    if (!q || !Array.isArray(q.options)) continue;
    const correct = q.options.find((o) => o.id === q.correct_option_id);
    const result = verifyCognitiveQuestion(
      { category, question_text: q.question_text },
      correct ? correct.text : "",
      q.options.map((o) => o.text)
    );
    if (result.checked && !result.ok) {
      failures.push(`question ${i} (deterministic check): ${result.reason}`);
    }
  }
  return failures;
}

// Inserts one published test and its questions, plus the covered labels, in
// one transaction so the dedupe registry can never drift from what is live.
async function insertTest(category, questions, generatedDate) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { time_limit_ms, skip_penalty_ms } = timeConfigFor(category, questions.length);
    const testRes = await client.query(
      `insert into cognitive_tests (category, generated_date, question_count, time_limit_ms, skip_penalty_ms)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [category, generatedDate, questions.length, time_limit_ms, skip_penalty_ms]
    );
    const testId = testRes.rows[0].id;

    for (const [i, q] of questions.entries()) {
      await client.query(
        `insert into cognitive_questions
           (test_id, order_index, question_text, options_json, correct_option_id, difficulty, explanation)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          testId,
          Number.isInteger(q.order_index) ? q.order_index : i,
          q.question_text,
          JSON.stringify(q.options),
          q.correct_option_id,
          q.difficulty || null,
          q.explanation || null,
        ]
      );
      if (q.question_label) {
        await client.query(
          `insert into covered_cognitive_questions (category, question_label)
           values ($1, $2) on conflict (question_label) do nothing`,
          [category, q.question_label]
        );
      }
    }
    await client.query("commit");
    return testId;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

// Generates and publishes one test for one category. `count` defaults to the
// standard session length; `dryRun` builds nothing and just reports.
export async function runCognitiveJob({
  category,
  count = DEFAULT_QUESTION_COUNT,
  dryRun = false,
} = {}) {
  if (!CATEGORY_SET.has(category)) {
    throw new Error(`unknown cognitive category "${category}"`);
  }
  const generatedDate = istDateString(Date.now());

  if (dryRun) {
    const { time_limit_ms, skip_penalty_ms } = timeConfigFor(category, count);
    return { status: "dry-run", category, count, time_limit_ms, skip_penalty_ms };
  }

  const covRes = await query(
    "select question_label from covered_cognitive_questions where category = $1 order by covered_at",
    [category]
  );
  const coveredLabels = covRes.rows.map((r) => r.question_label);

  let lastError = "unknown failure";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let batch;
    try {
      const gen = await cognitiveChat(
        buildCognitiveGenerationMessages(category, count, coveredLabels),
        { temperature: 0.8, json: true, topic: `cognitive-${category}` }
      );
      batch = JSON.parse(gen.content);
    } catch (err) {
      lastError = `generation error: ${err.message}`;
      console.error(`[cognitive:${category}] attempt ${attempt}: ${lastError}`);
      continue;
    }

    const auto = checkCognitiveBatch(category, batch);
    if (!auto.ok) {
      lastError = auto.errors.join("; ");
      console.error(`[cognitive:${category}] attempt ${attempt}: mechanical checks failed`);
      continue;
    }

    const detFailures = deterministicFailures(category, batch);
    if (detFailures.length > 0) {
      lastError = detFailures.join("; ");
      console.error(`[cognitive:${category}] attempt ${attempt}: deterministic verification failed`);
      continue;
    }

    let verdict;
    try {
      const vres = await cognitiveChat(
        buildCognitiveValidationMessages(category, batch, coveredLabels),
        { temperature: 0, json: true, topic: `cognitive-${category}` }
      );
      verdict = JSON.parse(vres.content);
    } catch (err) {
      lastError = `validation error: ${err.message}`;
      console.error(`[cognitive:${category}] attempt ${attempt}: ${lastError}`);
      continue;
    }

    if (verdict.verdict !== "pass") {
      lastError = ((verdict.questions || [])
        .filter((q) => !q.pass)
        .map((q) => `question ${q.index}: ${q.reason || "no reason"}`)
        .concat(verdict.notes ? [`notes: ${verdict.notes}`] : [])
        .join("; ")) || "validation failed";
      console.error(`[cognitive:${category}] attempt ${attempt}: validation failed`);
      continue;
    }

    try {
      const testId = await insertTest(category, batch.questions, generatedDate);
      await logRun({ status: "success", reason: `test ${testId} published` });
      console.log(`[cognitive:${category}] published test ${testId} with ${batch.questions.length} questions`);
      return { status: "success", category, test_id: testId, questions: batch.questions.length };
    } catch (err) {
      lastError = `insert error: ${err.message}`;
      console.error(`[cognitive:${category}] ${lastError}`);
      continue;
    }
  }

  await logRun({ status: "failure", reason: lastError });
  sendFailureAlert({ reason: lastError, category });
  return { status: "failure", category, reason: lastError };
}

// Runs the job for every category, one after another. Used by the daily run.
export async function runCognitiveBatchJob(opts = {}) {
  const results = [];
  for (const category of COGNITIVE_CATEGORIES) {
    results.push(await runCognitiveJob({ ...opts, category }));
  }
  return { status: "ok", results };
}

// ---------------------------------------------------------------
// Seed content (build order step 1: a small hardcoded set so the
// prefetch-then-run-locally loop and the timing mechanics can be built and
// verified before the generation pipeline exists).
// ---------------------------------------------------------------

const SEED = {
  numerical: [
    {
      question_text: "A shirt costs 800 rupees and is discounted by 25 percent. What is the sale price?",
      options: [
        { id: "a", text: "600" },
        { id: "b", text: "640" },
        { id: "c", text: "560" },
        { id: "d", text: "680" },
      ],
      correct_option_id: "a",
      difficulty: "easy",
    },
    {
      question_text: "What is 15 percent of 240?",
      options: [
        { id: "a", text: "24" },
        { id: "b", text: "30" },
        { id: "c", text: "36" },
        { id: "d", text: "42" },
      ],
      correct_option_id: "c",
      difficulty: "easy",
    },
    {
      question_text: "A ratio 3 to 4 is scaled so the first part becomes 18. What is the second part?",
      options: [
        { id: "a", text: "20" },
        { id: "b", text: "24" },
        { id: "c", text: "27" },
        { id: "d", text: "32" },
      ],
      correct_option_id: "b",
      difficulty: "medium",
    },
    {
      question_text: "A train covers 240 km in 3 hours. At the same speed, how far does it go in 5 hours?",
      options: [
        { id: "a", text: "320" },
        { id: "b", text: "360" },
        { id: "c", text: "400" },
        { id: "d", text: "480" },
      ],
      correct_option_id: "c",
      difficulty: "medium",
    },
    {
      question_text: "What is 12 * 3 + 4?",
      options: [
        { id: "a", text: "36" },
        { id: "b", text: "40" },
        { id: "c", text: "44" },
        { id: "d", text: "48" },
      ],
      correct_option_id: "b",
      difficulty: "easy",
    },
    {
      question_text: "The average of 8, 12, and 16 is what?",
      options: [
        { id: "a", text: "10" },
        { id: "b", text: "12" },
        { id: "c", text: "14" },
        { id: "d", text: "16" },
      ],
      correct_option_id: "b",
      difficulty: "easy",
    },
  ],
  verbal: [
    {
      question_text: "Choose the word closest in meaning to candid.",
      options: [
        { id: "a", text: "secretive" },
        { id: "b", text: "frank" },
        { id: "c", text: "hesitant" },
        { id: "d", text: "cheerful" },
      ],
      correct_option_id: "b",
      difficulty: "easy",
    },
    {
      question_text: "Complete the sentence. The report was so ______ that even the summary needed a summary.",
      options: [
        { id: "a", text: "concise" },
        { id: "b", text: "verbose" },
        { id: "c", text: "accurate" },
        { id: "d", text: "brief" },
      ],
      correct_option_id: "b",
      difficulty: "easy",
    },
    {
      question_text: "Choose the word most opposite in meaning to scarce.",
      options: [
        { id: "a", text: "rare" },
        { id: "b", text: "plentiful" },
        { id: "c", text: "costly" },
        { id: "d", text: "fragile" },
      ],
      correct_option_id: "b",
      difficulty: "medium",
    },
    {
      question_text: "Passage: The committee praised the plan but delayed funding it. What did the committee do?",
      options: [
        { id: "a", text: "rejected the plan" },
        { id: "b", text: "approved the funding" },
        { id: "c", text: "praised but postponed it" },
        { id: "d", text: "ignored the plan" },
      ],
      correct_option_id: "c",
      difficulty: "medium",
    },
    {
      question_text: "Choose the word closest in meaning to meticulous.",
      options: [
        { id: "a", text: "careless" },
        { id: "b", text: "thorough" },
        { id: "c", text: "hurried" },
        { id: "d", text: "doubtful" },
      ],
      correct_option_id: "b",
      difficulty: "easy",
    },
    {
      question_text: "Complete the sentence. She spoke with such ______ that no one doubted her sincerity.",
      options: [
        { id: "a", text: "hesitation" },
        { id: "b", text: "conviction" },
        { id: "c", text: "confusion" },
        { id: "d", text: "distance" },
      ],
      correct_option_id: "b",
      difficulty: "medium",
    },
  ],
  abstract: [
    {
      question_text: "Which letter comes next? A, C, F, J, ?",
      options: [
        { id: "a", text: "M" },
        { id: "b", text: "N" },
        { id: "c", text: "O" },
        { id: "d", text: "P" },
      ],
      correct_option_id: "c",
      difficulty: "medium",
    },
    {
      question_text: "Which letter comes next? Z, X, V, T, ?",
      options: [
        { id: "a", text: "S" },
        { id: "b", text: "R" },
        { id: "c", text: "Q" },
        { id: "d", text: "P" },
      ],
      correct_option_id: "b",
      difficulty: "easy",
    },
    {
      question_text: "Which letter comes next? A, B, D, G, K, ?",
      options: [
        { id: "a", text: "O" },
        { id: "b", text: "P" },
        { id: "c", text: "Q" },
        { id: "d", text: "N" },
      ],
      correct_option_id: "b",
      difficulty: "hard",
    },
    {
      question_text: "Which letter comes next? A, D, G, J, ?",
      options: [
        { id: "a", text: "K" },
        { id: "b", text: "L" },
        { id: "c", text: "M" },
        { id: "d", text: "N" },
      ],
      correct_option_id: "c",
      difficulty: "easy",
    },
    {
      question_text: "Which letter comes next? C, F, I, L, ?",
      options: [
        { id: "a", text: "N" },
        { id: "b", text: "O" },
        { id: "c", text: "P" },
        { id: "d", text: "M" },
      ],
      correct_option_id: "b",
      difficulty: "easy",
    },
    {
      question_text: "Which letter comes next? X, V, T, R, ?",
      options: [
        { id: "a", text: "P" },
        { id: "b", text: "Q" },
        { id: "c", text: "O" },
        { id: "d", text: "N" },
      ],
      correct_option_id: "a",
      difficulty: "easy",
    },
  ],
  logical: [
    {
      question_text: "Ravi is taller than Meera. Meera is taller than Arjun. Who is the shortest?",
      options: [
        { id: "a", text: "Ravi" },
        { id: "b", text: "Meera" },
        { id: "c", text: "Arjun" },
        { id: "d", text: "Cannot be determined" },
      ],
      correct_option_id: "c",
      difficulty: "easy",
    },
    {
      question_text: "Martha is faster than James. James is faster than Priya. Who is the slowest?",
      options: [
        { id: "a", text: "Martha" },
        { id: "b", text: "James" },
        { id: "c", text: "Priya" },
        { id: "d", text: "Cannot be determined" },
      ],
      correct_option_id: "c",
      difficulty: "easy",
    },
    {
      question_text: "Sam is older than Rita. Rita is older than Tom. Who is the oldest?",
      options: [
        { id: "a", text: "Sam" },
        { id: "b", text: "Rita" },
        { id: "c", text: "Tom" },
        { id: "d", text: "Cannot be determined" },
      ],
      correct_option_id: "a",
      difficulty: "easy",
    },
    {
      question_text: "Neha is heavier than Omar. Kiran is heavier than Omar. Who is the heaviest?",
      options: [
        { id: "a", text: "Neha" },
        { id: "b", text: "Kiran" },
        { id: "c", text: "Omar" },
        { id: "d", text: "Cannot be determined" },
      ],
      correct_option_id: "d",
      difficulty: "medium",
    },
    {
      question_text: "Dan is taller than Eve. Eve is shorter than Faye. Who is the tallest?",
      options: [
        { id: "a", text: "Dan" },
        { id: "b", text: "Eve" },
        { id: "c", text: "Faye" },
        { id: "d", text: "Cannot be determined" },
      ],
      correct_option_id: "d",
      difficulty: "hard",
    },
    {
      question_text: "Liam is younger than Mia. Mia is younger than Noah. Who is the youngest?",
      options: [
        { id: "a", text: "Liam" },
        { id: "b", text: "Mia" },
        { id: "c", text: "Noah" },
        { id: "d", text: "Cannot be determined" },
      ],
      correct_option_id: "a",
      difficulty: "easy",
    },
  ],
};

// Inserts the seed test for a category only when that category has no test
// yet, so it never overwrites generated content and is a one-time bootstrap.
export async function ensureCognitiveSeed() {
  const today = istDateString(Date.now());
  let inserted = 0;
  for (const category of COGNITIVE_CATEGORIES) {
    const existing = await query(
      "select 1 from cognitive_tests where category = $1 limit 1",
      [category]
    );
    if (existing.rows.length > 0) continue;
    const questions = SEED[category].map((q, i) => ({
      ...q,
      order_index: i,
      question_label: `seed:${category}:${i}`,
      explanation: null,
    }));
    await insertTest(category, questions, today);
    inserted += 1;
  }
  return { inserted };
}
