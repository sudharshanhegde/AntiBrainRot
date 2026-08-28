import { Router } from "express";
import { query, pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { updateStreak } from "../streaks.js";

export const progressRouter = Router();

// GET /api/progress
// Returns the signed-in user's progress per topic. The user id comes from
// the verified JWT, never a query parameter. There is no cooldown: every
// topic's next deck is always available, so this reports progress only
// (last completed deck, resume position), never a wait state.
progressRouter.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { rows } = await query(
      `select t.id as topic_id, t.slug,
              coalesce(up.last_deck_index_completed, -1) as last_deck_index_completed,
              up.last_completed_at,
              coalesce(up.last_viewed_card_index, 0) as last_viewed_card_index
         from topics t
         left join user_progress up on up.topic_id = t.id and up.user_id = $1
         order by t.id`,
      [userId]
    );

    const progress = rows.map((r) => ({
      topic_id: r.topic_id,
      topic_slug: r.slug,
      last_deck_index_completed: r.last_deck_index_completed,
      last_viewed_card_index: r.last_viewed_card_index,
      is_on_cooldown: false,
      cooldown_remaining_hours: 0,
    }));

    res.json({ progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load progress" });
  }
});

// POST /api/progress
// body: { topic_id, deck_index, niche?, local_date? }
// Marks a deck as completed for the signed-in user. Runs as one
// transaction: the progress write and the account-level streak side
// effect commit together, so a partial failure cannot record one without
// the other.
progressRouter.post("/", requireAuth, async (req, res) => {
  try {
    const { topic_id, deck_index, niche, local_date } = req.body || {};
    if (!Number.isInteger(topic_id) || !Number.isInteger(deck_index)) {
      return res
        .status(400)
        .json({ error: "topic_id and deck_index are required" });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into user_progress
           (user_id, topic_id, last_deck_index_completed, last_completed_at, niche)
         values ($1, $2, $3, now(), $4)
         on conflict (user_id, topic_id) do update set
           last_deck_index_completed = excluded.last_deck_index_completed,
           last_completed_at = now(),
           niche = coalesce(excluded.niche, user_progress.niche),
           -- Reset the resume position: the next deck starts at card 0.
           last_viewed_card_index = 0`,
        [req.userId, topic_id, deck_index, niche || null]
      );
      const streak = await updateStreak(client, req.userId, local_date);
      await client.query("commit");
      res.json({ ok: true, streak });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not record progress" });
  }
});

// POST /api/progress/view
// body: { topic_id, card_index }
//
// Saves the resume position within the current in-progress deck. Written
// throttled by the frontend (roughly once a second or on scroll settle),
// never on every scroll event. Only touches last_viewed_card_index, so
// it never advances completion. On deck completion the completion
// endpoint resets this back to 0.
progressRouter.post("/view", requireAuth, async (req, res) => {
  try {
    const { topic_id, card_index } = req.body || {};
    if (
      !Number.isInteger(topic_id) ||
      !Number.isInteger(card_index) ||
      card_index < 0
    ) {
      return res
        .status(400)
        .json({ error: "topic_id and card_index are required" });
    }

    await query(
      `insert into user_progress (user_id, topic_id, last_viewed_card_index)
       values ($1, $2, $3)
       on conflict (user_id, topic_id) do update set
         last_viewed_card_index = excluded.last_viewed_card_index`,
      [req.userId, topic_id, card_index]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not save position" });
  }
});
