import { USE_MOCK } from "./config";
import { apiFetch, getUserId } from "./client";

// Cognitive test data service.
//
// The whole point of this module is that the client fetches a complete test
// in ONE request (fetchCognitiveTest) and then runs the entire loop locally
// with no network calls, so network latency never contaminates the time
// measurement. The only other call is a single submit at the end. Correct
// answers are never sent to the client; grading happens on the server and
// comes back with the scored breakdown on submit.
//
// With VITE_USE_MOCK=true the module grades locally against a small
// placeholder set, so the module is fully testable with no backend.

const MOCK_LATENCY = 120;
const mockDelay = () => new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY));

// Per-question budget mirrors the backend's tunable table so mock timing
// behaves like the real thing.
const MOCK_PER_QUESTION_MS = {
  numerical: 45000,
  verbal: 45000,
  abstract: 40000,
  logical: 40000,
};

export const COGNITIVE_CATEGORY_ORDER = ["numerical", "verbal", "abstract", "logical"];

export const COGNITIVE_CATEGORY_META = {
  numerical: {
    label: "Numerical reasoning",
    description: "Arithmetic, percentages, ratios, and quick data interpretation under time pressure.",
  },
  verbal: {
    label: "Verbal reasoning",
    description: "Vocabulary, sentence completion, and short-passage comprehension.",
  },
  abstract: {
    label: "Abstract reasoning",
    description: "Shape, sequence, and pattern completion, visual logic with almost no words.",
  },
  logical: {
    label: "Logical reasoning",
    description: "Deduction from stated relationships, like ordering puzzles.",
  },
};

const opt = (id, text) => ({ id, text });

const MOCK_TESTS = {
  numerical: {
    questions: [
      {
        id: 1001,
        question_text: "A shirt costs 800 rupees and is discounted by 25 percent. What is the sale price?",
        options: [opt("a", "600"), opt("b", "640"), opt("c", "560"), opt("d", "680")],
        correct_option_id: "a",
        difficulty: "easy",
      },
      {
        id: 1002,
        question_text: "What is 15 percent of 240?",
        options: [opt("a", "24"), opt("b", "30"), opt("c", "36"), opt("d", "42")],
        correct_option_id: "c",
        difficulty: "easy",
      },
      {
        id: 1003,
        question_text: "A train covers 240 km in 3 hours. At the same speed, how far in 5 hours?",
        options: [opt("a", "320"), opt("b", "360"), opt("c", "400"), opt("d", "480")],
        correct_option_id: "c",
        difficulty: "medium",
      },
      {
        id: 1004,
        question_text: "What is 12 * 3 + 4?",
        options: [opt("a", "36"), opt("b", "40"), opt("c", "44"), opt("d", "48")],
        correct_option_id: "b",
        difficulty: "easy",
      },
    ],
  },
  verbal: {
    questions: [
      {
        id: 2001,
        question_text: "Choose the word closest in meaning to candid.",
        options: [opt("a", "secretive"), opt("b", "frank"), opt("c", "hesitant"), opt("d", "cheerful")],
        correct_option_id: "b",
        difficulty: "easy",
      },
      {
        id: 2002,
        question_text: "Complete the sentence. The report was so ______ that even the summary needed a summary.",
        options: [opt("a", "concise"), opt("b", "verbose"), opt("c", "accurate"), opt("d", "brief")],
        correct_option_id: "b",
        difficulty: "easy",
      },
      {
        id: 2003,
        question_text: "Choose the word most opposite in meaning to scarce.",
        options: [opt("a", "rare"), opt("b", "plentiful"), opt("c", "costly"), opt("d", "fragile")],
        correct_option_id: "b",
        difficulty: "medium",
      },
      {
        id: 2004,
        question_text: "Passage: The committee praised the plan but delayed funding it. What did the committee do?",
        options: [
          opt("a", "rejected the plan"),
          opt("b", "approved the funding"),
          opt("c", "praised but postponed it"),
          opt("d", "ignored the plan"),
        ],
        correct_option_id: "c",
        difficulty: "medium",
      },
    ],
  },
  abstract: {
    questions: [
      {
        id: 3001,
        question_text: "Which letter comes next? A, C, F, J, ?",
        options: [opt("a", "M"), opt("b", "N"), opt("c", "O"), opt("d", "P")],
        correct_option_id: "c",
        difficulty: "medium",
      },
      {
        id: 3002,
        question_text: "Which letter comes next? Z, X, V, T, ?",
        options: [opt("a", "S"), opt("b", "R"), opt("c", "Q"), opt("d", "P")],
        correct_option_id: "b",
        difficulty: "easy",
      },
      {
        id: 3003,
        question_text: "Which letter comes next? A, D, G, J, ?",
        options: [opt("a", "K"), opt("b", "L"), opt("c", "M"), opt("d", "N")],
        correct_option_id: "c",
        difficulty: "easy",
      },
      {
        id: 3004,
        question_text: "Which letter comes next? C, F, I, L, ?",
        options: [opt("a", "N"), opt("b", "O"), opt("c", "P"), opt("d", "M")],
        correct_option_id: "b",
        difficulty: "easy",
      },
    ],
  },
  logical: {
    questions: [
      {
        id: 4001,
        question_text: "Ravi is taller than Meera. Meera is taller than Arjun. Who is the shortest?",
        options: [
          opt("a", "Ravi"),
          opt("b", "Meera"),
          opt("c", "Arjun"),
          opt("d", "Cannot be determined"),
        ],
        correct_option_id: "c",
        difficulty: "easy",
      },
      {
        id: 4002,
        question_text: "Martha is faster than James. James is faster than Priya. Who is the slowest?",
        options: [
          opt("a", "Martha"),
          opt("b", "James"),
          opt("c", "Priya"),
          opt("d", "Cannot be determined"),
        ],
        correct_option_id: "c",
        difficulty: "easy",
      },
      {
        id: 4003,
        question_text: "Neha is heavier than Omar. Kiran is heavier than Omar. Who is the heaviest?",
        options: [
          opt("a", "Neha"),
          opt("b", "Kiran"),
          opt("c", "Omar"),
          opt("d", "Cannot be determined"),
        ],
        correct_option_id: "d",
        difficulty: "medium",
      },
      {
        id: 4004,
        question_text: "Liam is younger than Mia. Mia is younger than Noah. Who is the youngest?",
        options: [
          opt("a", "Liam"),
          opt("b", "Mia"),
          opt("c", "Noah"),
          opt("d", "Cannot be determined"),
        ],
        correct_option_id: "a",
        difficulty: "easy",
      },
    ],
  },
};

