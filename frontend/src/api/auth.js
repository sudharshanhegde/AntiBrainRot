import { apiFetch, clearAnonymousUserId } from "./client";
import { supabase } from "./supabase";

// Auth service: Google + email/password sign-in against Supabase Auth,
// and the backend calls that register the account, migrate anonymous
// progress, expose settings, and read the leaderboard.

// --- Supabase Auth -------------------------------------------------------

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// --- Backend account/profile ----------------------------------------------

// Registers (upserts) the signed-in user with the backend and returns
// { user, streak }. Called whenever a session is established or
// restored, so the users row exists before any progress read.
export async function registerSession() {
  const res = await apiFetch("/api/auth/session", { method: "POST" });
  if (!res.ok) throw new Error("could not register session");
  return res.json();
}

// Current profile + streak (idempotent read that also upserts).
export async function fetchMe() {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) throw new Error("could not load profile");
  return res.json();
}

// Toggles leaderboard visibility. Opt-in, default false.
export async function updateLeaderboardOptIn(leaderboardOptIn) {
  const res = await apiFetch("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ leaderboard_opt_in: leaderboardOptIn }),
  });
  if (!res.ok) throw new Error("could not update settings");
  return res.json();
}

// --- Anonymous progress migration -----------------------------------------

// One-time migration: reassigns the user's anonymous progress rows to
// the authenticated id. Returns the number of rows moved. Reads the
// anonymous id without creating one (a genuinely new user has no id and
// nothing to move), and clears the localStorage id only after the
// backend confirms success so the migration cannot run twice.
export async function migrateLocalProgress() {
  let localUserId = "";
  try {
    localUserId = localStorage.getItem("antibrainrot:user") || "";
  } catch {
    return 0;
  }
  if (!localUserId || localUserId === "anon-local") return 0;

  const res = await apiFetch("/api/auth/migrate", {
    method: "POST",
    body: JSON.stringify({ local_user_id: localUserId }),
  });
  if (!res.ok) throw new Error("could not migrate progress");
  const { migrated } = await res.json();
  clearAnonymousUserId();
  return migrated;
}

// --- Leaderboard -----------------------------------------------------------

// Ranked list plus the signed-in user's own row/rank. Not auth-gated:
// anyone can view, only opted-in users appear.
export async function fetchLeaderboard() {
  const res = await apiFetch("/api/leaderboard");
  if (!res.ok) throw new Error("could not load leaderboard");
  return res.json();
}

// --- Date helpers ----------------------------------------------------------

// The user's local calendar date as YYYY-MM-DD, sent with deck
// completion so a streak counts a "day" in the user's own timezone
// rather than the server's.
export function localDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
