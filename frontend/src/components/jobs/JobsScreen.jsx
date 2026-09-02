import { useCallback, useEffect, useRef, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { AppMenu } from "../ui/AppMenu";
import { useAuth } from "../../auth/AuthContext";
import { useSwipeExit } from "../../hooks/useSwipeExit";
import { useTheme } from "../../hooks/useTheme";
import {
  fetchJobProfile,
  saveJobProfile,
  fetchJobs,
  applyToJob,
  fetchPendingApplications,
  submitApplicationFeedback,
} from "../../api/jobsService";

// The Jobs screen.
//
// A separate section from the topic decks, Quick Bites, and Worth a Read,
// surfacing scraped job listings filtered against the user's job-search
// profile and shown in the same scroll-snap feed used elsewhere. Because
// matching depends on the signed-in user's profile, this section requires an
// account. The first time it is opened the user answers a short
// questionnaire (country, experience, education, graduation year), which is
// stored on the users record so it can be updated later; only then is the
// matched feed shown.
//
// Each card shows the role, company, location, any target graduation year,
// the experience/education paths, and the raw requirement text, with an
// apply action that records the application before opening the original URL.
const JOBS_ACCENT = "var(--accent-job)";

const FIELD_LABEL = "Computer Science & Technology";

const COUNTRIES = [
  "India",
  "United States",
  "Canada",
  "United Kingdom",
  "United Arab Emirates",
  "Singapore",
  "Germany",
  "Netherlands",
  "Australia",
];

const EDUCATION_LEVELS = [
  { value: "bachelor", label: "Bachelor's" },
  { value: "master", label: "Master's" },
  { value: "phd", label: "PhD" },
];

const LEVEL_LABEL = {
  associate: "Associate's",
  bachelor: "Bachelor's",
  master: "Master's",
  phd: "PhD",
};

// Builds a human "Bachelor's + 2 years, or Master's + 0" string from the
// job's qualification paths, so the user sees exactly what they must meet.
function describePaths(paths) {
  if (!paths || paths.length === 0) return "Requirements not stated.";
  return paths
    .map((p) => {
      const level = LEVEL_LABEL[p.education_level] || p.education_level;
      const min = Number(p.min_experience_years) || 0;
      const max = p.max_experience_years == null ? null : Number(p.max_experience_years);
      const exp =
        max == null
          ? `${min}+ years`
          : min === max
            ? `${min} year${min === 1 ? "" : "s"}`
            : `${min}-${max} years`;
      return `${level} + ${exp}`;
    })
    .join(", or ");
}

// --- First-open questionnaire -------------------------------------------
function JobProfileForm({ onSave, onBack }) {
  const [country, setCountry] = useState("");
  const [years, setYears] = useState("");
  const [education, setEducation] = useState("");
  const [completed, setCompleted] = useState(true);
  const [gradYear, setGradYear] = useState("");
  const [internship, setInternship] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const currentYear = new Date().getFullYear();
  const gradYears = Array.from({ length: 6 }, (_, i) => currentYear + i);

  const valid =
    country &&
    years !== "" &&
    Number(years) >= 0 &&
    education &&
    (completed || gradYear !== "");

  const handleSubmit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        country,
        years_experience: Number(years),
        education_level: education,
        education_completed: completed,
        graduation_year: completed ? null : Number(gradYear),
        past_internship: internship,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
      setSaving(false);
    }
  };

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
            go back
          </button>
        </div>
        <h1
          className="mt-3 font-sans text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: JOBS_ACCENT }}
        >
          Set up job matching
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          Answer once so we only surface roles you actually qualify for. You can edit these later.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-5 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Field of interest</p>
          <button
            type="button"
            className="rounded-lg border border-hairline bg-panel px-4 py-3 text-left font-sans text-[15px] font-medium text-ink"
          >
            {FIELD_LABEL}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Country</p>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountry(c)}
                className={
                  country === c
                    ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
                    : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted"
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Years of experience</p>
          <input
            type="number"
            min="0"
            value={years}
            onChange={(e) => setYears(e.target.value)}
            placeholder="0 = no professional experience yet"
            className="rounded-lg border border-hairline bg-panel px-4 py-3 font-sans text-[15px] text-ink outline-none focus:border-ink"
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Highest education</p>
          <div className="flex flex-wrap gap-2">
            {EDUCATION_LEVELS.map((e) => (
              <button
                key={e.value}
                type="button"
                onClick={() => setEducation(e.value)}
                className={
                  education === e.value
                    ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
                    : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted"
                }
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Status</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCompleted(true)}
              className={
                completed
                  ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
                  : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted"
              }
            >
              Completed
            </button>
            <button
              type="button"
              onClick={() => setCompleted(false)}
              className={
                !completed
                  ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
                  : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted"
              }
            >
              In progress
            </button>
          </div>
        </div>

        {!completed && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Graduation year</p>
            <div className="flex flex-wrap gap-2">
              {gradYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setGradYear(String(y))}
                  className={
                    gradYear === String(y)
                      ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
                      : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted"
                  }
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Past internship experience</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setInternship(true)}
              className={
                internship
                  ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
                  : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted"
              }
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setInternship(false)}
              className={
                !internship
                  ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
                  : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted"
              }
            >
              No
            </button>
          </div>
        </div>

        {error && <p className="font-sans text-[14px] text-ink/80">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!valid || saving}
          className="mt-2 rounded-lg border border-ink bg-ink px-5 py-3 text-center font-sans text-[15px] font-semibold text-paper disabled:opacity-40"
        >
          {saving ? "Saving…" : "Show me matching jobs"}
        </button>
      </div>
    </main>
  );
}

