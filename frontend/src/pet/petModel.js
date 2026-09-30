// The virtual pet's stat model, ported from the tamagotchi project
// (src/animals/index.ts) and reduced to the part that matters here: the
// hunger / happiness / tiredness stats on a 0-100 scale, with clamping
// and a sick-not-dead rule. The original decayed the stats every
// animation frame; real-time decay is wrong for a daily reading habit,
// so decay is driven by *calendar days of inactivity* instead. Reading a
// slide resets the clock; a day or two away makes the pet hungry, longer
// makes it sick.

export const DAY_MS = 24 * 60 * 60 * 1000;

// How many slides in a day count as one "feed" of the pet.
export const FEED_EVERY = 5;

// The four animals to pick from, one chosen at adoption and never
// changed. Artwork is the vector set in components/pet/PetArt.jsx.
export const PET_TYPES = ["cat", "poodle", "parrot", "dinosaur"];

export const PET_CONFIGS = {
  cat: { label: "Cat" },
  poodle: { label: "Poodle" },
  parrot: { label: "Parrot" },
  dinosaur: { label: "Dinosaur" },
};

// Keeps every stat inside 0-100, the same contract as the original
// project's clampValues helper.
export function clamp(value) {
  return Math.max(0, Math.min(value, 100));
}

export function petLabel(type) {
  return (PET_CONFIGS[type] || PET_CONFIGS.cat).label;
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

// hunger rises with idle days; tiredness rises with today's reading and
// resets overnight; happiness falls with idle days and is lifted by the
// current streak (the server streak when signed in, the local mirror for
// guests). The returned values are exactly what the UI reads.
export function computeStats(pet, today, streakCount = 0) {
  if (!pet) return null;
  const idleDays = daysBetween(pet.lastActiveDate, today);
  const cardsToday = pet.cardsDate === today ? pet.cardsToday || 0 : 0;
  const hunger = clamp(idleDays * 22);
  const sleep = clamp(cardsToday * 9);
  const happiness = clamp(
    70 + streakCount * 6 - idleDays * 28 - Math.max(0, sleep - 70)
  );
  return { hunger, happiness, sleep, idleDays, cardsToday };
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

// Short, warm lines keyed by mood. Never shaming: the pet asks for a
// little reading, it does not scold.
export const MOOD_COPY = {
  happy: (name) => `${name} is thriving. Keep it up.`,
  content: (name) => `${name} is doing okay. A little reading goes far.`,
  hungry: (name) => `${name} is getting hungry. Read a few slides to feed them.`,
  sick: (name) => `${name} feels sick. Read something today to nurse them back.`,
  away: (name) => `${name} is waiting for you.`,
};

// Whole feeds reached for a given count of slides read today.
export function feedCount(cardsToday) {
  return Math.floor((cardsToday || 0) / FEED_EVERY);
}

// The lines shown when the pet is fed, every FEED_EVERY slides. They
// escalate by feed number so each milestone in a day reads as progress
// rather than a repeat: the first thanks you, the later ones cheer you
// on. Index is the zero-based feed number for the day.
export const FEED_LINES = [
  "You fed me — thanks! Want to keep going?",
  "I'm happy! You can go further.",
  "Look at me glow. A few more slides?",
  "You're on a roll — I'm loving this.",
  "Another snack! Keep the streak alive.",
  "I feel stronger. Ready for more?",
];

export function feedMessage(feedNumber = 0) {
  const i = Math.max(0, feedNumber) % FEED_LINES.length;
  return FEED_LINES[i];
}
