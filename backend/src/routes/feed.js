import { Router } from "express";
import { query } from "../db.js";
import { optionalUserId } from "../auth.js";

export const feedRouter = Router();

function toCard(r) {
  return {
    card_id: r.card_id,
    order_index: r.order_index,
    type: r.type,
    template: r.template,
    title: r.title,
    body: r.body,
    code_snippet: r.code_snippet,
    diagram_ref: r.diagram_ref,
    concept: r.concept,
    question: r.question,
    options: r.options,
    correct_option_id: r.correct_option_id,
    tests_card_id: r.tests_card_id,
  };
}

// GET /api/feed?topic_id=1&user_id=anon-1
//
// Serves the next unseen deck for a user on a topic, or an exhausted
// status when no reviewed decks remain. Content is never generated here,
// this endpoint only reads pre-generated, pre-reviewed rows. A new user
// (no progress) is served deck 0, which is how existing content gives
// them context. The user id is taken from the verified JWT when one is
// sent, falling back to the anonymous query parameter otherwise.
feedRouter.get("/", optionalUserId, async (req, res) => {
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

    // Revision mode: serve a specific already-published deck (for
    // example the one the user just finished) so a user can re-read a
    // completed deck.
    const rawDeckIndex = req.query.deck_index;
    const revisionIndex =
      rawDeckIndex !== undefined && rawDeckIndex !== ""
        ? Number(rawDeckIndex)
        : null;
    if (Number.isInteger(revisionIndex)) {
      const REVISION_SELECT = `select d.deck_index, d.difficulty, d.id as deck_id,
              c.id as card_id, c.order_index, c.type, c.template, c.title, c.body,
              c.code_snippet, c.diagram_ref, c.concept,
              c.question, c.options, c.correct_option_id, c.tests_card_id
         from decks d
         join cards c on c.deck_id = d.id
        where d.topic_id = $1 and d.deck_index = $2`;
      // First with the normal "published" gate. If that misses, fall
      // back to serving the deck by index regardless of reviewed_at:
      // a revision is re-reading a deck the user already completed, so
      // as long as the deck and its cards exist it should never report
      // "no content yet" (e.g. rows inserted manually without the review
      // stamp). Log the mismatch so it can be investigated.
      let revRes = await query(
        `${REVISION_SELECT} and d.reviewed_at is not null order by c.order_index`,
        [topicId, revisionIndex]
      );
      if (revRes.rows.length === 0) {
        revRes = await query(
          `${REVISION_SELECT} order by c.order_index`,
          [topicId, revisionIndex]
        );
        if (revRes.rows.length > 0) {
          console.warn(
            `[feed] revision deck ${revisionIndex} for topic ${topicId} matched only without reviewed_at; check the deck row`
          );
        }
      }
      if (revRes.rows.length === 0) {
        return res.json({ status: "exhausted", topic, next_deck_index: revisionIndex });
      }
      return res.json({
        status: "ok",
        topic,
        deck: {
          deck_id: revRes.rows[0].deck_id,
          deck_index: revRes.rows[0].deck_index,
          difficulty: revRes.rows[0].difficulty,
          cards: revRes.rows.map(toCard),
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

    // No cooldown: the next deck is always served as soon as the previous
    // one is completed.
    const nextIndex = progress.last_deck_index_completed + 1;
    const deckRes = await query(
      `select d.deck_index, d.difficulty, d.id as deck_id,
              c.id as card_id, c.order_index, c.type, c.template, c.title, c.body,
              c.code_snippet, c.diagram_ref, c.concept,
              c.question, c.options, c.correct_option_id, c.tests_card_id
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

    res.json({
      status: "ok",
      topic,
      deck: {
        deck_id: deckRes.rows[0].deck_id,
        deck_index: deckRes.rows[0].deck_index,
        difficulty: deckRes.rows[0].difficulty,
        cards: deckRes.rows.map(toCard),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load the feed" });
  }
});
