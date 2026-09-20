import { Router } from "express";
import { query } from "../db.js";
import { optionalUserId } from "../auth.js";
import { runCognitiveJob } from "../generate/cognitive.js";
import {
  COGNITIVE_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
} from "../generate/cognitivePrompts.js";

// Cognitive speed and accuracy test routes.
//
// A separate module from every other feed in the app: one question on screen,
// tap to answer, a running countdown, scored on both correctness and speed.
//
// The client prefetches a whole test in one request (GET /tests/:category)
// and runs the entire loop locally, with zero network calls between
// questions, so network latency is never part of the measurement. The test
// payload deliberately omits every correct_option_id: grading happens here on
// submit, so the client cannot read the answer key out of the response. The
// only write is a single POST of the finished attempt.
//
// Unlike the topic feed, results are personal only: there is no route here
// that ranks users against each other. The history route exists so a user can
// compare this attempt against their own recent average.
//
// All routes use optionalUserId: content is public and guests can take a test,
// with results stored against the same anonymous user_id convention as Quick
// Bites; a signed-in user id is preferred when a token is present.

export const cognitiveRouter = Router();

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 50;

function isCategory(value) {
  return COGNITIVE_CATEGORIES.includes(value);
}

// Shared-secret guard for the generation route, the same check the daily
// generate endpoint uses. Only a caller holding GENERATION_SECRET can trigger
// a paid LLM run.
function requireGenerationSecret(req, res) {
  const expected = process.env.GENERATION_SECRET
    ? `Bearer ${process.env.GENERATION_SECRET}`
    : "";
  if (!expected || req.headers.authorization !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// POST /api/cognitive/generate
//   header: Authorization: Bearer <GENERATION_SECRET>
//   query:  ?category=<numerical|verbal|abstract|logical>  (omit or "all" for every category)
//           &count=<n>     questions per test (default 12)
//           &dry_run=1     report the timing config without calling the model
//
// Generates and publishes fresh tests through the normal two-pass flow
// (generate, mechanical + deterministic checks, LLM validation). Kept on the
// cognitive router so it can be triggered on its own without running the
// whole daily deck job.
cognitiveRouter.post("/generate", async (req, res) => {
  if (!requireGenerationSecret(req, res)) return;

  try {
    const dryRun = req.query.dry_run === "1";
    const countParam = Number(req.query.count);
    const count = Number.isInteger(countParam) && countParam > 0 ? countParam : undefined;

    const raw = req.query.category ? String(req.query.category) : "all";
    const categories =
      raw === "all" || raw === "" ? COGNITIVE_CATEGORIES : raw.split(",").map((s) => s.trim());

    const unknown = categories.filter((c) => !isCategory(c));
    if (unknown.length > 0) {
      return res.status(400).json({ error: `unknown category: ${unknown.join(", ")}` });
    }

    const results = [];
    for (const category of categories) {
      results.push(await runCognitiveJob({ category, count, dryRun }));
    }
    res.json({ status: "ok", dry_run: dryRun, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "cognitive generation failed" });
  }
});

function toPublicQuestion(r) {
  return {
    id: r.id,
    order_index: r.order_index,
    question_text: r.question_text,
    options: r.options_json || [],
    difficulty: r.difficulty,
  };
}

// A short, plain-words descriptive read of an attempt. Deliberately not a
// percentile or a verdict: the wording stays useful and calm, and never uses
// words like failed, behind, or weak, because this measures something people
// can reasonably feel sensitive about.
function describeRating(score, questionCount, totalTimeMs, timeLimitMs) {
  if (!questionCount) return "no questions answered";
  const accuracy = score / questionCount;
  const avgMs = totalTimeMs / questionCount;
  const perBudget = timeLimitMs > 0 ? timeLimitMs / questionCount : avgMs || 1;
  const fast = avgMs <= perBudget * 0.6;

  if (accuracy >= 0.8 && fast) return "fast and mostly accurate";
  if (accuracy >= 0.8) return "accurate, a little deliberate";
  if (accuracy >= 0.5 && fast) return "quick, with a few misses";
  if (accuracy >= 0.5) return "steady, a few misses worth revisiting";
  return "worth another run to build accuracy";
}

// GET /api/cognitive/categories?user_id=...
// The four categories with their labels, plus the requesting user's most
// recent attempt per category so the picker can show a light summary.
cognitiveRouter.get("/categories", optionalUserId, async (req, res) => {
  try {
    const userId = req.userId || String(req.query.user_id || "");
    const { rows } = await query(
      `select distinct on (category)
              category, score, question_count, total_time_ms, completed_at, rating
         from cognitive_attempts
        where user_id = $1 and completed_at is not null
        order by category, completed_at desc`,
      [userId]
    );
    const byCategory = new Map(rows.map((r) => [r.category, r]));

    const testRows = await query("select distinct category from cognitive_tests");
    const withTest = new Set(testRows.rows.map((r) => r.category));

    res.json({
      status: "ok",
      categories: COGNITIVE_CATEGORIES.map((category) => {
        const last = byCategory.get(category);
        return {
          id: category,
          label: CATEGORY_LABELS[category],
          description: CATEGORY_DESCRIPTIONS[category],
          available: withTest.has(category),
          last_attempt: last
            ? {
                score: last.score,
                question_count: last.question_count,
                total_time_ms: last.total_time_ms,
                completed_at: last.completed_at,
                rating: last.rating,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load cognitive categories" });
  }
});

// GET /api/cognitive/tests/:category
// The most recent published test for the category, questions included and
// correct answers excluded. This is the single prefetch request the client
// makes before the timer starts.
cognitiveRouter.get("/tests/:category", async (req, res) => {
  try {
    const category = String(req.params.category || "");
    if (!isCategory(category)) {
      return res.status(400).json({ error: "unknown category" });
    }

    const testRes = await query(
      `select id, category, question_count, time_limit_ms, skip_penalty_ms
         from cognitive_tests
        where category = $1
        order by generated_date desc, id desc
        limit 1`,
      [category]
    );
    const test = testRes.rows[0];
    if (!test) {
      return res.status(404).json({ error: "no test available for this category yet" });
    }

    const qRes = await query(
      `select id, order_index, question_text, options_json, difficulty
         from cognitive_questions
        where test_id = $1
        order by order_index asc`,
      [test.id]
    );

    res.json({
      status: "ok",
      test: {
        id: test.id,
        category: test.category,
        label: CATEGORY_LABELS[test.category],
        question_count: test.question_count,
        time_limit_ms: test.time_limit_ms,
        skip_penalty_ms: test.skip_penalty_ms,
        questions: qRes.rows.map(toPublicQuestion),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load the test" });
  }
});

// POST /api/cognitive/attempts
// body: { test_id, user_id?, total_time_ms, answers: [
//   { question_id, selected_option_id|null, time_taken_ms, was_skipped } ] }
//
// The single write in the whole loop: the client runs the test with no
// network calls, then syncs the finished attempt once. Grading happens here,
// against the stored answer key, and the response returns the scored
// per-question breakdown plus this attempt's standing against the user's own
// recent average.
cognitiveRouter.post("/attempts", optionalUserId, async (req, res) => {
  try {
    const userId = req.userId || String(req.body.user_id || "");
    const testId = Number(req.body.test_id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "test_id required" });
    }
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

    const testRes = await query(
      `select id, category, question_count, time_limit_ms from cognitive_tests where id = $1`,
      [testId]
    );
    const test = testRes.rows[0];
    if (!test) return res.status(404).json({ error: "unknown test" });

    const qRes = await query(
      `select id, order_index, question_text, options_json, correct_option_id, explanation
         from cognitive_questions
        where test_id = $1
        order by order_index asc`,
      [testId]
    );
    const questions = qRes.rows;
    const byId = new Map(questions.map((q) => [q.id, q]));

    // Grade every question in order, defaulting anything the client did not
    // send (including anything left unanswered when the clock ran out) to a
    // skipped answer with no time recorded.
    const answerByQuestion = new Map();
    for (const a of answers) {
      const qid = Number(a.question_id);
      if (byId.has(qid)) answerByQuestion.set(qid, a);
    }

    let score = 0;
    const graded = questions.map((q) => {
      const a = answerByQuestion.get(q.id) || {};
      const wasSkipped = Boolean(a.was_skipped) || a.selected_option_id == null;
      const selected = wasSkipped ? null : String(a.selected_option_id);
      const isCorrect = !wasSkipped && selected === q.correct_option_id;
      if (isCorrect) score += 1;
      return {
        question_id: q.id,
        order_index: q.order_index,
        question_text: q.question_text,
        options: q.options_json || [],
        selected_option_id: selected,
        correct_option_id: q.correct_option_id,
        is_correct: isCorrect,
        time_taken_ms: Math.max(0, Math.round(Number(a.time_taken_ms) || 0)),
        was_skipped: wasSkipped,
        explanation: q.explanation || null,
      };
    });

    const questionCount = questions.length || test.question_count || 0;
    const totalTimeMs = Math.max(0, Math.round(Number(req.body.total_time_ms) || 0));
    const rating = describeRating(score, questionCount, totalTimeMs, test.time_limit_ms);

    const attemptRes = await query(
      `insert into cognitive_attempts
         (user_id, test_id, category, completed_at, total_time_ms, score, question_count, rating)
       values ($1, $2, $3, now(), $4, $5, $6, $7)
       returning id, completed_at`,
      [userId, testId, test.category, totalTimeMs, score, questionCount, rating]
    );
    const attempt = attemptRes.rows[0];

    for (const g of graded) {
      await query(
        `insert into cognitive_answers
           (attempt_id, question_id, selected_option_id, is_correct, time_taken_ms, was_skipped)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          attempt.id,
          g.question_id,
          g.selected_option_id,
          g.is_correct,
          g.time_taken_ms,
          g.was_skipped,
        ]
      );
    }

    // Category-level pattern: this attempt against the user's own recent
    // average for the same category. Accuracy and speed as two plain numbers,
    // not a chart.
    const prevRes = await query(
      `select score, question_count, total_time_ms
         from cognitive_attempts
        where user_id = $1 and category = $2 and completed_at is not null and id <> $3
        order by completed_at desc
        limit 10`,
      [userId, test.category, attempt.id]
    );
    const prev = prevRes.rows;
    let trend = null;
    if (prev.length > 0) {
      const accSum = prev.reduce(
        (sum, r) => sum + (r.question_count ? r.score / r.question_count : 0),
        0
      );
      const timeSum = prev.reduce((sum, r) => sum + (r.total_time_ms || 0), 0);
      trend = {
        attempts: prev.length,
        avg_accuracy: accSum / prev.length,
        avg_time_ms: timeSum / prev.length,
      };
    }

    res.json({
      status: "ok",
      attempt: {
        id: attempt.id,
        category: test.category,
        completed_at: attempt.completed_at,
        score,
        question_count: questionCount,
        total_time_ms: totalTimeMs,
        rating,
      },
      breakdown: graded,
      trend,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not save the attempt" });
  }
});

// GET /api/cognitive/history?category=&user_id=&limit=
// Recent completed attempts, newest first, for the category trend and the
// picker summary. Personal only.
cognitiveRouter.get("/history", optionalUserId, async (req, res) => {
  try {
    const userId = req.userId || String(req.query.user_id || "");
    const category = req.query.category ? String(req.query.category) : null;
    if (category && !isCategory(category)) {
      return res.status(400).json({ error: "unknown category" });
    }
    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_HISTORY_LIMIT)
        : DEFAULT_HISTORY_LIMIT;

    const params = [userId];
    let where = "user_id = $1 and completed_at is not null";
    if (category) {
      params.push(category);
      where += ` and category = $2`;
    }
    params.push(limit);

    const { rows } = await query(
      `select id, category, score, question_count, total_time_ms, rating, completed_at
         from cognitive_attempts
        where ${where}
        order by completed_at desc
        limit $${params.length}`,
      params
    );

    res.json({ status: "ok", attempts: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load test history" });
  }
});
