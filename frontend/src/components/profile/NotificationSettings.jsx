import { useEffect, useState } from "react";
import {
  getSubscription,
  notificationsSupported,
  subscribeToReminders,
  unsubscribeFromReminders,
} from "../../api/notifications";

// The daily-reminder opt-in. Push is per browser, so this reflects and
// controls the subscription for this device. Signed-in only (a guest has
// no account to attach the subscription to), and hidden entirely on
// browsers without Push support.
export function NotificationSettings() {
  const supported = notificationsSupported();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    getSubscription()
      .then((subscription) => {
        if (active) setEnabled(Boolean(subscription));
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [supported]);

  if (!supported) return null;

  const toggle = async (next) => {
    setBusy(true);
    setError(null);
    try {
      if (next) {
        await subscribeToReminders();
      } else {
        await unsubscribeFromReminders();
      }
      setEnabled(next);
    } catch (err) {
      setError(err.message || "could not update reminders");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-hairline bg-paper px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-sans text-[15px] font-medium tracking-tight text-ink">
            Daily reading reminder
          </span>
          <span className="font-sans text-[13px] leading-relaxed text-muted">
            One nudge a day when new topics are ready and you have not read
            yet. Turn it on for this device.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Daily reading reminder"
          disabled={busy}
          onClick={() => toggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
            enabled ? "border-accent-complete bg-accent-complete" : "border-hairline bg-panel"
          }`}
        >
          <span
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-paper transition-all ${
              enabled ? "left-[calc(100%-1.25rem)]" : "left-1"
            }`}
          />
        </button>
      </div>
      {error && (
        <p className="mt-2 font-sans text-[12px] leading-relaxed text-muted">{error}</p>
      )}
    </section>
  );
}
