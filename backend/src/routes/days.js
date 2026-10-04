import { Router } from "express";
import { query } from "../db.js";
import { optionalUserId } from "../auth.js";

export const daysRouter = Router();

// GET /api/days?topic_id=1&user_id=anon-1
//
// Lists the published decks ("days") for a topic with per-user
// availability, so the app can show a day-by-day progression:
//   Day 0 fundamentals, Day 1 intermediate, Day 2 advanced, ...
//
// There is no cooldown and no sequential lock within the current run of
// days: every one of them is either already completed (re-readable as a
// revision) or available to play immediately.
//
// Decks at or beyond the topic's target_decks are the pre-existing
// content the one-time reschedule moved behind the new sequence (see
// jobs/move_existing_content.sql), so their indices are far above the
// current days. They are held back from this list until the user actually
// reaches them, so the drawer shows the days in progress instead of a wall
// of legacy indices. This is a display filter only: the next deck is still
// served in sequence by the feed, so nothing is locked and nothing is lost.
//
// Status per day:
//   completed  - already finished, can be re-read (revision)
//   available  - any listed day not yet finished, playable immediately
daysRouter.get("/", optionalUserId, async (req, res) => {
  try {
    const topicId = Number(req.query.topic_id);
    const userId = req.userId || String(req.query.user_id || "");
    if (!Number.isInteger(topicId)) {
      return res.status(400).json({ error: "topic_id is required" });
    }

    const topicRes = await query(
      "select id, name, slug, accent, blurb, target_decks from topics where id = $1",
      [topicId]
    );
    if (topicRes.rows.length === 0) {
      return res.status(404).json({ error: "topic not found" });
    }
    const topic = topicRes.rows[0];

    const deckRes = await query(
      "select deck_index, difficulty from decks where topic_id = $1 and reviewed_at is not null order by deck_index",
      [topicId]
    );

    const progressRes = await query(
      "select last_deck_index_completed, last_completed_at from user_progress where user_id = $1 and topic_id = $2",
      [userId, topicId]
    );
    const progress = progressRes.rows[0] || {
      last_deck_index_completed: -1,
      last_completed_at: null,
    };

    const lastCompleted = progress.last_deck_index_completed;

    // target_decks marks where the moved pre-existing content begins.
    // Those decks stay out of the list until the user reaches them (their
    // next deck is exactly lastCompleted + 1), while the current days are
    // all listed as before.
    const legacyFloor = Number(topic.target_decks) || 0;

    const days = deckRes.rows
      .filter((d) => d.deck_index < legacyFloor || d.deck_index <= lastCompleted + 1)
      .map((d) => {
        const status = d.deck_index <= lastCompleted ? "completed" : "available";
        return {
          day: d.deck_index,
          deck_index: d.deck_index,
          difficulty: d.difficulty,
          status,
          cooldown_remaining_hours: 0,
        };
      });

    res.json({ topic, days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load days" });
  }
});
