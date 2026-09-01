import { USE_MOCK } from "./config";
import { apiFetch } from "./client";

// Worth a Read data service.
//
// A simple curated list of links, rendered as plain rows (not the swipeable
// card feed): the backend returns every entry newest-first and the frontend
// just renders them. No deck grouping, no per-user state, no "seen" tracking
// — the list is the same for everyone. Default mode talks to the Express
// API; with VITE_USE_MOCK=true it serves nothing (the module has no local
// placeholder corpus worth faking).

// Fetches the Worth a Read list, newest first.
export async function fetchWorthARead() {
  if (USE_MOCK) return [];
  const res = await apiFetch("/api/worth-a-read");
  if (!res.ok) throw new Error("could not load the worth-a-read list");
  const data = await res.json();
  return data.entries || [];
}
