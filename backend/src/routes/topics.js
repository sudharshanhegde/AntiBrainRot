import { Router } from "express";
import { query } from "../db.js";

export const topicsRouter = Router();

// GET /api/topics
// Returns all topics. Niche filtering is a frontend concern for v1
// (the frontend maps a niche to topic slugs from its static config),
// so this endpoint simply lists the corpus of reviewed topics.
topicsRouter.get("/", async (_req, res) => {
  try {
    const { rows } = await query(
      "select id, name, slug, accent, blurb from topics order by id"
    );
    res.json({ topics: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load topics" });
  }
});
