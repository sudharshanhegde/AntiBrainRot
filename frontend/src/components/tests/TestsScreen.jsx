import { useCallback, useEffect, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { TestRunner } from "./TestRunner";
import { TestResults } from "./TestResults";
import {
  COGNITIVE_CATEGORY_ORDER,
  fetchCognitiveCategories,
  fetchCognitiveTest,
  submitCognitiveAttempt,
} from "../../api/cognitiveService";

// The Tests tab: cognitive speed and accuracy tests.
//
// A category picker, then a rules screen, then the locally-run test, then a
// diagnostic results screen. The critical detail is the order of operations:
// the full test is prefetched while the rules screen is on screen, so by the
// time the user taps Start the whole question set is in client state and the
// run loop makes no network calls at all. Network latency is therefore never
// part of what is being timed. The one write happens after the test ends.
//
// The tests tab is a direct primary destination (position 3 of 6), not a
// hamburger-menu item, per the navigation skill.

const TESTS_ACCENT = "var(--accent-cog)";

function formatSeconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function accuracyPct(score, count) {
  if (!count) return "0%";
  return `${Math.round((score / count) * 100)}%`;
}

// The rules screen shown before every test. No surprises once the timer is
// running: the person should know exactly what they are walking into.
function RulesView({ category, test, testError, loading, onStart, onBack }) {
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
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          before you start
        </p>
        <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {category.label}
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          {category.description}
        </p>
      </header>

      <section className="mt-6 px-6">
        <ul className="flex flex-col gap-3">
          <li className="rounded-lg border border-hairline bg-paper px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">format</p>
            <p className="mt-1 font-sans text-[15px] leading-relaxed text-ink">
              Multiple choice, one correct answer, four options.
            </p>
          </li>
          <li className="rounded-lg border border-hairline bg-paper px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">scoring</p>
            <p className="mt-1 font-sans text-[15px] leading-relaxed text-ink">
              Timed, and scored on both speed and correctness. One question is on screen at a time,
              and tapping an answer moves straight to the next.
            </p>
          </li>
          <li className="rounded-lg border border-hairline bg-paper px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">skipping</p>
            <p className="mt-1 font-sans text-[15px] leading-relaxed text-ink">
              Skipping costs time off your budget rather than being free, so a quick guess is usually
              the better move. Swipe up on a question, or use the skip control, to skip it.
            </p>
          </li>
          {test && (
            <li className="rounded-lg border border-hairline bg-panel px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                this test
              </p>
              <p className="mt-1 font-sans text-[15px] leading-relaxed text-ink">
                {test.question_count} questions · {formatSeconds(test.time_limit_ms)} total ·{" "}
                {formatSeconds(test.skip_penalty_ms)} skip penalty
              </p>
            </li>
          )}
        </ul>
      </section>

      <section className="mt-6 px-6 pb-[calc(max(2.5rem,env(safe-area-inset-bottom))+var(--tabbar-h))]">
        {testError ? (
          <StatusScreen label={testError} title="Could not load this test" accent="accent-cog" />
        ) : (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={!test || loading}
              className="w-full rounded-lg bg-ink px-5 py-4 font-sans text-[15px] font-semibold text-paper disabled:opacity-50"
            >
              {test ? "Start test" : "Preparing your questions..."}
            </button>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              timer starts only when you tap start
            </p>
          </>
        )}
      </section>
    </main>
  );
}

