// The virtual pet's stat model, ported from the tamagotchi project
// (src/animals/index.ts) and reduced to the part that matters here: the
// hunger and happiness stats on a 0-100 scale, with clamping and a
// sick-not-dead rule. The original also carried a third "sleep" stat that
// rose continuously; it is deliberately omitted, because reading should
// only ever help the pet rather than tire it out. The original decayed the
// stats every animation frame; real-time decay is wrong for a daily
// reading habit, so decay is driven by *calendar days of inactivity*
// instead. Reading a slide resets the clock; a day or two away makes the
// pet hungry, longer makes it sick.

export const DAY_MS = 24 * 60 * 60 * 1000;

// How many slides in a day count as one "feed" of the pet.
export const FEED_EVERY = 5;

// The four pets to pick from. One is chosen at adoption and can be swapped
// later from the profile card (api/pet.js switchPet), which keeps the
// stats and streak. Each is a transparent cutout served from public/pets
// and rendered (animated) by components/pet/PetArt.jsx. The label doubles
// as the default pet name.
export const PET_TYPES = ["bablu", "guddu", "maya", "tippu"];

export const PET_CONFIGS = {
  bablu: { label: "Bablu" },
  guddu: { label: "Guddu" },
  maya: { label: "Maya" },
  tippu: { label: "Tippu" },
};

// Keeps every stat inside 0-100, the same contract as the original
// project's clampValues helper.
export function clamp(value) {
  return Math.max(0, Math.min(value, 100));
}

export function petLabel(type) {
  return (PET_CONFIGS[type] || PET_CONFIGS[PET_TYPES[0]]).label;
}

// Whole days between two YYYY-MM-DD strings (b - a). Compared as UTC
// midnights so a DST shift never lands on a fractional day.
export function daysBetween(a, b) {
  if (!a || !b) return 0;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const diff = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.max(0, Math.round(diff / DAY_MS));
}

// hunger rises with idle days; happiness falls with idle days and is
// lifted by the current streak (the server streak when signed in, the
// local mirror for guests). The returned values are exactly what the UI
// reads.
export function computeStats(pet, today, streakCount = 0) {
  if (!pet) return null;
  const idleDays = daysBetween(pet.lastActiveDate, today);
  const cardsToday = pet.cardsDate === today ? pet.cardsToday || 0 : 0;
  const hunger = clamp(idleDays * 22);
  const happiness = clamp(70 + streakCount * 6 - idleDays * 28);
  return { hunger, happiness, idleDays, cardsToday };
}

// A single word the UI uses for the pet's current state. "away" is the
// neutral value before a pet has been adopted.
export function moodOf(stats) {
  if (!stats) return "away";
  if (stats.hunger >= 80 && stats.happiness <= 20) return "sick";
  if (stats.hunger >= 55) return "hungry";
  if (stats.happiness >= 75 && stats.hunger < 40) return "happy";
  return "content";
}

// Short, warm, punny lines keyed by mood. Never shaming: the pet asks for
// a little reading, it does not scold. Kept species-neutral so all four
// animals read correctly, and free of em dashes and emoji to match the
// app's copy rules.
export const MOOD_COPY = {
  happy: (name) => `${name} is tail-waggingly happy. Keep the pages turning.`,
  content: (name) => `${name} is doing fine. A little reading goes a long way.`,
  hungry: (name) => `${name} is hungry. Feed me some knowledge?`,
  sick: (name) =>
    `${name} feels under the weather. A few slides would be just the medicine.`,
  away: (name) => `${name} is waiting. Do not leave me on read.`,
};

// Whole feeds reached for a given count of slides read today.
export function feedCount(cardsToday) {
  return Math.floor((cardsToday || 0) / FEED_EVERY);
}

// The punny lines shown when the pet is fed, every FEED_EVERY slides. They
// escalate by feed number so each milestone in a day reads as progress
// rather than a repeat: the first thanks you, the later ones cheer you
// on. Index is the zero-based feed number for the day.
export const FEED_LINES = [
  "You fed me. Thanks! Want to keep going?",
  "I'm happy! You're a real page-turner.",
  "Feeling sharp. On to the next chapter?",
  "You're on a roll. Well, a scroll.",
  "Another snack! Curiosity fed the cat.",
  "I feel stronger. No bones about it, keep reading.",
];

export function feedMessage(feedNumber = 0) {
  const i = Math.max(0, feedNumber) % FEED_LINES.length;
  return FEED_LINES[i];
}
