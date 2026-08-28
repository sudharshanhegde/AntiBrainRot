import { topicPalette } from "../../data/topics";

// A slide-in drawer listing a topic's days (Day 0, Day 1, ...), opened
// from the feed's hamburger. Finished days are shown in the sky-blue
// completion color with a "done" label; every other published day is
// playable immediately. There is no cooldown and no lock, so every day
// can be opened directly.
export function DaysDrawer({ topicSlug, days, onSelect, onClose, onBackToTopics }) {
  const topic = topicPalette[topicSlug] || topicPalette["operating-systems"];
  const accent = `var(--${topic.accent})`;

  const statusLabel = (day) => (day.status === "completed" ? "done" : "play");

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`${topic.name} days`}
    >
      <button
        type="button"
        className="h-full w-full bg-ink/40"
        onClick={onClose}
        aria-label="Close days"
      />
      <div className="flex h-full w-[82%] max-w-sm flex-col border-l border-hairline bg-paper shadow-lg">
        <div className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <h2
            className="font-sans text-lg font-semibold tracking-tight"
            style={{ color: accent }}
          >
            {topic.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            days
          </p>
          <div className="flex flex-col gap-2">
            {days.map((day) => {
              const isDone = day.status === "completed";
              return (
                <button
                  key={day.deck_index}
                  type="button"
                  onClick={() => onSelect(day)}
                  className="flex items-center justify-between rounded-lg border border-hairline px-4 py-3 text-left transition-colors hover:border-ink"
                >
                  <span className="flex items-baseline gap-3">
                    <span
                      className={`font-sans text-[15px] font-semibold tracking-tight ${
                        isDone ? "text-accent-complete" : "text-ink"
                      }`}
                    >
                      Day {day.day}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {day.difficulty}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                      isDone ? "text-accent-complete" : "text-muted"
                    }`}
                  >
                    {statusLabel(day)}
                  </span>
                </button>
              );
            })}
            {days.length === 0 && (
              <p className="font-sans text-[14px] leading-relaxed text-muted">
                No days published yet.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onBackToTopics}
            className="w-full rounded-lg border border-ink bg-paper py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            back to topics
          </button>
        </div>
      </div>
    </div>
  );
}
