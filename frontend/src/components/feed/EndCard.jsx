import { useEffect, useRef, useState } from "react";
import { useCardEnter } from "../../hooks/useCardEnter";
import { fetchQuizScore, flushQuizAnswers } from "../../api/quizzes";

// The deliberate stopping point at the end of a deck. States what was
// just finished and offers one clear next action (explore another
// topic), with a quiet "surprise me" alternative. Same token system as
// the content cards; no gamification, per SKILL_frontend.md.
//
// SKILL_quiz.md: one extra line reports how many of the deck's quiz
// questions were answered correctly (e.g. "8 / 10"), in the same
// register-style numeric treatment used for deck position, computed
// fresh from quiz_answers when this screen renders rather than from a
// stored running score.
export function EndCard({ topic, difficulty, onExplore, onSurprise, quizCardIds = [] }) {
  const bodyRef = useRef(null);
  useCardEnter(bodyRef);

  const [score, setScore] = useState(null);

  useEffect(() => {
    if (!quizCardIds || quizCardIds.length === 0) return;
    let active = true;

    // Wait for any in-flight answer submissions to finish first, so the
    // last answers (especially the ones tapped just before reaching the
    // end) are written before the score is aggregated. Without this the
    // score fetch races the fire-and-forget answer POSTs and undercounts.
    flushQuizAnswers()
      .then(() => fetchQuizScore(quizCardIds))
      .then((s) => {
        if (active) setScore(s);
      })
      .catch(() => {
        // scoring is best-effort; the end card still renders
      });

    return () => {
      active = false;
    };
  }, [quizCardIds]);

  const accentVar = `var(--${topic.accent})`;

  return (
    <article
      className="feed-card flex flex-col"
      aria-label={`End of deck, ${topic.name}`}
    >
      <header className="shrink-0 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.14em]">
          <div className="flex items-baseline gap-3">
            <span className="flex items-center gap-2" style={{ color: accentVar }}>
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: accentVar }}
                aria-hidden="true"
              />
              {topic.short}
            </span>
            <span className="text-muted">complete</span>
          </div>
        </div>
        <div className="mt-3 h-px bg-hairline" />
      </header>

      <div
        ref={bodyRef}
        className="card-body flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <p
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: accentVar }}
        >
          all caught up
        </p>
        <h2 className="font-sans text-3xl font-semibold leading-tight tracking-tight">
          You're all caught up here.
        </h2>
        <p className="max-w-sm font-sans text-[16px] leading-relaxed text-muted">
          You finished the {difficulty} day for {topic.name}. The next day
          unlocks soon.
        </p>
        {score != null && (
          <div className="flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            <span>quiz</span>
            <span className="text-ink tabular-nums">
              {score.correct} / {score.total}
            </span>
          </div>
        )}
        <div className="mt-2 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onExplore}
            className="rounded-lg border border-ink bg-paper px-6 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            explore another topic
          </button>
          <button
            type="button"
            onClick={onSurprise}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            surprise me
          </button>
        </div>
      </div>

      <footer className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="h-px bg-hairline" />
      </footer>
    </article>
  );
}
