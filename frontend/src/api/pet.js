import { localDateString } from "./auth";
import { PET_TYPES, daysBetween, feedCount, petLabel } from "../pet/petModel";

// Frontend-only pet persistence. The pet lives in localStorage, the same
// guest-first approach as the progress mirror in api/progress.js: it
// works signed out and needs no schema or API change. Reading a slide
// (applyRead) is the only thing that advances the pet.

const KEY = "antibrainrot:pet";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

function write(pet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pet));
  } catch {
    // storage unavailable; the pet is lost but the session still works
  }
  return pet;
}

// Returns the stored pet, or null when there is none (or the record is
// from a shape this code no longer understands).
export function loadPet() {
  const pet = read();
  if (!pet || !PET_TYPES.includes(pet.type)) return null;
  return pet;
}

export function clearPet() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
}

// Adopts a pet and counts the slide that was being read at adoption, so
// a brand-new pet is never born already idle.
export function adoptPet(type, name) {
  const today = localDateString();
  return write({
    version: 1,
    type,
    name: (name || "").trim() || petLabel(type),
    createdAt: new Date().toISOString(),
    lastActiveDate: today,
    streak: 1,
    cardsToday: 1,
    cardsDate: today,
    feeds: 0,
  });
}

// Applies one slide read. The streak advances the same way the backend's
// updateStreak does: same day keeps it, yesterday increments, anything
// older restarts at 1. Returns { pet, fed } where fed is true when this
// read crossed a whole-feed boundary (every FEED_EVERY slides).
export function applyRead(pet, today) {
  const sameDay = pet.lastActiveDate === today;
  const yesterday = daysBetween(pet.lastActiveDate, today) === 1;
  const nextStreak = sameDay ? pet.streak : yesterday ? pet.streak + 1 : 1;

  const prevCards = pet.cardsDate === today ? pet.cardsToday || 0 : 0;
  const cardsToday = prevCards + 1;
  const fed = feedCount(cardsToday) > feedCount(prevCards);

  const next = {
    ...pet,
    lastActiveDate: today,
    streak: nextStreak,
    cardsToday,
    cardsDate: today,
    feeds: (pet.feeds || 0) + (fed ? 1 : 0),
  };
  write(next);
  return { pet: next, fed };
}
