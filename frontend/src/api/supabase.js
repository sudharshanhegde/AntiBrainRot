import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

// Supabase Auth client. The browser has a native WebSocket global, so no
// transport override is needed here (unlike the Node backend).
//
// autoRefreshToken stays enabled (the default) and AuthContext mounts an
// onAuthStateChange listener at the app root, so the access token
// refreshes in the background and the user stays signed in instead of
// quietly logging out (SKILL_auth.md).
export const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder"
);

// True when the Supabase project is actually configured. The app still
// renders (browsing works anonymously) but auth screens explain why
// sign-in is unavailable instead of throwing opaque errors.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
