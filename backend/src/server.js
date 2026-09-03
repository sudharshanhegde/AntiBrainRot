import "./env.js";
import express from "express";
import cors from "cors";
import { topicsRouter } from "./routes/topics.js";
import { feedRouter } from "./routes/feed.js";
import { progressRouter } from "./routes/progress.js";
import { decksRouter } from "./routes/decks.js";
import { generateRouter } from "./routes/generate.js";
import { daysRouter } from "./routes/days.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { authRouter } from "./routes/auth.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { quickBitesRouter } from "./routes/quickBites.js";
import { worthAReadRouter } from "./routes/worthARead.js";
import { jobsRouter } from "./routes/jobs.js";
import { syncQueue } from "./generate/job.js";
import { syncWorthARead } from "./generate/worthARead.js";
import { syncJobSources } from "./jobs/registry.js";
import { scheduleJobCleanup } from "./jobs/cleanup.js";

const app = express();

// CORS: allow the configured frontend origin(s). Values are normalized
// (trailing slashes stripped) because a value like
// https://app.vercel.app/ would otherwise never match the browser origin.
// Comma-separated origins are supported. When CORS_ORIGIN is unset,
// every origin is allowed (development convenience).
function normalizeOrigin(value) {
  return String(value).replace(/\/+$/, "").trim();
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? (origin, callback) => {
          const allowed = process.env.CORS_ORIGIN.split(",").map(normalizeOrigin);
          if (!origin || allowed.includes(origin)) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        }
      : true,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/topics", topicsRouter);
app.use("/api/feed", feedRouter);
app.use("/api/progress", progressRouter);
app.use("/api/decks", decksRouter);
app.use("/api/generate", generateRouter);
app.use("/api/days", daysRouter);
app.use("/api/quizzes", quizzesRouter);
app.use("/api/auth", authRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/quick-bites", quickBitesRouter);
app.use("/api", worthAReadRouter);
app.use("/api/jobs", jobsRouter);

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`AntiBrainRot API listening on http://localhost:${port}`);
  // Populate the topics table from the queue file on startup, so
  // /api/topics has data immediately after a fresh deploy instead of
  // waiting for the first daily generation run.
  syncQueue()
    .then(() => console.log("[topics] queue synced"))
    .catch((err) => console.warn("[topics] startup sync failed:", err.message));
  // Same for Worth a Read, so the list has data immediately after a fresh
  // deploy instead of waiting for the first daily run or a manual trigger.
  syncWorthARead()
    .then(() => console.log("[worth-a-read] synced"))
    .catch((err) => console.warn("[worth-a-read] startup sync failed:", err.message));
  // Sync the jobs source registry so enabled sources are present for the
  // first daily scrape instead of waiting for it.
  syncJobSources()
    .then(() => console.log("[jobs] source registry synced"))
    .catch((err) => console.warn("[jobs] startup registry sync failed:", err.message));
  // Automatic jobs-table retention: one pass now and every ~24h removes stale,
  // unreferenced jobs so the table does not grow without bound.
  scheduleJobCleanup();
});
