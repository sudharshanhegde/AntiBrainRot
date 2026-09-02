import { useCallback, useEffect, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { useAuth } from "../../auth/AuthContext";
import { fetchAppliedJobs } from "../../api/jobsService";

const JOBS_ACCENT = "var(--accent-job)";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// Applications history screen.
//
// Shows every job the signed-in user has tapped Apply on — role + company +
// when they applied — so they always know what they applied for, even for
// postings that have since expired or been removed from the live feed. If the
// posting is still live, tapping re-opens the original apply URL.
export function ApplicationsScreen({ onBack, onOpenProfile = () => {} }) {
  const { user } = useAuth();
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setApps(await fetchAppliedJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load your applications");
      setApps([]);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user) {
    return (
      <StatusScreen
        label="sign in to see your applications"
        title="My applications"
        accent="job"
        onAction={onOpenProfile}
        actionLabel="go to profile"
      />
    );
  }
  if (error) {
    return (
      <StatusScreen
        label={error}
        title="My applications"
        accent="job"
        onAction={() => {
          setApps(null);
          load();
        }}
        actionLabel="try again"
      />
    );
  }
  if (!apps) {
    return <StatusScreen label="loading" title="My applications" accent="job" />;
  }
  if (apps.length === 0) {
    return (
      <StatusScreen
        label="no applications yet"
        title="You haven't applied to anything"
        accent="job"
        onAction={onBack}
        actionLabel="back"
      />
    );
  }

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
          My applications
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          Everything you've applied to, newest first.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {apps.map((a) => (
          <div key={a.job_id} className="rounded-lg border border-hairline bg-paper px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-sans text-[17px] font-semibold tracking-tight text-ink">{a.role}</p>
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: JOBS_ACCENT }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-0.5 font-sans text-[14px] text-muted">{a.company}</p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              applied {formatDate(a.applied_at)}
            </p>

            {a.job_existed === false && (
              <p className="mt-2 font-sans text-[13px] text-ink/70">
                You marked this one as no longer available.
              </p>
            )}

            {a.job_still_live && a.apply_url ? (
              <a
                href={a.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-lg bg-ink px-4 py-2 font-sans text-[13px] font-semibold text-paper"
              >
                View posting
              </a>
            ) : (
              <p className="mt-3 font-sans text-[13px] text-muted">No longer listed.</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
