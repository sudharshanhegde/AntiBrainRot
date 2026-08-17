import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import "./env.js";

// Supabase client used only to verify the bearer JWTs the frontend sends.
// getUser(token) exchanges the JWT for the authenticated user at Supabase
// Auth and works with the anon key, so no service-role secret is needed
// here. The backend never creates or mutates auth users directly; Google
// and email/password sign-in happen in the frontend via its own client.
//
// The realtime transport is pinned to the ws package because this
// backend runs on Node.js < 22, which has no native WebSocket global;
// without it createClient throws during construction even though this
// app never opens a realtime channel.
export const supabase = createClient(
  process.env.SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_ANON_KEY || "placeholder",
  { realtime: { transport: ws } }
);

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

// requireAuth: protected routes (progress, quiz answers, profile,
// settings, migration). The user_id is derived from the verified token,
// never from a client-supplied parameter, so a caller cannot act as
// someone else by sending a different id.
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    console.error("[auth] token verification failed:", err.message);
    res.status(401).json({ error: "unauthorized" });
  }
}

// optionalUserId: content routes (feed, days) that must keep working for
// anonymous users. When a valid bearer token is present it is used to
// derive the user id (preferred); otherwise the route falls back to the
// caller-supplied user_id query parameter, the same anonymous flow that
// existed before auth.
export async function optionalUserId(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) req.userId = user.id;
    } catch {
      // Invalid or stale token: ignore and fall through to the query
      // parameter, the anonymous path.
    }
  }
  next();
}
