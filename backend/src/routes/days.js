import { Router } from "express";
import { query } from "../db.js";
import { optionalUserId } from "../auth.js";

export const daysRouter = Router();

const COOLDOWN_HOURS = Number(process.env.COOLDOWN_HOURS || 12);
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

// GET /api/days?topic_id=1&user_id=anon-1
//
// Lists the published decks ("days") for a topic with per-user
// availability, so the app can show a day-by-day progression:
//   Day 0 fundamentals, Day 1 intermediate, Day 2 advanced, ...
//
// Status per day:
//   available  - the next uncompleted day and its cooldown has passed
//   completed  - already finished, can be re-read (revision)
//   cooldown   - the next day, still waiting out its cooldown
//   locked     - must finish earlier days first
daysRouter.get("/", optionalUserId, async (req, res) => {
  try {
    const topicId = Number(req.query.topic_id);
    const userId = req.userId || String(req.query.user_id || "");
    if (!Number.isInteger(topicId)) {
      return res.status(400).json({ error: "topic_id is required" });
    }

    const topicRes = await query(
      "select id, name, slug, accent, blurb from topics where id = $1",
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

    const now = Date.now();
    const completedAt = progress.last_completed_at
      ? new Date(progress.last_completed_at).getTime()
      : null;
    const lastCompleted = progress.last_deck_index_completed;
    const onCooldown =
      lastCompleted >= 0 &&
      completedAt != null &&
      now - completedAt < COOLDOWN_MS;
    const nextIndex = lastCompleted + 1;

    const days = deckRes.rows.map((d) => {
      let status;
      if (d.deck_index <= lastCompleted) {
        status = "completed";
      } else if (d.deck_index === nextIndex && onCooldown) {
        status = "cooldown";
      } else if (d.deck_index === nextIndex) {
        status = "available";
      } else {
        status = "locked";
      }
      return {
        day: d.deck_index,
        deck_index: d.deck_index,
        difficulty: d.difficulty,
        status,
        cooldown_remaining_hours:
          status === "cooldown"
            ? Math.ceil((COOLDOWN_MS - (now - completedAt)) / (60 * 60 * 1000))
            : 0,
      };
    });

    res.json({ topic, days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load days" });
  }
});
