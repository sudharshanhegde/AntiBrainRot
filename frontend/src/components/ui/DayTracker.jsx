// Per-topic day tracker (SKILL_profile_progress.md): a structural row of
// day numbers, 1 through the topic's target deck count, not a calendar.
// Completed days are sky blue (the shared completion color, deliberately
// distinct from any topic accent), the current in-progress day is marked
// in a calmer filled state (not blue yet), and future days are dimmed.
//
// A day number n is complete when n <= lastCompletedIndex + 1, where
// lastCompletedIndex is user_progress.last_deck_index_completed (0-based),
// so this is a pure read of existing data, no new tracking table.
export function DayTracker({ targetDecks, lastCompletedIndex = -1 }) {
  const count = Number.isInteger(targetDecks) && targetDecks > 0 ? targetDecks : 0;
  const days = Array.from({ length: count }, (_, i) => i + 1);
  const activeDay = lastCompletedIndex + 2;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="list"
      aria-label="day progress"
    >
      {days.map((n) => {
        const completed = n <= lastCompletedIndex + 1;
        const active = !completed && n === activeDay;
        const classes = completed
          ? "border-accent-complete bg-accent-complete text-paper"
          : active
            ? "border-ink bg-panel text-ink"
            : "border-hairline text-muted opacity-60";
        return (
          <span
            key={n}
            role="listitem"
            aria-label={`day ${n}${
              completed ? ", completed" : active ? ", in progress" : ""
            }`}
            className={`flex h-6 w-6 items-center justify-center rounded-[2px] border font-mono text-[11px] leading-none ${classes}`}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}