// --- A single job card in the feed --------------------------------------
function JobCard({ job, index, onApply, onBack, onOpenProfile }) {
  const { theme, toggleTheme } = useTheme();
  const gradYear = job.target_grad_year
    ? `${job.target_grad_year} graduate target`
    : "open to experienced hires";
  const location = job.is_remote
    ? job.remote_restricted_to
      ? `Remote · ${job.remote_restricted_to}`
      : "Remote · worldwide"
    : job.location || job.location_country || "Location unknown";

  return (
    <article className="feed-card flex flex-col" aria-label={`Job ${index + 1}`}>
      <header className="shrink-0 px-5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex items-center justify-between">
          <AppMenu
            entries={[
              { label: "Profile", onSelect: onOpenProfile },
              { label: "Topics", onSelect: onBack },
              { label: theme === "dark" ? "Dark mode: on" : "Dark mode: off", onSelect: toggleTheme },
            ]}
          />
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[13px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            go back
          </button>
        </div>
        <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.14em]">
          <span className="text-muted">jobs</span>
          <span className="flex items-center gap-2" style={{ color: JOBS_ACCENT }}>
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: JOBS_ACCENT }}
              aria-hidden="true"
            />
            {job.company}
          </span>
        </div>
        <div className="mt-2 h-px bg-hairline" />
      </header>

      <div className="card-body min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
        <h2 className="font-sans text-2xl font-semibold leading-tight tracking-tight text-ink">{job.role}</h2>
        <p className="mt-1 font-sans text-[15px] text-muted">{job.company}</p>

        <div className="mt-4 flex flex-col gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          <p>{location}</p>
          <p>{gradYear}</p>
          <p>Required: {describePaths(job.qualification_paths)}</p>
        </div>

        <div className="my-4 h-px bg-hairline" />

        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Requirements</p>
        <p className="mt-2 whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ink/90">
          {job.raw_requirements_text || "No requirement text supplied with this posting."}
        </p>
      </div>

      <footer className="shrink-0 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="h-px bg-hairline" />
        <div className="mt-3 flex items-center justify-between gap-3">
          {job.applied ? (
            <span className="font-sans text-[14px] font-semibold" style={{ color: JOBS_ACCENT }}>
              Applied ✓
            </span>
          ) : (
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onApply(job)}
              className="rounded-lg bg-ink px-4 py-2.5 text-center font-sans text-[14px] font-semibold text-paper"
            >
              Apply
            </a>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">swipe</span>
        </div>
      </footer>
    </article>
  );
}

// --- "Did this job still exist?" verifier ---------------------------------
// Shown on returning to the Jobs tab, before the feed, for every application
// the user has tapped Apply on but not yet answered. Each row is a Yes/No
// question about whether that job actually existed and let them apply. The
// answers feed the stale-posting signal and are inspectable directly. Any
// item left unanswered is kept for the next visit.
function ApplicationVerifier({ items, onAnswer, onSkip, onBack }) {
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
            go back
          </button>
        </div>
        <h1 className="mt-3 font-sans text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: JOBS_ACCENT }}>
          Did these jobs still exist?
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          One quick check on the roles you applied to. It keeps stale listings out of the feed for everyone.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {items.map((item) => (
          <div key={item.job_id} className="rounded-lg border border-hairline bg-paper px-5 py-4">
            <p className="font-sans text-[17px] font-semibold tracking-tight text-ink">{item.role}</p>
            <p className="mt-0.5 font-sans text-[14px] text-muted">{item.company}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Could you apply?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onAnswer(item, true)}
                  className="rounded-lg border border-ink px-4 py-1.5 font-sans text-[13px] font-semibold text-ink"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => onAnswer(item, false)}
                  className="rounded-lg border border-hairline px-4 py-1.5 font-sans text-[13px] font-semibold text-muted transition-colors hover:border-ink"
                >
                  No
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onSkip}
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
        >
          skip for now
        </button>
      </div>
    </main>
  );
}

