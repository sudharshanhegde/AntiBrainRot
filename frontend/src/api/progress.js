import { API_BASE, USE_MOCK } from "./config";
import { getTopicId, getUserId } from "./client";

export { getUserId };

// Progress and cooldown. In real mode the backend is the source of
// truth: completing a deck is POSTed to /api/progress, and the topic
// list reads the computed cooldown state from GET /api/progress. A
// local mirror is kept only to support mock mode (no backend), where
// cooldown is a client-side convenience.

const KEY = "antibrainrot:progress";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function write(progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // storage unavailable; cooldown is lost but the session works
  }
}

// Marks a deck completed for a user. Fire and forget; the local mirror
// is written as well so mock mode and offline dev still show cooldown.
export async function markDeckCompleted(topicSlug, deckIndex) {
  if (!USE_MOCK) {
    try {
      const topicId = await getTopicId(topicSlug);
      await fetch(`${API_BASE}/api/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: getUserId(),
          topic_id: topicId,
          deck_index: deckIndex,
        }),
      });
    } catch (err) {
      console.warn("progress could not be recorded on the API", err);
    }
  }

  const progress = read();
  progress[topicSlug] = { lastDeckIndex: deckIndex, lastCompletedAt: Date.now() };
  write(progress);
}

// Returns a Map of topic_slug to { is_on_cooldown, cooldown_remaining_hours }.
// Real mode reads the authoritative state from the backend; mock mode
// derives it from the local mirror.
export async function fetchCooldownMap() {
  if (USE_MOCK) {
    const now = Date.now();
    const map = new Map();
    for (const [slug, entry] of Object.entries(read())) {
      const onCooldown = entry && now - entry.lastCompletedAt < COOLDOWN_MS;
      map.set(slug, {
        is_on_cooldown: onCooldown,
        cooldown_remaining_hours: onCooldown
          ? Math.ceil((COOLDOWN_MS - (now - entry.lastCompletedAt)) / (60 * 60 * 1000))
          : 0,
      });
    }
    return map;
  }

  const userId = getUserId();
  const res = await fetch(
    `${API_BASE}/api/progress?user_id=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error("could not load progress from the API");
  const { progress } = await res.json();
  return new Map(progress.map((p) => [p.topic_slug, p]));
}