export function TestsScreen() {
  const [categories, setCategories] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  // pick -> rules -> run -> submitting -> results
  const [phase, setPhase] = useState("pick");
  const [test, setTest] = useState(null);
  const [testError, setTestError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [lastAnswers, setLastAnswers] = useState(null);

  const loadCategories = useCallback(async () => {
    setLoadError(null);
    try {
      setCategories(await fetchCognitiveCategories());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "could not load the tests");
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const selected = categories
    ? categories.find((c) => c.id === selectedId) || {
        id: selectedId,
        label: selectedId,
        description: "",
      }
    : null;

  // Selecting a category starts the prefetch immediately, in parallel with
  // the rules screen, so the questions are ready before Start is tapped.
  const chooseCategory = useCallback((id) => {
    setSelectedId(id);
    setPhase("rules");
    setTest(null);
    setTestError(null);
    setResult(null);
    setSubmitError(null);
    fetchCognitiveTest(id)
      .then(setTest)
      .catch((err) => setTestError(err instanceof Error ? err.message : "could not load the test"));
  }, []);

  const backToPicker = useCallback(() => {
    setPhase("pick");
    setSelectedId(null);
    setTest(null);
    setTestError(null);
    setResult(null);
    setSubmitError(null);
    loadCategories();
  }, [loadCategories]);

  const retake = useCallback(() => {
    if (selectedId) chooseCategory(selectedId);
  }, [selectedId, chooseCategory]);

  // The one network write in the whole loop, after the test has ended.
  const handleComplete = useCallback(
    async ({ answers, totalTimeMs }) => {
      setLastAnswers({ answers, totalTimeMs });
      setPhase("submitting");
      setSubmitting(true);
      setSubmitError(null);
      try {
        const data = await submitCognitiveAttempt({
          testId: test.id,
          category: test.category,
          totalTimeMs,
          answers,
        });
        setResult(data);
        setPhase("results");
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "could not save your test");
      } finally {
        setSubmitting(false);
      }
    },
    [test]
  );

  const retrySubmit = useCallback(() => {
    if (lastAnswers) handleComplete(lastAnswers);
  }, [lastAnswers, handleComplete]);

  if (phase === "results" && result) {
    return (
      <TestResults
        attempt={result.attempt}
        breakdown={result.breakdown}
        trend={result.trend}
        onRetake={retake}
        onBack={backToPicker}
      />
    );
  }

  if (phase === "submitting") {
    return (
      <StatusScreen
        label={submitError ? submitError : "scoring your test"}
        title={submitError ? "Could not save the attempt" : undefined}
        accent="accent-cog"
        description={
          submitError
            ? "Your answers are still here. Retry to save this attempt and see the breakdown."
            : undefined
        }
        onAction={submitError ? retrySubmit : undefined}
        actionLabel="try again"
      />
    );
  }

  if (phase === "run") {
    return <TestRunner test={test} onComplete={handleComplete} onExit={backToPicker} />;
  }

  if (phase === "rules" && selected) {
    return (
      <RulesView
        category={selected}
        test={test}
        testError={testError}
        loading={!test}
        onStart={() => {
          if (test) setPhase("run");
        }}
        onBack={backToPicker}
      />
    );
  }

  if (loadError) {
    return (
      <StatusScreen
        label={loadError}
        title="Tests"
        accent="accent-cog"
        onAction={loadCategories}
        actionLabel="try again"
      />
    );
  }
  if (!categories) {
    return <StatusScreen label="loading" title="Tests" accent="accent-cog" />;
  }

  return (
    <main className="screen-in h-dvh overflow-y-auto bg-paper">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">antibrainrot</p>
        <h1
          className="mt-3 font-sans text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: TESTS_ACCENT }}
        >
          Cognitive tests
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          Short timed tests scored on both speed and correctness. Pick one category and compare a run
          against your own past attempts, never against anyone else.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[calc(max(2.5rem,env(safe-area-inset-bottom))+var(--tabbar-h))]">
        {COGNITIVE_CATEGORY_ORDER.map((id) => {
          const category = categories.find((c) => c.id === id);
          if (!category) return null;
          const last = category.last_attempt;
          return (
            <button
              key={id}
              type="button"
              onClick={() => chooseCategory(id)}
              disabled={!category.available}
              className="group flex items-start gap-4 rounded-lg border border-hairline bg-paper px-5 py-4 text-left transition-colors hover:border-ink disabled:opacity-50"
            >
              <span
                className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: TESTS_ACCENT }}
                aria-hidden="true"
              />
              <span className="flex flex-1 flex-col gap-1">
                <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
                  {category.label}
                </span>
                <span className="font-sans text-[14px] leading-relaxed text-muted">
                  {category.description}
                </span>
                {last ? (
                  <span className="mt-1 flex gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    <span>last {accuracyPct(last.score, last.question_count)}</span>
                    <span>
                      pace{" "}
                      {formatSeconds(
                        last.question_count ? last.total_time_ms / last.question_count : 0
                      )}
                    </span>
                  </span>
                ) : (
                  <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    not taken yet
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
