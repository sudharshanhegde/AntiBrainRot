import { Router } from "express";
import { insertReviewedDeck } from "../generate/insert.js";

export const decksRouter = Router();

// POST /api/decks
// body: { topic_slug, deck: { deck_index, difficulty, cards: [...] } }
//
// Publishes a reviewed deck (and its concept labels) in one transaction.
// Protected by the same shared secret as /api/generate, since it can
// mutate content. Public-facing routes (topics, feed, progress) are
// separate and remain open for the app.
decksRouter.post("/", async (req, res) => {
  const expected = process.env.GENERATION_SECRET
    ? `Bearer ${process.env.GENERATION_SECRET}`
    : "";
  if (!expected || req.headers.authorization !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const { topic_slug, deck } = req.body || {};
    if (
      !topic_slug ||
      !deck ||
      !Number.isInteger(deck.deck_index) ||
      !Array.isArray(deck.cards)
    ) {
      return res
        .status(400)
        .json({ error: "topic_slug and deck (deck_index, cards) are required" });
    }

    const { topicId, deckId } = await insertReviewedDeck(topic_slug, deck);
    res.json({ ok: true, topic_id: topicId, deck_id: deckId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not insert deck" });
  }
});
