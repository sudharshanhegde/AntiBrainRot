
import { USE_MOCK } from "./config";
import { apiFetch, getTopicId, getUserId, isSignedIn } from "./client";
import { localDateString } from "./auth";

export { getUserId };

// Progress and cooldown. In real mode the backend is the source of
// truth: completing a deck is POSTed to /api/progress, and the topic
// list reads the computed cooldown state from GET /api/progress. A
// local mirror is kept only to support mock mode (no backend), where
// cooldown is a client-side convenience, and to hold the resume card
// position for guests.

const KEY = "antibrainrot:progress";
const COOLDOWN_MS = 12 * 60 * 60 * 1000; // matches backend COOLDOWN_HOURS default

// Latest /api/progress response, so opening a topic can restore the
// resume position without a second network round trip right after the
// topic list already loaded the same data.
let cooldownCache = null;

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
// The user's local calendar date is sent so the account-level daily
// streak is counted in their own timezone (SKILL_auth.md). Completing a
// deck resets the resume position: the mirror entry is replaced without
// a lastViewedCardIndex and the backend cache is dropped so the next
// open starts at card 0 (SKILL_profile_progress.md).
export async function markDeckCompleted(topicSlug, deckIndex) {
  if (!USE_MOCK) {
    try {
      const topicId = await getTopicId(topicSlug);
      const res = await apiFetch("/api/progress", {
        method: "POST",
        body: JSON.stringify({
          topic_id: topicId,
          deck_index: deckIndex,
          local_date: localDateString(),
        }),
      });
      if (res.status === 401) {
        console.warn("progress requires sign-in; deck not recorded");
      }
    } catch (err) {
      console.warn("progress could not be recorded on the API", err);
    }
    cooldownCache = null;
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

  if (cooldownCache) return cooldownCache;
  const res = await apiFetch("/api/progress");
  if (res.status === 401) {
    // Signed out (guest): account progress is unreachable, so reflect
    // the local mirror instead so the day tracker, cooldown labels, and
    // resume position still work from the guest's own storage.
    const now = Date.now();
    cooldownCache = new Map();
    for (const [slug, entry] of Object.entries(read())) {
      if (!entry || typeof entry.lastDeckIndex !== "number") continue;
      const onCooldown =
        entry.lastCompletedAt && now - entry.lastCompletedAt < COOLDOWN_MS;
      cooldownCache.set(slug, {
        topic_slug: slug,
        last_deck_index_completed: entry.lastDeckIndex,
        last_viewed_card_index: entry.lastViewedCardIndex || 0,
        is_on_cooldown: Boolean(onCooldown),
        cooldown_remaining_hours: onCooldown
          ? Math.ceil((COOLDOWN_MS - (now - entry.lastCompletedAt)) / (60 * 60 * 1000))
          : 0,
      });
    }
    return cooldownCache;
  }
  if (!res.ok) throw new Error("could not load progress from the API");
  const { progress } = await res.json();
  cooldownCache = new Map(progress.map((p) => [p.topic_slug, p]));
  return cooldownCache;
}

// The next deck index for a guest, read from the local mirror. The
// backend has no progress row for anonymous ids, so without this a guest
// would always be served deck 0; passing this index lets them advance
// through decks the same way signed-in users do.
export function getLocalNextDeckIndex(topicSlug) {
  const entry = read()[topicSlug];
  const last = typeof entry?.lastDeckIndex === "number" ? entry.lastDeckIndex : -1;
  return last + 1;
}

// The resume position (which card within the current in-progress deck)
// for a topic. Signed-in users read the account-scoped value from the
// backend (cached by the topic list); guests read the local mirror.
export async function getResumeCardIndex(topicSlug) {
  if (USE_MOCK || !isSignedIn()) {
    return read()[topicSlug]?.lastViewedCardIndex || 0;
  }
  try {
    const map = await fetchCooldownMap();
    return map.get(topicSlug)?.last_viewed_card_index || 0;
  } catch {
    return read()[topicSlug]?.lastViewedCardIndex || 0;
  }
}

// Saves the resume position for a topic. Called throttled by the feed
// (roughly once a second or on scroll settle), never per scroll event.
// The local mirror is written for everyone; signed-in users also write
// the account-scoped column on the backend.
export async function saveViewedCardIndex(topicSlug, cardIndex) {
  const progress = read();
  progress[topicSlug] = {
    ...(progress[topicSlug] || {}),
    lastViewedCardIndex: cardIndex,
    lastViewedAt: Date.now(),
  };
  write(progress);

  if (USE_MOCK || !isSignedIn()) return;
  try {
    const topicId = await getTopicId(topicSlug);
    const res = await apiFetch("/api/progress/view", {
      method: "POST",
      body: JSON.stringify({ topic_id: topicId, card_index: cardIndex }),
    });
    if (res.status === 401) {
      console.warn("position save requires sign-in; kept locally");
    }
  } catch (err) {
    console.warn("could not save position", err);
  }
}
