import { USE_MOCK } from "./config";
import { apiFetch, getUserId } from "./client";

// Quick Bites data service ().
//
// The low-commitment feed module. Unlike the topic feed there is no deck
// grouping or per-day navigation: the backend returns unseen cards for
// the user, freshest first, falling back to older unseen cards once the
// newest batch is exhausted. The frontend fetches a chunk, renders it in
// the same scroll-snap feed, and POSTs the ids of cards the user has
// scrolled past so they do not resurface. Default mode talks to the
// Express API; with VITE_USE_MOCK=true it serves local placeholders.

export const QUICK_BITES_CHUNK = 12;

const MOCK_LATENCY = 180;
const mockDelay = () => new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY));

// A few placeholder bites for mock mode (backend not running). Short,
// single-idea, inside the 40-60 word band.
const MOCK_BITES = [
  {
    tag: "internet-history",
    body: "The first message ever sent on ARPANET in 1969 was meant to spell LOGIN, but the system crashed after sending just the letters LO. That two-character fragment still counts as the first packet switched between two computers on what became the internet.",
  },
  {
    tag: "famous-bugs",
    body: "The Y2K bug was a storage shortcut: years were stored as two digits, so 99 rolled over to 00. Widespread preparation meant few real failures in 2000, but the same design logic still resurfaces in old embedded systems and timestamp handling.",
  },
  {
    tag: "algorithms",
    body: "A Bloom filter is a space-efficient data structure that answers is-this-in-the-set with no false negatives but occasional false positives. It uses several hash functions to set bits in a bitmap, trading a tiny error rate for dramatically less memory than storing every element.",
  },
  {
    tag: "hardware",
    body: "SSDs wear out because each flash cell can only be erased and rewritten a limited number of times. Wear leveling spreads writes evenly across all cells, while the controller's overprovisioning keeps spare cells ready so the drive keeps working long after individual cells fail.",
  },
  {
    tag: "plt-trivia",
    body: "JavaScript and Java share only a name. Java compiles to bytecode for a virtual machine, while JavaScript is interpreted by the browser. The similar names were a 1990s marketing move: JavaScript was originally called LiveScript before Netscape renamed it to ride Java's popularity.",
  },
];

async function mockQuickBites() {
  await mockDelay();
  return MOCK_BITES.map((b, i) => ({ ...b, id: i + 1 }));
}

// Fetches the next chunk of unseen Quick Bites for the current user.
export async function fetchQuickBites() {
  if (USE_MOCK) return mockQuickBites();
  const userId = getUserId();
  const res = await apiFetch(
    `/api/quick-bites?user_id=${encodeURIComponent(userId)}&limit=${QUICK_BITES_CHUNK}`
  );
  if (!res.ok) throw new Error("could not load quick bites from the API");
  const data = await res.json();
  return data.bites || [];
}

// Marks cards as seen as the user scrolls past them, so they do not
// resurface in the feed. Fire and forget.
export async function markBitesSeen(ids) {
  if (USE_MOCK || !ids || ids.length === 0) return;
  const userId = getUserId();
  try {
    await apiFetch("/api/quick-bites/seen", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ids }),
    });
  } catch (err) {
    console.warn("could not mark quick bites seen", err);
  }
}
