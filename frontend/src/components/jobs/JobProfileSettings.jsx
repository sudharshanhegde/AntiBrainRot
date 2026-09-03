import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  fetchJobProfile,
  saveJobProfile,
} from "../../api/jobsService";

// Job matching settings on the Profile screen.
//
// The job-search questionnaire is stored on the user's record so it can be
// edited later (experience and graduation year both change over time), but
// once the Jobs tab first asks it there was no way to revisit it. This block
// surfaces the saved selections on the Profile page and lets the user edit
// them, so matching is never stuck on an outdated profile.

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

function educationText(j) {
  if (!j || !j.education_level) return "not set";
  const level = LEVEL_LABEL[j.education_level] || j.education_level;
  if (!j.education_completed) {
    return j.graduation_year ? `${level} · in progress (class of ${j.graduation_year})` : `${level} · in progress`;
  }
  return `${level} · completed`;
}

// The compact inline editor (reuses the same pills/inputs as the first-open
// questionnaire so the two feel consistent).
function Editor({ initial, onSave, onCancel }) {
  const [country, setCountry] = useState(initial?.country || "");
  const [years, setYears] = useState(initial ? String(initial.years_experience ?? "") : "");
  const [education, setEducation] = useState(initial?.education_level || "");
  const [completed, setCompleted] = useState(initial ? initial.education_completed !== false : true);
  const [gradYear, setGradYear] = useState(initial?.graduation_year ? String(initial.graduation_year) : "");
  const [internship, setInternship] = useState(Boolean(initial?.past_internship));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const currentYear = new Date().getFullYear();
  const gradYears = Array.from({ length: 6 }, (_, i) => currentYear + i);
  const valid =
    country && years !== "" && Number(years) >= 0 && education && (completed || gradYear !== "");

  const handleSave = async () => {
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

  const pill = (active) =>
    active
      ? "rounded-full border border-ink px-3 py-1.5 font-sans text-[13px] text-ink"
      : "rounded-full border border-hairline px-3 py-1.5 font-sans text-[13px] text-muted";

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Country</p>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map((c) => (
            <button key={c} type="button" onClick={() => setCountry(c)} className={pill(country === c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Years of experience</p>
        <input
          type="number"
          min="0"
          value={years}
          onChange={(e) => setYears(e.target.value)}
          placeholder="0 = no professional experience yet"
          className="rounded-lg border border-hairline bg-panel px-4 py-2.5 font-sans text-[15px] text-ink outline-none focus:border-ink"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Highest education</p>
        <div className="flex flex-wrap gap-2">
          {EDUCATION_LEVELS.map((e) => (
            <button key={e.value} type="button" onClick={() => setEducation(e.value)} className={pill(education === e.value)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Status</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCompleted(true)} className={pill(completed)}>
            Completed
          </button>
          <button type="button" onClick={() => setCompleted(false)} className={pill(!completed)}>
            In progress
          </button>
        </div>
      </div>

      {!completed && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Graduation year</p>
          <div className="flex flex-wrap gap-2">
            {gradYears.map((y) => (
              <button key={y} type="button" onClick={() => setGradYear(String(y))} className={pill(gradYear === String(y))}>
                {y}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Past internship</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setInternship(true)} className={pill(internship)}>
            Yes
          </button>
          <button type="button" onClick={() => setInternship(false)} className={pill(!internship)}>
            No
          </button>
        </div>
      </div>

      {error && <p className="font-sans text-[14px] text-ink/80">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!valid || saving}
          className="rounded-lg bg-ink px-4 py-2.5 font-sans text-[14px] font-semibold text-paper disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-hairline px-4 py-2.5 font-sans text-[14px] font-medium text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function JobProfileSettings() {
  const { user } = useAuth();
  const [job, setJob] = useState(undefined); // undefined = loading, null = not set
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = await fetchJobProfile();
      setJob(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load job profile");
      setJob(null);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const handleSave = useCallback(
    async (payload) => {
      const saved = await saveJobProfile(payload);
      setJob(saved);
      setEditing(false);
    },
    []
  );

  return (
    <section className="rounded-lg border border-hairline bg-paper px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">job matching</p>
        <span
          className="inline-block h-2 w-2 rounded-[2px]"
          style={{ backgroundColor: "var(--accent-job)" }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
        Filters which roles appear in Jobs. Change these anytime you start looking for something different and your matches refresh.
      </p>

      {error && job === null && (
        <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink/80">{error}</p>
      )}

      {!editing && job && (
        <dl className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">field</dt>
            <dd className="text-right font-sans text-[14px] text-ink">{FIELD_LABEL}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">country</dt>
            <dd className="text-right font-sans text-[14px] text-ink">{job.country || "not set"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">experience</dt>
            <dd className="text-right font-sans text-[14px] text-ink">
              {job.years_experience ?? 0} {job.years_experience === 1 ? "year" : "years"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">education</dt>
            <dd className="text-right font-sans text-[14px] text-ink">{educationText(job)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">past internship</dt>
            <dd className="text-right font-sans text-[14px] text-ink">{job.past_internship ? "Yes" : "No"}</dd>
          </div>
        </dl>
      )}

      {!editing && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          className="mt-4 w-full rounded-lg bg-ink px-4 py-2.5 font-sans text-[14px] font-semibold text-paper"
        >
          {job ? "Edit job profile" : "Set up job profile"}
        </button>
      )}

      {editing && <Editor initial={job} onSave={handleSave} onCancel={() => setEditing(false)} />}
    </section>
  );
}