// Mock attempt history, per session only (module memory), so the trend block
// has something to compare against while developing offline.
const mockHistory = new Map();

async function mockTest(category) {
  await mockDelay();
  const src = MOCK_TESTS[category];
  if (!src) throw new Error("unknown category");
  const per = MOCK_PER_QUESTION_MS[category] || 45000;
  return {
    id: `mock-${category}`,
    category,
    label: COGNITIVE_CATEGORY_META[category].label,
    test_index: 0,
    day: 0,
    question_count: src.questions.length,
    time_limit_ms: per * src.questions.length,
    skip_penalty_ms: per,
    questions: src.questions.map((q, i) => ({
      id: q.id,
      order_index: i,
      question_text: q.question_text,
      options: q.options,
      difficulty: q.difficulty,
    })),
  };
}

function mockDescribeRating(score, count, totalTimeMs, perBudget) {
  if (!count) return "no questions answered";
  const accuracy = score / count;
  const avg = totalTimeMs / count;
  const fast = avg <= perBudget * 0.6;
  if (accuracy >= 0.8 && fast) return "fast and mostly accurate";
  if (accuracy >= 0.8) return "accurate, a little deliberate";
  if (accuracy >= 0.5 && fast) return "quick, with a few misses";
  if (accuracy >= 0.5) return "steady, a few misses worth revisiting";
  return "worth another run to build accuracy";
}

function mockSubmit(payload) {
  const category = payload.category;
  const src = MOCK_TESTS[category];
  if (!src) throw new Error("unknown category");
  const per = MOCK_PER_QUESTION_MS[category] || 45000;
  const byId = new Map(src.questions.map((q) => [q.id, q]));
  const answerMap = new Map(
    (payload.answers || []).map((a) => [Number(a.question_id), a])
  );

  let score = 0;
  const breakdown = src.questions.map((q, i) => {
    const a = answerMap.get(q.id) || {};
    const wasSkipped = Boolean(a.was_skipped) || a.selected_option_id == null;
    const selected = wasSkipped ? null : String(a.selected_option_id);
    const isCorrect = !wasSkipped && selected === q.correct_option_id;
    if (isCorrect) score += 1;
    return {
      question_id: q.id,
      order_index: i,
      question_text: q.question_text,
      options: q.options,
      selected_option_id: selected,
      correct_option_id: q.correct_option_id,
      is_correct: isCorrect,
      time_taken_ms: Math.max(0, Math.round(Number(a.time_taken_ms) || 0)),
      was_skipped: wasSkipped,
      explanation: null,
    };
  });

  const questionCount = src.questions.length;
  const totalTimeMs = Math.max(0, Math.round(Number(payload.total_time_ms) || 0));
  const rating = mockDescribeRating(score, questionCount, totalTimeMs, per);

  const prev = mockHistory.get(category) || [];
  let trend = null;
  if (prev.length > 0) {
    const accSum = prev.reduce((s, r) => s + r.score / r.question_count, 0);
    const timeSum = prev.reduce((s, r) => s + r.total_time_ms, 0);
    trend = {
      attempts: prev.length,
      avg_accuracy: accSum / prev.length,
      avg_time_ms: timeSum / prev.length,
    };
  }

  const attempt = {
    id: `mock-attempt-${Date.now()}`,
    category,
    completed_at: new Date().toISOString(),
    score,
    question_count: questionCount,
    total_time_ms: totalTimeMs,
    rating,
  };
  mockHistory.set(category, [attempt, ...prev].slice(0, 10));

  return { status: "ok", attempt, breakdown, trend };
}

