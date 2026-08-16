import { API_BASE, USE_MOCK } from "./config";
import { getUserId } from "./client";

// Quiz answer recording. Each quiz card's instant right/wrong feedback is
// computed client-side from the card's correct_option_id; this module
// records the answer to the backend (POST /api/quizzes/answer) so the
// data exists, without any aggregate scoring UI. Mock mode (no backend)
// keeps a local mirror keyed by card id.

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

// Records one quiz answer. Fire and forget in real mode (the UI must not
// block on the network); the local mirror is always written so mock mode
// and offline dev still have the answer.
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
