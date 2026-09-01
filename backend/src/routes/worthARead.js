import { Router } from "express";
import { query } from "../db.js";
import { syncWorthARead } from "../generate/worthARead.js";

// Worth a Read routes.
//
// GET /api/worth-a-read        - the list screen's data, newest first.
// POST /api/sync-worth-a-read  - on-demand re-parse of pipeline/worth_a_read.md,
//                                protected by GENERATION_SECRET like the other
//                                pipeline-triggering routes. No daily cap: there
//                                is no LLM call here, so it is cheap to run
//                                whenever a new entry is pushed.

export const worthAReadRouter = Router();

// GET /api/worth-a-read
worthAReadRouter.get("/worth-a-read", async (_req, res) => {
  try {
    const { rows } = await query(
      "select id, title, url, note, added_at from worth_a_read order by added_at desc, id desc"
    );
    res.json({ entries: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load worth-a-read list" });
  }
});

// POST /api/sync-worth-a-read   (header: Authorization: Bearer <GENERATION_SECRET>)
worthAReadRouter.post("/sync-worth-a-read", async (req, res) => {
  const expected = process.env.GENERATION_SECRET
    ? `Bearer ${process.env.GENERATION_SECRET}`
    : "";
  if (!expected || req.headers.authorization !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await syncWorthARead();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "worth-a-read sync failed" });
  }
});
