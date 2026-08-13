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
    if (result.status === "already-ran") {
      return res.status(429).json(result);
    }
    // Per-topic failures are reported inside `results` with a 200, so
    // the caller can see each topic's outcome in one response.
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "generation job failed" });
  }
});
