import { StatusScreen } from "../ui/StatusScreen";

// The list of a category's published tests as numbered days, the same idea as
// a topic's day list: Test 0, Test 1, ... in generation order, each either
// done (openable again as a retake) or available. This is what makes past
// tests reachable instead of only ever exposing the newest one.
//
// Days are shown oldest first, matching the Subject day list. The newest one
// carries a "current" note so it is obvious which is the freshly generated
// test. Completed days use the same sky-blue completion color as everywhere
// else in the app.

const TESTS_ACCENT = "var(--accent-cog)";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function TestDays({
  category,
  days,
  error,
  loading,
  latestIndex,
  onSelect,
  onBack,
}) {
  if (error) {
    return (
      <StatusScreen
        label={error}
        title={category?.label || "Tests"}
        accent="accent-cog"
        onAction={onBack}
        actionLabel="back to tests"
      />
    );
  }
  if (loading || !days) {
    return <StatusScreen label="loading tests" title={category?.label || "Tests"} accent="accent-cog" />;
  }

  const total = days.length;
  const done = days.filter((d) => d.completed).length;

  return (
    <main className="screen-in h-dvh overflow-y-auto bg-paper">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">antibrainrot</p>
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            all tests
          </button>
        </div>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">tests</p>
        <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {category?.label}
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          {done} of {total} done. Open any day to take it, including ones you have already finished.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[calc(max(2.5rem,env(safe-area-inset-bottom))+var(--tabbar-h))]">
        {days.map((day) => {
          const isDone = day.completed;
          const isCurrent = day.test_index === latestIndex;
          return (
            <button
              key={day.test_id}
              type="button"
              onClick={() => onSelect(day)}
              className="group flex items-start gap-4 rounded-lg border border-hairline bg-paper px-5 py-4 text-left transition-colors hover:border-ink"
            >
              <span
                className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: isDone ? "var(--accent-complete)" : TESTS_ACCENT,
                }}
                aria-hidden="true"
              />
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={`font-sans text-[17px] font-semibold tracking-tight ${
                      isDone ? "text-accent-complete" : "text-ink"
                    }`}
                  >
                    Test {day.test_index}
                  </span>
                  {isCurrent && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      current
                    </span>
                  )}
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {day.question_count} questions
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {day.generated_date && <span>{formatDate(day.generated_date)}</span>}
                  {isDone ? (
                    <span className="text-accent-complete">
                      done
                      {day.best_score != null && ` · best ${day.best_score}/${day.question_count}`}
                    </span>
                  ) : (
                    <span>not taken</span>
                  )}
                  {isDone && day.attempt_count > 1 && (
                    <span>{day.attempt_count} attempts</span>
                  )}
                </span>
              </span>
              <span className="shrink-0 self-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors group-hover:text-ink">
                {isDone ? "retake" : "start"}
              </span>
            </button>
          );
        })}

        {days.length === 0 && (
          <p className="font-sans text-[14px] leading-relaxed text-muted">
            No tests published for this category yet.
          </p>
        )}
      </div>
    </main>
  );
}
