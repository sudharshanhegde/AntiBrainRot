import { useCallback, useEffect, useRef, useState } from "react";

// The cognitive test loop.
//
// This deliberately does NOT reuse the swipe-snap feed used everywhere else.
// A swipe gesture carries its own momentum and snap-settle time, which would
// be timed as much as the person's thinking is, and contaminate a reaction
// time measurement. Instead one question fills the screen with four tappable
// options; tapping one records the answer and advances immediately, with no
// swipe in the answering path at all.
//
// Timing discipline: the whole test arrives prefetched (see TestRunner's
// caller), so this component makes zero network calls. It measures the
// per-question time from the instant a question renders to the instant an
// option is tapped, runs an overall session countdown, applies a fixed time
// penalty on skip, and hands the finished attempt back to the caller, which
// is the only place a network write happens.

const TESTS_ACCENT = "var(--accent-cog)";
const WARN_ACCENT = "var(--accent-cog)";

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const OPTION_LETTERS = { a: "A", b: "B", c: "C", d: "D" };

// Swipe distance (px) upward that counts as a skip.
const SWIPE_UP_THRESHOLD = 60;

export function TestRunner({ test, onComplete, onExit }) {
  const questions = test.questions;
  const [index, setIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(test.time_limit_ms);

  const deadlineRef = useRef(0);
  const startedAtRef = useRef(0);
  const questionStartRef = useRef(0);
  const answersRef = useRef([]);
  const finishedRef = useRef(false);
  const touchStartRef = useRef(null);
  // The authoritative question pointer for the handlers. Kept in a ref so a
  // fast double tap cannot read a stale index or move the loop backwards; the
  // mirrored state value is only for rendering.
  const indexRef = useRef(0);

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const timeCritical = remainingMs <= test.time_limit_ms * 0.25;

  // Finishes the session exactly once, filling in every question the user did
  // not reach (or was mid-answer on when the clock ran out) as a skip.
  const finish = useCallback(
    (reason) => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      const answered = answersRef.current;
      const answeredIds = new Set(answered.map((a) => a.question_id));
      for (const q of questions) {
        if (!answeredIds.has(q.id)) {
          answered.push({
            question_id: q.id,
            selected_option_id: null,
            time_taken_ms: 0,
            was_skipped: true,
          });
        }
      }

      const elapsed = performance.now() - startedAtRef.current;
      const totalTimeMs = Math.min(Math.round(elapsed), test.time_limit_ms);
      onComplete({ answers: answered, totalTimeMs, reason });
    },
    [questions, test.time_limit_ms, onComplete]
  );

  // Start the clock, and per-question timing whenever the index changes.
  useEffect(() => {
    const now = performance.now();
    startedAtRef.current = now;
    deadlineRef.current = now + test.time_limit_ms;
    questionStartRef.current = now;
    setRemainingMs(test.time_limit_ms);
  }, [test.time_limit_ms, test.id]);

  useEffect(() => {
    questionStartRef.current = performance.now();
  }, [index]);

  // The overall countdown. Polls rather than storing a per-second value so
  // the skip penalty (which subtracts from the deadline) is reflected
  // immediately, and ends the session the moment the budget hits zero.
  useEffect(() => {
    const tick = () => {
      const left = deadlineRef.current - performance.now();
      setRemainingMs(left);
      if (left <= 0) finish("time");
    };
    const id = setInterval(tick, 100);
    tick();
    return () => clearInterval(id);
  }, [finish]);

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= questions.length) {
      finish("done");
      return;
    }
    indexRef.current = next;
    setIndex(next);
  }, [questions.length, finish]);

  const answer = useCallback(
    (optionId) => {
      if (finishedRef.current) return;
      const current = questions[indexRef.current];
      if (!current || answersRef.current.some((a) => a.question_id === current.id)) return;
      const timeTaken = Math.round(performance.now() - questionStartRef.current);
      answersRef.current.push({
        question_id: current.id,
        selected_option_id: optionId,
        time_taken_ms: Math.max(0, timeTaken),
        was_skipped: false,
      });
      advance();
    },
    [questions, advance]
  );

  // Skipping costs a fixed time penalty taken off the whole session budget,
  // deliberately larger than an average answered question, so a guess is
  // strictly better than a reflexive skip.
  const skip = useCallback(() => {
    if (finishedRef.current) return;
    const current = questions[indexRef.current];
    if (!current || answersRef.current.some((a) => a.question_id === current.id)) return;
    const timeTaken = Math.round(performance.now() - questionStartRef.current);
    answersRef.current.push({
      question_id: current.id,
      selected_option_id: null,
      time_taken_ms: Math.max(0, timeTaken),
      was_skipped: true,
    });
    deadlineRef.current -= test.skip_penalty_ms;
    const left = deadlineRef.current - performance.now();
    setRemainingMs(left);
    if (left <= 0) {
      finish("time");
      return;
    }
    advance();
  }, [questions, test.skip_penalty_ms, advance, finish]);

  // Swipe-up anywhere on the question area is the skip gesture, matching the
  // swipe language used elsewhere in the app.
  const onTouchStart = (e) => {
    touchStartRef.current = e.touches[0] ? e.touches[0].clientY : null;
  };
  const onTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start == null) return;
    const end = e.changedTouches[0] ? e.changedTouches[0].clientY : null;
    if (end == null) return;
    if (start - end >= SWIPE_UP_THRESHOLD) skip();
  };

  return (
    <main className="screen-in flex h-dvh flex-col bg-paper">
      <header className="shrink-0 px-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {test.label}
          </p>
          <button
            type="button"
            onClick={onExit}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            exit
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            q{String(index + 1).padStart(2, "0")} / {String(questions.length).padStart(2, "0")}
          </p>
          <p
            className="font-mono text-lg tabular-nums tracking-tight"
            style={{ color: timeCritical ? WARN_ACCENT : "var(--color-ink)" }}
            aria-live="off"
          >
            {formatClock(remainingMs)}
          </p>
        </div>
        <div className="mt-2 h-px bg-hairline" />
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-4 pt-6"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <h1 className="font-sans text-xl font-semibold leading-snug tracking-tight text-ink sm:text-2xl">
          {question.question_text}
        </h1>

        <div className="mt-6 flex flex-col gap-3">
          {(question.options || []).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => answer(option.id)}
              className="group flex items-center gap-4 rounded-lg border border-hairline bg-paper px-5 py-4 text-left transition-colors hover:border-ink active:bg-panel"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                {OPTION_LETTERS[option.id] || option.id}
              </span>
              <span className="font-sans text-[16px] leading-snug text-ink">{option.text}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className="shrink-0 px-6 pb-[calc(max(1rem,env(safe-area-inset-bottom))+var(--tabbar-h))]">
        <div className="h-px bg-hairline" />
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted">
            {isLast ? "last question" : "tap an answer to advance"}
          </p>
          <button
            type="button"
            onClick={skip}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: TESTS_ACCENT }} aria-hidden="true" />
            skip (-{formatClock(test.skip_penalty_ms)})
          </button>
        </div>
      </footer>
    </main>
  );
}
