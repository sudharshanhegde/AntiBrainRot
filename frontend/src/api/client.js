import { API_BASE } from "./config";
import { supabase } from "./supabase";

// Shared helpers for talking to the Express API. The API addresses
// topics by numeric id, while the rest of the app uses slugs, so the
// topics list is cached here as a slug-to-topic map.

let topicsCache = null;

export async function getTopics() {
  if (topicsCache) return topicsCache;
  const res = await fetch(`${API_BASE}/api/topics`);
  if (!res.ok) throw new Error("could not load topics from the API");
  const { topics } = await res.json();
  topicsCache = new Map(topics.map((t) => [t.slug, t]));
  return topicsCache;
}

export async function getTopicId(slug) {
  const topics = await getTopics();
  const topic = topics.get(slug);
  if (!topic) throw new Error(`unknown topic: ${slug}`);
  return topic.id;
}

// Auth-aware user id.
//
// When the user is signed in this returns the authenticated Supabase
// user id (a UUID), kept in a module-level cache that AuthContext
// updates whenever the session changes. When signed out it returns the
// anonymous localStorage id, the pre-auth flow, so content routes still
// work without an account. Because getUserId is called synchronously
// while building request URLs, the cache (not an async getSession) is
// the source of truth.
let currentUserId = null;

export function setCurrentUserId(id) {
  currentUserId = id || null;
}

export function getUserId() {
  if (currentUserId) return currentUserId;
  return getAnonymousUserId();
}

// True when an authenticated session is active (currentUserId is only
// set by AuthContext on a real Supabase session). Used to decide whether
// progress writes belong on the account (backend) or in the local mirror
// (guest).
export function isSignedIn() {
  return Boolean(currentUserId);
}

// The localStorage anonymous id on its own, regardless of auth state.
// Used by the one-time anonymous-to-authenticated migration.
const ANON_KEY = "antibrainrot:user";

export function getAnonymousUserId() {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return "anon-local";
  }
}

// Clears the anonymous id after a successful migration so it only runs
// once; a fresh one is generated the next time the user is signed out.
export function clearAnonymousUserId() {
  try {
    localStorage.removeItem(ANON_KEY);
  } catch {
    // storage unavailable; the id is regenerated next time
  }
}

// Read-only check for an existing guest id, used by the first-visit gate:
// if neither a session nor a guest id
// exists, this is a genuine first visit. Deliberately does not create an
// id, unlike getAnonymousUserId.
export function hasGuestId() {
  try {
    return Boolean(localStorage.getItem(ANON_KEY));
  } catch {
    return false;
  }
}

// Clears the guest identity and local progress/quiz mirrors, then
// generates a fresh guest id. Used after account deletion so the browser
// continues as a brand-new guest rather than keeping the deleted user's
// local state.
export function resetToGuest() {
  try {
    localStorage.removeItem(ANON_KEY);
    localStorage.removeItem("antibrainrot:progress");
    localStorage.removeItem("antibrainrot:quiz_answers");
  } catch {
    // storage unavailable; nothing to clear
  }
  return getAnonymousUserId();
}

// Persisted marker that this browser has already seen the first-visit
// gate and made a choice. Without it, a returning account user who signs
// out (no session, and the guest id was consumed by migration) would be
// wrongly shown the "first visit" gate again. Lives in localStorage, so
// clearing storage resets it, which matches the intended behavior.
const VISITED_KEY = "antibrainrot:visited";

export function hasVisited() {
  try {
    return Boolean(localStorage.getItem(VISITED_KEY));
  } catch {
    return false;
  }
}

export function markVisited() {
  try {
    localStorage.setItem(VISITED_KEY, "1");
  } catch {
    // storage unavailable; the gate may re-show, acceptable
  }
}

// Shared fetch for the Express API. Attaches the Supabase access token
// as a Bearer header when a session exists, so protected routes
// (progress, quiz answers, profile, leaderboard opt-in) get the verified
// identity the backend requires. Anonymous callers simply send no header
// and the content routes fall back to the user_id query parameter.
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
