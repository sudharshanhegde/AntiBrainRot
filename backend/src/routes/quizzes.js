import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";

export const quizzesRouter = Router();

// POST /api/quizzes/answer
// body: { card_id, selected_option_id }
//
// Records a quiz answer for the signed-in user (id from the verified
// JWT, never client-supplied). Correctness is computed server-side from
// the card's stored correct_option_id, never trusted from the client.
// One row per (user_id, card_id): revisiting a card and changing the
// answer updates that row, so end-of-deck scoring always reflects the
// latest answer.
quizzesRouter.post("/answer", requireAuth, async (req, res) => {
  try {
    const { card_id, selected_option_id } = req.body || {};
    if (
      !Number.isInteger(card_id) ||
      typeof selected_option_id !== "string" ||
      !selected_option_id
    ) {
      return res
        .status(400)
        .json({ error: "card_id and selected_option_id are required" });
    }
    const user_id = req.userId;

    const cardRes = await query(
      "select correct_option_id from cards where id = $1 and type = 'quiz'",
      [card_id]
    );
    if (cardRes.rows.length === 0) {
      return res.status(404).json({ error: "quiz card not found" });
    }
    const correctOptionId = cardRes.rows[0].correct_option_id;
    const isCorrect = selected_option_id === correctOptionId;

    await query(
      `insert into quiz_answers (user_id, card_id, selected_option_id, is_correct, answered_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_id, card_id) do update set
         selected_option_id = excluded.selected_option_id,
         is_correct = excluded.is_correct,
         answered_at = now()`,
      [user_id, card_id, selected_option_id, isCorrect]
    );

    res.json({ ok: true, is_correct: isCorrect, correct_option_id: correctOptionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not record quiz answer" });
  }
});

// GET /api/quizzes/score?card_ids=1,2,3
//
// Fresh aggregation of the signed-in user's quiz answers for the given
// card ids, computed at request time rather than from a stored running
// score, so a revisited-and-changed answer is always reflected. Returns
// { score: { correct, total } } where total is the number of card ids
// passed in (all quiz cards in a deck).
quizzesRouter.get("/score", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const cardIds = String(req.query.card_ids || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Number.isInteger);
    if (cardIds.length === 0) {
      return res.status(400).json({ error: "card_ids are required" });
    }

    const { rows } = await query(
      `select coalesce(count(*) filter (where qa.is_correct), 0)::int as correct
         from cards c
         left join quiz_answers qa on qa.card_id = c.id and qa.user_id = $1
        where c.id = any($2) and c.type = 'quiz'`,
      [userId, cardIds]
    );

    res.json({ score: { correct: rows[0].correct, total: cardIds.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load quiz score" });
  }
});
