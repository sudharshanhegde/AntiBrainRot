import { pool } from "../db.js";

// Inserts a reviewed deck and its concept labels in one transaction, so
// the covered_concepts tracking table can never drift out of sync with
// what is actually live. Used by the manual publish endpoint and by the
// automated daily generation job.

export async function insertReviewedDeck(topicSlug, deck) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const topicRes = await client.query(
      `insert into topics (name, slug)
       values ($1, $2)
       on conflict (slug) do update set name = excluded.name
       returning id`,
      [topicSlug, topicSlug]
    );
    const topicId = topicRes.rows[0].id;

    const deckRes = await client.query(
      `insert into decks
         (topic_id, deck_index, difficulty, generated_at, reviewed_at,
          subject_slug, subject_title, part_number, part_count, subject_analogy)
       values ($1, $2, $3, now(), now(), $4, $5, $6, $7, $8)
       on conflict (topic_id, deck_index) do update set
         difficulty = excluded.difficulty,
         subject_slug = excluded.subject_slug,
         subject_title = excluded.subject_title,
         part_number = excluded.part_number,
         part_count = excluded.part_count,
         subject_analogy = excluded.subject_analogy,
         reviewed_at = now()
       returning id`,
      [
        topicId,
        deck.deck_index,
        deck.difficulty || "fundamentals",
        deck.subject_slug || null,
        deck.subject_title || null,
        Number.isInteger(deck.part_number) ? deck.part_number : null,
        Number.isInteger(deck.part_count) ? deck.part_count : null,
        deck.subject_analogy || null,
      ]
    );
    const deckId = deckRes.rows[0].id;

    for (const card of deck.cards) {
      // Quiz cards use the quiz columns and leave the
      // concept-only fields empty; concept cards keep the existing
      // template/title/body layout. options is serialized so the jsonb
      // column is fed a JSON string.
      const isQuiz = card.type === "quiz";
      await client.query(
        `insert into cards
           (deck_id, order_index, type, template, title, body, code_snippet, diagram_ref, concept,
            question, options, correct_option_id, tests_card_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (deck_id, order_index) do update set
           type = excluded.type,
           template = excluded.template,
           title = excluded.title,
           body = excluded.body,
           code_snippet = excluded.code_snippet,
           diagram_ref = excluded.diagram_ref,
           concept = excluded.concept,
           question = excluded.question,
           options = excluded.options,
           correct_option_id = excluded.correct_option_id,
           tests_card_id = excluded.tests_card_id`,
        [
          deckId,
          card.order_index,
          isQuiz ? "quiz" : "concept",
          isQuiz ? "" : card.template,
          isQuiz ? "" : card.title,
          isQuiz ? "" : card.body,
          isQuiz ? null : card.code_snippet,
          isQuiz ? null : card.diagram_ref,
          isQuiz ? null : card.concept,
          isQuiz ? card.question : null,
          isQuiz ? JSON.stringify(card.options) : null,
          isQuiz ? card.correct_option_id : null,
          isQuiz ? card.tests_card_id : null,
        ]
      );
    }

    // Concept-level coverage, same transaction as the deck/cards. Only
    // concept cards register coverage; quiz cards never do.
    for (const card of deck.cards) {
      if (card.type !== "quiz" && card.concept) {
        await client.query(
          `insert into covered_concepts (topic_id, concept_label, deck_id)
           values ($1, $2, $3)
           on conflict (topic_id, concept_label) do nothing`,
          [topicId, card.concept, deckId]
        );
      }
    }

    // Subject decks mark their assigned concepts done in the same
    // transaction, so the syllabus can never hand out a concept that was
    // just published. Legacy mixed decks (no subject_slug) skip this.
    if (deck.subject_slug) {
      for (const card of deck.cards) {
        if (card.type === "quiz" || !card.concept) continue;
        await client.query(
          `update syllabus set status = 'done'
            where topic_id = $1 and subject_slug = $2 and concept_label = $3`,
          [topicId, deck.subject_slug, card.concept]
        );
      }
    }

    await client.query("commit");
    return { topicId, deckId };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
