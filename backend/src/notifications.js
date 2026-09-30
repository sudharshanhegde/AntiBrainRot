import "./env.js";
import webpush from "web-push";
import { query } from "./db.js";

// Web Push sender for the daily reading reminder.
//
// VAPID keys identify this app to the browser push service. When they are
// absent the module stays inert: subscriptions can still be stored, but no
// push can be sent, and sendDailyReminders reports "not-configured" rather
// than failing. Keys are generated once with:
//   npx web-push generate-vapid-keys
const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const subject =
  process.env.VAPID_SUBJECT || "mailto:notifications@antibrainrot.app";

export const isPushConfigured = Boolean(publicKey && privateKey);

if (isPushConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

// The one notification a day. Deliberately a gentle nudge, not a streak
// threat: it points at the fresh content the daily job just published.
function dailyPayload() {
  return {
    title: "New topics are ready",
    body: "Fresh lessons are waiting. Read a few slides to keep your streak and feed your pet.",
    url: "/#/quick-bites",
    tag: "daily-reading",
  };
}

// Sends one payload to one stored subscription. Returns "ok", "gone" (the
// push service no longer has it, HTTP 404/410, so it should be pruned), or
// "error" (a transient failure worth keeping the row for).
export async function sendToSubscription(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return "ok";
  } catch (err) {
    const status = err?.statusCode;
    if (status === 404 || status === 410) return "gone";
    console.warn("[push] send failed:", status || err.message);
    return "error";
  }
}

// Sends the daily reminder to every subscribed user who has not completed a
// deck today, pruning subscriptions the push service reports gone. The
// "today" boundary is UTC because the server does not know each user's
// local timezone; last_completed_at is a timestamptz, so the comparison is
// timezone-safe. Returns a small summary for the caller to log.
export async function sendDailyReminders() {
  if (!isPushConfigured) {
    return { status: "not-configured", total: 0, sent: 0, pruned: 0, failed: 0 };
  }

  const { rows } = await query(
    `select s.id, s.endpoint, s.p256dh, s.auth
       from push_subscriptions s
      where not exists (
        select 1 from user_progress p
         where p.user_id = s.user_id
           and p.last_completed_at >= date_trunc('day', now())
      )`
  );

  const payload = dailyPayload();
  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const sub of rows) {
    const result = await sendToSubscription(sub, payload);
    if (result === "ok") {
      sent += 1;
      await query("update push_subscriptions set last_seen_at = now() where id = $1", [sub.id]);
    } else if (result === "gone") {
      pruned += 1;
      await query("delete from push_subscriptions where id = $1", [sub.id]);
    } else {
      failed += 1;
    }
  }

  return { status: "ok", total: rows.length, sent, pruned, failed };
}
