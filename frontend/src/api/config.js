// Frontend API configuration.
//
// The frontend talks to the Express backend, not to Supabase directly.
// Set VITE_API_URL in frontend/.env (copy .env.example) when the API
// is not on localhost:4000.
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Set VITE_USE_MOCK=true in frontend/.env to serve local placeholder
// decks instead of the API. Handy when the backend is not running.
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
