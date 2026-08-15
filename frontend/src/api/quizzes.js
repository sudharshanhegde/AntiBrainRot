import { API_BASE, USE_MOCK } from "./config";
import { getUserId } from "./client";

// Quiz answers and end-of-deck scoring. Real mode talks to the Express
// API (POST /api/quizzes/answer, GET /api/quizzes/score), which is the
// source of truth. Mock mode (no backend) keeps a local mirror keyed by
// card id so the end card can still show a score.

const KEY = "antibrainrot:quiz_answers";

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeLocal(answers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // storage unavailable; answers are not persisted but the session works
  }
}

// Records one quiz answer. Fire and forget in real mode; the local
// mirror is always written so mock mode and offline dev still score.
export async function submitQuizAnswer({ cardId, selectedOptionId, isCorrect }) {
  if (cardId == null) return;
  if (!USE_MOCK) {
    try {
      await fetch(`${API_BASE}/api/quizzes/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: getUserId(),
          card_id: cardId,
          selected_option_id: selectedOptionId,
        }),
      });
    } catch (err) {
      console.warn("quiz answer could not be recorded on the API", err);
    }
  }

  const local = readLocal();
  local[cardId] = { selectedOptionId, isCorrect, answeredAt: Date.now() };
  writeLocal(local);
}

// Fresh score for a set of quiz card ids, computed at request time so a
// revisited-and-changed answer is reflected. Returns { correct, total }.
export async function fetchQuizScore(cardIds) {
  if (!cardIds || cardIds.length === 0) {
    return { correct: 0, total: 0 };
  }

  if (USE_MOCK) {
    const local = readLocal();
    const correct = cardIds.filter((id) => local[id] && local[id].isCorrect).length;
    return { correct, total: cardIds.length };
  }

  const userId = getUserId();
  const res = await fetch(
    `${API_BASE}/api/quizzes/score?user_id=${encodeURIComponent(userId)}&card_ids=${cardIds.join(",")}`
  );
  if (!res.ok) return { correct: 0, total: cardIds.length };
  const data = await res.json();
  return data.score || { correct: 0, total: cardIds.length };
}
