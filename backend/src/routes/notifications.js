import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";
import { sendDailyReminders } from "../notifications.js";

export const notificationsRouter = Router();

// POST /api/notifications/subscribe
// body: { endpoint, keys: { p256dh, auth } }
//
// Stores the browser PushSubscription for the signed-in user. The body is
// exactly PushSubscription.toJSON(), so the frontend can post it as-is.
// endpoint is unique, so re-subscribing the same browser updates its row
// (and can reassign it if a different user signs in on that browser).
notificationsRouter.post("/subscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (
      typeof endpoint !== "string" ||
      !endpoint ||
      typeof p256dh !== "string" ||
      !p256dh ||
      typeof auth !== "string" ||
      !auth
    ) {
      return res
        .status(400)
        .json({ error: "endpoint and keys.p256dh/keys.auth are required" });
    }

    await query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, $2, $3, $4)
       on conflict (endpoint) do update set
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         last_seen_at = now()`,
      [req.userId, endpoint, p256dh, auth]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not save subscription" });
  }
});

// DELETE /api/notifications/subscribe
// body: { endpoint }
//
// Removes one subscription (the browser the user just turned reminders off
// on). Scoped to the signed-in user so one user cannot delete another's.
notificationsRouter.delete("/subscribe", requireAuth, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== "string" || !endpoint) {
      return res.status(400).json({ error: "endpoint is required" });
    }

    await query(
      "delete from push_subscriptions where user_id = $1 and endpoint = $2",
      [req.userId, endpoint]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not remove subscription" });
  }
});

// POST /api/notifications/daily   (Authorization: Bearer <secret>)
//
// Triggered once a day by a GitHub Actions scheduled workflow, the same
// shape as POST /api/generate. Protected by NOTIFY_SECRET, falling back to
// GENERATION_SECRET so a single secret can drive both if preferred.
notificationsRouter.post("/daily", async (req, res) => {
  const secret = process.env.NOTIFY_SECRET || process.env.GENERATION_SECRET || "";
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const result = await sendDailyReminders();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not send reminders" });
  }
});
