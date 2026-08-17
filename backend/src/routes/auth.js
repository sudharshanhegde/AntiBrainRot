import { Router } from "express";
import { query, pool } from "../db.js";
import { requireAuth, supabaseAdmin, isAdminConfigured } from "../auth.js";

export const authRouter = Router();

// Maps a verified Supabase Auth user to the minimal profile we store:
// email, display name, avatar. Nothing beyond name/avatar/email is pulled
// (SKILL_auth.md). Google's provider puts full_name/avatar_url in
// user_metadata; email/password puts name in user_metadata too.
function profileFromUser(u) {
  const meta = u.user_metadata || {};
  return {
    email: u.email || null,
    display_name: meta.full_name || meta.name || u.email || null,
    avatar_url: meta.avatar_url || meta.picture || null,
  };
}

async function upsertUser(userId, user) {
  const p = profileFromUser(user);
  const { rows } = await query(
    `insert into users (id, email, display_name, avatar_url)
     values ($1, $2, $3, $4)
     on conflict (id) do update set
       email = coalesce(excluded.email, users.email),
       display_name = coalesce(excluded.display_name, users.display_name),
       avatar_url = coalesce(excluded.avatar_url, users.avatar_url)
     returning id, email, display_name, avatar_url, leaderboard_opt_in`,
    [userId, p.email, p.display_name, p.avatar_url]
  );
  return rows[0];
}

async function loadStreak(userId) {
  const { rows } = await query(
    "select current_streak, longest_streak from user_streaks where user_id = $1",
    [userId]
  );
  return rows[0] || { current_streak: 0, longest_streak: 0 };
}

// POST /api/auth/session
// Registered by the frontend whenever a session (Google or email) is
// established or restored, so the users row exists before any progress or
// leaderboard reads. Idempotent: re-login updates name/avatar/email.
authRouter.post("/session", requireAuth, async (req, res) => {
  try {
    const user = await upsertUser(req.userId, req.user);
    const streak = await loadStreak(req.userId);
    res.json({ user, streak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not register session" });
  }
});

// GET /api/auth/me
// Profile + streak for the signed-in user (upserting first so a fresh
// login that skipped /session still resolves). Read side of /session.
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await upsertUser(req.userId, req.user);
    const streak = await loadStreak(req.userId);
    res.json({ user, streak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load profile" });
  }
});

// PATCH /api/auth/me
// body: { leaderboard_opt_in: boolean }
// The account-settings toggle. Leaderboard visibility is opt-in, default
// false, so a user who just wants to save progress is never public by
// default (SKILL_auth.md).
authRouter.patch("/me", requireAuth, async (req, res) => {
  try {
    const value = req.body?.leaderboard_opt_in;
    if (typeof value !== "boolean") {
      return res.status(400).json({ error: "leaderboard_opt_in must be a boolean" });
    }
    const { rows } = await query(
      `update users set leaderboard_opt_in = $2 where id = $1
       returning id, email, display_name, avatar_url, leaderboard_opt_in`,
      [req.userId, value]
    );
    if (rows.length === 0) {
      // The users row should exist (registered on login); if it somehow
      // does not, upsert it now so the toggle still takes effect.
      const user = await upsertUser(req.userId, req.user);
      const { rows: updated } = await query(
        `update users set leaderboard_opt_in = $2 where id = $1
         returning id, email, display_name, avatar_url, leaderboard_opt_in`,
        [req.userId, value]
      );
      return res.json({ user: updated[0] || user });
    }
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not update settings" });
  }
});

// POST /api/auth/migrate
// body: { local_user_id: string }
// One-time migration of anonymous progress: reassigns every row in
// user_progress and quiz_answers from the old localStorage-generated id
// to the authenticated user id. Runs in a single transaction so a
// partial failure cannot leave progress split across two ids
// (SKILL_auth.md). The frontend clears localStorage's anonymous id only
// after this succeeds.
authRouter.post("/migrate", requireAuth, async (req, res) => {
  const localUserId = String(req.body?.local_user_id || "").trim();
  if (!localUserId) {
    return res.status(400).json({ error: "local_user_id is required" });
  }
  if (localUserId === req.userId) {
    return res.json({ ok: true, migrated: 0 });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const progress = await client.query(
      "update user_progress set user_id = $1 where user_id = $2",
      [req.userId, localUserId]
    );
    const answers = await client.query(
      "update quiz_answers set user_id = $1 where user_id = $2",
      [req.userId, localUserId]
    );
    await client.query("commit");
    res.json({
      ok: true,
      migrated: progress.rowCount + answers.rowCount,
    });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ error: "could not migrate progress" });
  } finally {
    client.release();
  }
});

// DELETE /api/auth/me
//
// Permanently deletes the account: quiz answers, progress, the streak,
// and the users row in a single transaction, and only then removes the
// Supabase Auth user via the service-role admin API. The ordering matters
// (SKILL_profile_progress.md): if the app-data deletes fail, the auth
// account is left untouched; the admin delete runs only after they have
// committed, so a failure partway cannot leave an orphaned auth account
// with no app data or app data with no auth account behind it.
authRouter.delete("/me", requireAuth, async (req, res) => {
  const userId = req.userId;

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from quiz_answers where user_id = $1", [userId]);
    await client.query("delete from user_progress where user_id = $1", [userId]);
    await client.query("delete from user_streaks where user_id = $1", [userId]);
    await client.query("delete from users where id = $1", [userId]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    client.release();
    return res.status(500).json({ error: "could not delete account data" });
  }
  client.release();

  if (!isAdminConfigured) {
    console.warn(
      `[auth] account ${userId} app data deleted but SUPABASE_SERVICE_ROLE_KEY is not set; auth user not removed`
    );
    return res
      .status(500)
      .json({ error: "account data deleted, but the auth account could not be removed" });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[auth] failed to delete Supabase auth user:", error.message);
    return res
      .status(500)
      .json({ error: "account data deleted, but the auth account could not be removed" });
  }

  res.json({ ok: true });
});