// The four categories with the user's most recent attempt per category.
export async function fetchCognitiveCategories() {
  if (USE_MOCK) {
    await mockDelay();
    return COGNITIVE_CATEGORY_ORDER.map((id) => {
      const attempts = mockHistory.get(id) || [];
      const last = attempts[0] || null;
      return {
        id,
        label: COGNITIVE_CATEGORY_META[id].label,
        description: COGNITIVE_CATEGORY_META[id].description,
        available: true,
        total_tests: 1,
        completed_tests: attempts.length > 0 ? 1 : 0,
        last_attempt: last,
      };
    });
  }
  const userId = getUserId();
  const res = await apiFetch(`/api/cognitive/categories?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error("could not load the tests");
  const data = await res.json();
  return data.categories || [];
}

// The single prefetch request: the whole test, questions and timings, with no
// correct answers included. Pass a testIndex (day) to load a specific past
// test; omit it for the newest one.
export async function fetchCognitiveTest(category, testIndex = null) {
  if (USE_MOCK) return mockTest(category);
  const base = `/api/cognitive/tests/${encodeURIComponent(category)}`;
  const path = testIndex == null ? base : `${base}/${Number(testIndex)}`;
  const res = await apiFetch(path);
  if (res.status === 404) throw new Error("no test available for this category yet");
  if (!res.ok) throw new Error("could not load the test");
  const data = await res.json();
  return data.test;
}

// The published tests for a category as numbered days (Test 0, Test 1, ...),
// each with this user's completion state, so a past test can be reopened and
// retaken. Mirrors the topic-deck days list.
export async function fetchCognitiveDays(category) {
  if (USE_MOCK) {
    await mockDelay();
    const attempts = mockHistory.get(category) || [];
    return [
      {
        test_id: `mock-${category}`,
        test_index: 0,
        day: 0,
        generated_date: null,
        question_count: (MOCK_TESTS[category]?.questions || []).length,
        completed: attempts.length > 0,
        attempt_count: attempts.length,
        best_score: attempts.length ? Math.max(...attempts.map((a) => a.score)) : null,
      },
    ];
  }
  const userId = getUserId();
  const res = await apiFetch(
    `/api/cognitive/days?category=${encodeURIComponent(category)}&user_id=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error("could not load this category's tests");
  const data = await res.json();
  return data.days || [];
}

// The single write: the finished attempt, graded server-side. Returns
// { attempt, breakdown, trend }.
export async function submitCognitiveAttempt({ testId, category, totalTimeMs, answers }) {
  if (USE_MOCK) {
    await mockDelay();
    return mockSubmit({ category, total_time_ms: totalTimeMs, answers });
  }
  const userId = getUserId();
  const res = await apiFetch("/api/cognitive/attempts", {
    method: "POST",
    body: JSON.stringify({
      test_id: testId,
      user_id: userId,
      total_time_ms: totalTimeMs,
      answers,
    }),
  });
  if (!res.ok) throw new Error("could not save your test");
  return res.json();
}

// Recent completed attempts for the trend block, newest first.
export async function fetchCognitiveHistory(category, limit = 10) {
  if (USE_MOCK) {
    await mockDelay();
    return mockHistory.get(category) || [];
  }
  const userId = getUserId();
  const res = await apiFetch(
    `/api/cognitive/history?user_id=${encodeURIComponent(userId)}&category=${encodeURIComponent(
      category
    )}&limit=${limit}`
  );
  if (!res.ok) throw new Error("could not load your test history");
  const data = await res.json();
  return data.attempts || [];
}
