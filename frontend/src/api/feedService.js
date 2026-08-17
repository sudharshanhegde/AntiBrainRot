import { findNiche } from "../data/topics";
import { deckStore } from "../data/decks";
import { USE_MOCK } from "./config";
import { apiFetch, getTopicId, getUserId } from "./client";

// Feed data service. Default mode talks to the Express API
// (GET /api/topics, GET /api/feed). With VITE_USE_MOCK=true it serves
// local placeholder decks instead, which is useful when the backend is
// not running.

export const CHUNK_SIZE = 5;

const MOCK_LATENCY = 220;
const mockDelay = () => new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY));

async function mockTopics(nicheSlug) {
  await mockDelay();
  const niche = findNiche(nicheSlug);
  return niche ? niche.topics : [];
}

async function mockDeckChunk(topicSlug, deckIndex, offset) {
  await mockDelay();
  const all = deckStore[topicSlug] || [];
  const slice = all.slice(offset, offset + CHUNK_SIZE);
  return {
    cards: slice,
    hasMore: offset + slice.length < all.length,
    total: all.length,
    difficulty: "fundamentals",
    deckIndex,
  };
}

async function apiTopics(nicheSlug) {
  const niche = findNiche(nicheSlug);
  if (!niche) return [];
  // Warm the topic cache so the first feed call does not pay a second
  // topics request. Errors surface when the feed loads.
  try {
    await getTopicId(niche.topics[0]);
  } catch {
    // handled when the feed loads
  }
  return niche.topics;
}

async function apiDeckChunk(topicSlug, deckIndex, offset) {
  const topicId = await getTopicId(topicSlug);
  const userId = getUserId();
  // deckIndex is null for normal play (the backend picks the next deck);
  // a concrete index means revision mode, where we re-read a specific
  // already-published deck even if it is on cooldown. user_id is passed
  // for the anonymous fallback; signed-in requests also carry a Bearer
  // token via apiFetch and the backend prefers the token identity.
  let path = `/api/feed?topic_id=${topicId}&user_id=${encodeURIComponent(userId)}`;
  if (deckIndex != null && Number.isInteger(deckIndex) && deckIndex >= 0) {
    path += `&deck_index=${deckIndex}`;
  }
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("could not load the feed from the API");
  const data = await res.json();

  if (data.status === "cooldown") {
    throw new Error(
      `this topic is on cooldown for ${data.cooldown_remaining_hours}h`
    );
  }
  if (data.status !== "ok") {
    // exhausted: no reviewed decks exist for this topic yet
    return { cards: [], hasMore: false, total: 0, difficulty: "fundamentals", deckIndex };
  }

  const all = data.deck.cards || [];
  const slice = all.slice(offset, offset + CHUNK_SIZE);
  return {
    cards: slice,
    hasMore: offset + slice.length < all.length,
    total: all.length,
    difficulty: data.deck.difficulty,
    deckIndex: data.deck.deck_index,
  };
}

async function apiDays(topicSlug) {
  const topicId = await getTopicId(topicSlug);
  const userId = getUserId();
  const res = await apiFetch(
    `/api/days?topic_id=${topicId}&user_id=${encodeURIComponent(userId)}`
  );
  if (!res.ok) throw new Error("could not load days from the API");
  return res.json();
}

async function mockDays(topicSlug) {
  await mockDelay();
  const all = deckStore[topicSlug] || [];
  return {
    topic: { slug: topicSlug },
    days: all.map((_, i) => ({
      day: i,
      deck_index: i,
      difficulty: "fundamentals",
      status: "available",
      cooldown_remaining_hours: 0,
    })),
  };
}

// Day-by-day progression for a topic (Day 0, Day 1, ...).
export async function fetchDays(topicSlug) {
  return USE_MOCK ? mockDays(topicSlug) : apiDays(topicSlug);
}

export async function fetchTopics(nicheSlug) {
  return USE_MOCK ? mockTopics(nicheSlug) : apiTopics(nicheSlug);
}

export async function fetchDeckChunk(topicSlug, deckIndex, offset) {
  return USE_MOCK
    ? mockDeckChunk(topicSlug, deckIndex, offset)
    : apiDeckChunk(topicSlug, deckIndex, offset);
}
