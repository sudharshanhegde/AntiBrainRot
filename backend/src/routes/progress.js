import { Router } from "express";
import { query } from "../db.js";

export const progressRouter = Router();

const COOLDOWN_HOURS = Number(process.env.COOLDOWN_HOURS || 12);
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

// GET /api/progress?user_id=...
// Returns the user's progress per topic with the computed cooldown
// state, so the frontend can show "come back tomorrow" from the
// authoritative server state instead of client-side storage.
progressRouter.get("/", async (req, res) => {
  try {
    const userId = String(req.query.user_id || "");
    const { rows } = await query(
      `select t.id as topic_id, t.slug,
              coalesce(up.last_deck_index_completed, -1) as last_deck_index_completed,
              up.last_completed_at
         from topics t
         left join user_progress up on up.topic_id = t.id and up.user_id = $1
         order by t.id`,
      [userId]
    );

    const now = Date.now();
    const progress = rows.map((r) => {
      const completedAt = r.last_completed_at
        ? new Date(r.last_completed_at).getTime()
        : null;
      const onCooldown =
        r.last_deck_index_completed >= 0 &&
        completedAt != null &&
        now - completedAt < COOLDOWN_MS;
      const remaining = onCooldown ? COOLDOWN_MS - (now - completedAt) : 0;

      return {
        topic_id: r.topic_id,
        topic_slug: r.slug,
        last_deck_index_completed: r.last_deck_index_completed,
        is_on_cooldown: onCooldown,
        cooldown_remaining_hours: onCooldown
          ? Math.ceil(remaining / (60 * 60 * 1000))
          : 0,
      };
    });

    res.json({ progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load progress" });
  }
});

// POST /api/progress
// body: { user_id, topic_id, deck_index, niche? }
// Marks a deck as completed for a user. The 24-hour cooldown is derived
// from last_completed_at by this endpoint and the feed endpoint. No
// auth in v1, the user_id is an anonymous id kept in localStorage.
progressRouter.post("/", async (req, res) => {
  try {
    const { user_id, topic_id, deck_index, niche } = req.body || {};
    if (!user_id || !Number.isInteger(topic_id) || !Number.isInteger(deck_index)) {
      return res
        .status(400)
        .json({ error: "user_id, topic_id, and deck_index are required" });
    }

    await query(
      `insert into user_progress
         (user_id, topic_id, last_deck_index_completed, last_completed_at, niche)
       values ($1, $2, $3, now(), $4)
       on conflict (user_id, topic_id) do update set
         last_deck_index_completed = excluded.last_deck_index_completed,
         last_completed_at = now(),
         niche = coalesce(excluded.niche, user_progress.niche)`,
      [user_id, topic_id, deck_index, niche || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not record progress" });
  }
});