// --- Main screen ---------------------------------------------------------
export function JobsScreen({ onBack, onOpenProfile = () => {} }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(undefined); // undefined = loading
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState(null);
  const [empty, setEmpty] = useState(false);
  // Pending "did this job still exist?" applications (null = not yet loaded).
  const [pending, setPending] = useState(null);
  const [verifyDone, setVerifyDone] = useState(false);
  const scrollRef = useRef(null);

  useSwipeExit(scrollRef, onBack);

  const loadJobs = useCallback(async () => {
    setError(null);
    setEmpty(false);
    try {
      const data = await fetchJobs();
      if (data.status === "needs_profile") {
        setProfile(null);
        return;
      }
      setJobs(data.jobs || []);
      setEmpty((data.jobs || []).length === 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load the jobs feed");
    }
  }, []);

  // Load the job profile once the user is known; re-run if the identity
  // changes (e.g. after sign-in) while this screen is open.
  useEffect(() => {
    if (!user) return;
    let active = true;
    setProfile(undefined);
    setError(null);
    fetchJobProfile()
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch(() => {
        if (active) setError("could not load your job profile");
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Once a profile is known (non-null), load the matched feed.
  useEffect(() => {
    if (profile !== null && profile !== undefined) {
      loadJobs();
    }
  }, [profile, loadJobs]);

  // After the questionnaire saves, the profile becomes truthy and the effect
  // above loads the feed.
  const handleSaved = useCallback(async () => {
    setProfile({});
  }, []);

  const handleApply = useCallback(async (job) => {
    if (job.applied) return;
    try {
      const url = await applyToJob(job.id);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, applied: true } : j)));
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.warn("could not record application", err);
    }
  }, []);

  // Once a profile is known, fetch the applications that still need the
  // "did this job still exist?" answer, so it can be asked before the feed.
  useEffect(() => {
    if (!user || profile === null || profile === undefined) return;
    let active = true;
    setVerifyDone(false);
    setPending(null);
    fetchPendingApplications()
      .then((list) => {
        if (active) setPending(list);
      })
      .catch(() => {
        // Never block the feed because the check could not load.
        if (active) setPending([]);
      });
    return () => {
      active = false;
    };
  }, [user, profile]);

  // Records a Yes/No answer and removes the application from the pending set.
  const handleAnswer = useCallback(async (item, existed) => {
    try {
      await submitApplicationFeedback(item.job_id, existed);
      setPending((prev) => (prev || []).filter((p) => p.job_id !== item.job_id));
    } catch (err) {
      console.warn("could not save application feedback", err);
    }
  }, []);

  // Needs an account: matching is personal.
  if (!user) {
    return (
      <StatusScreen
        label="jobs need an account"
        title="Sign in to see matching roles"
        accent="job"
        onAction={onOpenProfile}
        actionLabel="go to profile"
      />
    );
  }

  if (profile === undefined && !error) {
    return <StatusScreen label="loading jobs" title="jobs" accent="job" />;
  }
  if (profile === undefined && error) {
    return (
      <StatusScreen
        label={error}
        title="jobs"
        accent="job"
        onAction={() => {
          setError(null);
          setProfile(undefined);
          fetchJobProfile()
            .then(setProfile)
            .catch(() => setError("could not load your job profile"));
        }}
        actionLabel="try again"
      />
    );
  }
  if (profile === null) {
    return <JobProfileForm onSave={handleSaved} onBack={onBack} />;
  }

  // Pending "did this job still exist?" checks are asked before the feed so
  // a returning user validates past applications while they are fresh.
  if (pending === null) {
    return <StatusScreen label="loading jobs" title="jobs" accent="job" />;
  }
  if (pending.length > 0 && !verifyDone) {
    return (
      <ApplicationVerifier
        items={pending}
        onAnswer={handleAnswer}
        onSkip={() => setVerifyDone(true)}
        onBack={onBack}
      />
    );
  }

  if (error) {
    return (
      <StatusScreen label={error} title="jobs" accent="job" onAction={loadJobs} actionLabel="try again" />
    );
  }
  if (empty) {
    return (
      <StatusScreen
        label="no jobs match your profile right now"
        title="Nothing to show at the moment"
        accent="job"
        onAction={onBack}
        actionLabel="back to topics"
      />
    );
  }

  return (
    <div ref={scrollRef} className="feed-scroll" role="region" aria-label="Jobs">
      {jobs.map((job, i) => (
        <JobCard
          key={job.id}
          job={job}
          index={i}
          onApply={handleApply}
          onBack={onBack}
          onOpenProfile={onOpenProfile}
        />
      ))}
    </div>
  );
}
