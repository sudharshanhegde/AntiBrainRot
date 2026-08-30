import { useSyncExternalStore } from "react";

// Dark mode toggle hook.
//
// Persists the choice ("dark" | "light") in localStorage and applies a
// `.dark` class to <html>, which swaps the whole theme via the token
// overrides in styles/tokens.css. When no choice is saved yet it follows
// the OS prefers-color-scheme. Also keeps the mobile browser's
// theme-color meta in sync so the URL bar matches the theme.
//
// The theme is held in a module-level store, so every card/menu that uses
// useTheme stays in sync (toggling on one card updates the labels on all
// of them). The `.dark` class is also set before first paint by an inline
// script in index.html (so there is no flash on reload); this hook owns it
// from then on.

const STORAGE_KEY = "antibrainrot:theme";
const META_THEME_COLOR = "theme-color";

let currentTheme = null;
const listeners = new Set();

function readTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // storage unavailable; fall through to the OS preference
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  const meta = document.querySelector(`meta[name="${META_THEME_COLOR}"]`);
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#14161a" : "#F3F2EC");
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable; the theme still applies for the session
  }
}

function ensureInit() {
  if (currentTheme === null) {
    currentTheme = readTheme();
    applyTheme(currentTheme);
  }
  return currentTheme;
}

function getSnapshot() {
  return ensureInit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setTheme(next) {
  if (next === currentTheme) return;
  currentTheme = next;
  applyTheme(next);
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, toggleTheme, isDark: theme === "dark" };
}
