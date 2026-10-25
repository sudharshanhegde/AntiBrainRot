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

// A few placeholder bites for mock mode (backend not running). Single
// idea plus one action, inside the 60-100 word band.
const MOCK_BITES = [
  {
    tag: "focus",
    body: "Unfinished work stays mentally open. The Zeigarnik effect: the brain holds unclosed loops like browser tabs, which is why a half-written reply keeps nagging you at dinner. It has an upside. Stop before you finish. Do two minutes on the task you are avoiding, then stop mid-step while you still know the next move. Write one line, next tiny step is, and leave it. Coming back is far easier than starting from nothing.",
  },
  {
    tag: "career",
    body: "Most people answer how was your week with busy. A sharper move: keep a running file of three things you shipped, learned, or unblocked each week. It takes two minutes on Friday. In a review, a raise conversation, or an interview, you stop reconstructing a year from memory and read it back. Specific beats memorable, and the person who can name their own results is the one who gets trusted with bigger ones.",
  },
  {
    tag: "learning",
    body: "Reading feels like learning and mostly is not. Retrieval is. Close the page and write, from memory, what the idea was and where it breaks. Then check. Getting it wrong is the useful part, because the effort of pulling it back is what makes it stick, while rereading just builds familiarity with the page. Two minutes of recall beats another pass through the same paragraphs. Try it on the last thing you read today.",
  },
  {
    tag: "communication",
    body: "Criticism lands badly when it sounds like a verdict on you. Swap the verdict for a request. Instead of you never send updates, try I get stuck when I do not know where things stand, can you send one line by Thursday. The second version names the problem, the cost, and a specific ask, so the other person has something to do rather than something to defend. Same complaint, very different odds of a fix.",
  },
  {
    tag: "money",
    body: "Fixed costs decide how free you feel. A small recurring charge is easy to ignore alone and heavy in a stack, so once a year list every subscription and cancel the ones you cannot name a use for from last month. The point is not frugality, it is that optional money buys options: leaving a bad job, taking a pay cut to learn something, covering a broken laptop without a loan. Flexibility is the return.",
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
