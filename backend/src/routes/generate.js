import { Router } from "express";
import { runDailyJob } from "../generate/job.js";

export const generateRouter = Router();

// POST /api/generate   (header: Authorization: Bearer <GENERATION_SECRET>)
//
// Triggered daily by a GitHub Actions scheduled workflow. Runs the
// automated generation job (one topic per day, round-robin). Protected
// by a shared secret so anyone who finds the URL cannot trigger it.
//   ?dry_run=1  builds the prompt without calling DeepSeek (testing).
generateRouter.post("/", async (req, res) => {
  const expected = process.env.GENERATION_SECRET
    ? `Bearer ${process.env.GENERATION_SECRET}`
    : "";
  if (!expected || req.headers.authorization !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const dryRun = req.query.dry_run === "1";
    const force = req.query.force === "1";
    const topicParam = req.query.topic;
    const topics = topicParam
      ? String(topicParam)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const result = await runDailyJob({ dryRun, force, topics });
    // "already-ran" and "too-early" are normal states for a once-a-day
    // job, not client errors, so they are returned with a 200 like every
    // other status; the body's status field carries the detail. A
    // scheduled trigger that fires after generation already happened
    // today must not be reported as a failure.
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "generation job failed" });
  }
});
