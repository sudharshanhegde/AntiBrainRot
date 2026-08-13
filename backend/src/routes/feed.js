import { Router } from "express";
import { query } from "../db.js";

export const feedRouter = Router();

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// GET /api/feed?topic_id=1&user_id=anon-1
//
// Serves the next unseen deck for a user on a topic, or a cooldown /
// exhausted status. Content is never generated here, this endpoint only
// reads pre-generated, pre-reviewed rows. A new user (no progress) is
// served deck 0, which is how existing content gives them context.
feedRouter.get("/", async (req, res) => {
  try {
    const topicId = Number(req.query.topic_id);
    const userId = String(req.query.user_id || "");
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

    // Revision mode: serve a specific already-published deck (for
    // example the one the user just finished) regardless of the 24h
    // cooldown, so a user can re-read a completed deck.
    const rawDeckIndex = req.query.deck_index;
    const revisionIndex =
      rawDeckIndex !== undefined && rawDeckIndex !== ""
        ? Number(rawDeckIndex)
        : null;
    if (Number.isInteger(revisionIndex)) {
      const revRes = await query(
        `select d.deck_index, d.difficulty,
                c.order_index, c.template, c.title, c.body,
                c.code_snippet, c.diagram_ref, c.concept
           from decks d
           join cards c on c.deck_id = d.id
          where d.topic_id = $1 and d.deck_index = $2 and d.reviewed_at is not null
          order by c.order_index`,
        [topicId, revisionIndex]
      );
      if (revRes.rows.length === 0) {
        return res.json({ status: "exhausted", topic, next_deck_index: revisionIndex });
      }
      const revCards = revRes.rows.map((r) => ({
        order_index: r.order_index,
        template: r.template,
        title: r.title,
        body: r.body,
        code_snippet: r.code_snippet,
        diagram_ref: r.diagram_ref,
        concept: r.concept,
      }));
      return res.json({
        status: "ok",
        topic,
        deck: {
          deck_index: revRes.rows[0].deck_index,
          difficulty: revRes.rows[0].difficulty,
          cards: revCards,
        },
      });
    }

    const progressRes = await query(
      "select last_deck_index_completed, last_completed_at from user_progress where user_id = $1 and topic_id = $2",
      [userId, topicId]
    );
    const progress = progressRes.rows[0] || {
      last_deck_index_completed: -1,
      last_completed_at: null,
    };

    // A completed deck locks the topic for 24 hours.
    if (progress.last_deck_index_completed >= 0 && progress.last_completed_at) {
      const completedAt = new Date(progress.last_completed_at).getTime();
      const remaining = COOLDOWN_MS - (Date.now() - completedAt);
      if (remaining > 0) {
        return res.json({
          status: "cooldown",
          topic,
          next_deck_index: progress.last_deck_index_completed + 1,
          cooldown_remaining_hours: Math.ceil(remaining / (60 * 60 * 1000)),
        });
      }
    }

    const nextIndex = progress.last_deck_index_completed + 1;
    const deckRes = await query(
      `select d.deck_index, d.difficulty,
              c.order_index, c.template, c.title, c.body,
              c.code_snippet, c.diagram_ref, c.concept
         from decks d
         join cards c on c.deck_id = d.id
        where d.topic_id = $1 and d.deck_index = $2 and d.reviewed_at is not null
        order by c.order_index`,
      [topicId, nextIndex]
    );

    if (deckRes.rows.length === 0) {
      return res.json({
        status: "exhausted",
        topic,
        next_deck_index: nextIndex,
      });
    }

    const cards = deckRes.rows.map((r) => ({
      order_index: r.order_index,
      template: r.template,
      title: r.title,
      body: r.body,
      code_snippet: r.code_snippet,
      diagram_ref: r.diagram_ref,
      concept: r.concept,
    }));

    res.json({
      status: "ok",
      topic,
      deck: {
        deck_index: deckRes.rows[0].deck_index,
        difficulty: deckRes.rows[0].difficulty,
        cards,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load the feed" });
  }
});
