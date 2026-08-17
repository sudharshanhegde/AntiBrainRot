// Frontend API configuration.
//
// The frontend talks to the Express backend for content and progress, and
// to Supabase Auth directly for sign-in (SKILL_auth.md). Set VITE_API_URL
// in frontend/.env (copy .env.example) when the API is not on
// localhost:4000, and VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for
// auth. The anon key is a public value; it is safe to ship in the bundle.
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Set VITE_USE_MOCK=true in frontend/.env to serve local placeholder
// decks instead of the API. Handy when the backend is not running.
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

// Supabase Auth config (Google + email/password sign-in).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
