import { COGNITIVE_CATEGORY_META } from "../../api/cognitiveService";

// Results screen for a finished cognitive test.
//
// Deliberately a diagnostic, not a verdict. It leads with a plain-words
// descriptive read, then the per-question breakdown (the part that actually
// explains what went wrong), then a category trend comparing this attempt to
// the user's own recent average. It stays entirely personal: no ranking
// against other users, no leaderboard, because cognitive performance is more
// sensitive to rank publicly than topic streaks are.
//
// Visual language is the app's existing one: register-style monospace
// numbers, a couple of small color markers, no chart library and no new
// dashboard aesthetic.

const TESTS_ACCENT = "var(--accent-cog)";
const DONE_ACCENT = "var(--accent-complete)";

const CATEGORY_LABELS = {
  numerical: COGNITIVE_CATEGORY_META.numerical.label,
  verbal: COGNITIVE_CATEGORY_META.verbal.label,
  abstract: COGNITIVE_CATEGORY_META.abstract.label,
  logical: COGNITIVE_CATEGORY_META.logical.label,
};

function formatSeconds(ms) {
  const s = Math.max(0, ms) / 1000;
  return `${s.toFixed(1)}s`;
}

function optionText(question, optionId) {
  if (!optionId) return null;
  const found = (question.options || []).find((o) => o.id === optionId);
  return found ? found.text : optionId;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

// One row per question: what it asked, what was picked, the correct option
// when it was missed, and how long it took. Correct is the same blue used
// for "done" everywhere else; a miss or a skip is visually distinct but calm,
// never red-alert styling.
function BreakdownRow({ item, index }) {
  const correct = item.is_correct;
  const skipped = item.was_skipped;
  const marker = correct ? DONE_ACCENT : skipped ? "var(--color-hairline)" : TESTS_ACCENT;
  const pickedLabel = skipped ? "skipped" : optionText(item, item.selected_option_id);

  return (
    <div className="rounded-lg border border-hairline bg-paper px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-[2px]"
          style={{ backgroundColor: marker }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              q{String(index + 1).padStart(2, "0")}
            </p>
            <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {skipped ? "skipped" : formatSeconds(item.time_taken_ms)}
            </p>
          </div>
          <p className="mt-1 font-sans text-[15px] leading-relaxed text-ink">
            {item.question_text}
          </p>

          <p className="mt-2 font-sans text-[13px] text-muted">
            you picked{" "}
            <span className="text-ink/80" style={{ color: correct ? DONE_ACCENT : undefined }}>
              {pickedLabel}
            </span>
          </p>

          {!correct && (
            <p className="mt-0.5 font-sans text-[13px] text-muted">
              correct{" "}
              <span style={{ color: DONE_ACCENT }}>{optionText(item, item.correct_option_id)}</span>
            </p>
          )}

          {item.explanation && (
            <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-muted">
              {item.explanation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// This attempt versus the user's own recent average, as two plain numbers.
function TrendBlock({ attempt, trend }) {
  if (!trend) {
    return (
      <p className="font-sans text-[14px] leading-relaxed text-muted">
        This is your first save for this category, so there is no past run to compare
        against yet. One more attempt and a trend appears here.
      </p>
    );
  }

  const thisAccuracy = attempt.question_count ? attempt.score / attempt.question_count : 0;
  const thisAvg = attempt.question_count ? attempt.total_time_ms / attempt.question_count : 0;
  const avgAccuracy = trend.avg_accuracy;
  const avgTime = trend.avg_time_ms;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-hairline bg-panel px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">accuracy</p>
        <p className="mt-1 font-mono text-lg text-ink">{pct(thisAccuracy)}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          recent avg {pct(avgAccuracy)}
        </p>
      </div>
      <div className="rounded-lg border border-hairline bg-panel px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">pace</p>
        <p className="mt-1 font-mono text-lg text-ink">{formatSeconds(thisAvg)}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          recent avg {formatSeconds(avgTime)}
        </p>
      </div>
    </div>
  );
}

export function TestResults({ attempt, breakdown, trend, onRetake, onBack }) {
  const label = CATEGORY_LABELS[attempt.category] || "Test";
  const score = `${attempt.score} / ${attempt.question_count}`;
  const accuracy = attempt.question_count ? attempt.score / attempt.question_count : 0;

  return (
    <main className="screen-in h-dvh overflow-y-auto bg-paper">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            antibrainrot
          </p>
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            all tests
          </button>
        </div>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {label}
        </p>
        <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {attempt.rating}
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          {score} correct in {formatSeconds(attempt.total_time_ms)} ({pct(accuracy)} accuracy). Here is
          where the time and the misses actually went.
        </p>
      </header>

      <section className="mt-6 px-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          against your own recent runs
        </h2>
        <div className="mt-3">
          <TrendBlock attempt={attempt} trend={trend} />
        </div>
      </section>

      <section className="mt-8 px-6 pb-[calc(max(2.5rem,env(safe-area-inset-bottom))+var(--tabbar-h))]">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            question by question
          </h2>
          <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: DONE_ACCENT }}
                aria-hidden="true"
              />
              correct
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: TESTS_ACCENT }}
                aria-hidden="true"
              />
              missed
            </span>
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {breakdown.map((item, i) => (
            <BreakdownRow key={item.question_id} item={item} index={i} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRetake}
            className="rounded-lg bg-ink px-5 py-3 font-sans text-[14px] font-semibold text-paper"
          >
            Take another
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-hairline px-5 py-3 font-sans text-[14px] font-semibold text-ink transition-colors hover:border-ink"
          >
            Back to tests
          </button>
        </div>
      </section>
    </main>
  );
}
