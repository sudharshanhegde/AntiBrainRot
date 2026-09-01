import { useEffect, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { fetchWorthARead } from "../../api/worthAReadService";

// The Worth a Read list screen.
//
// A curated list of links worth reading, deliberately a plain list of rows
// in the same token system as the day tracker and topic picker — none of
// the swipeable-card mechanics applies here. Each entry is one compact
// block: a title and an optional note on why it is worth reading, nothing
// else. Tapping anywhere on the block opens the link in a new tab. The
// backend returns entries newest-first, so what was just added surfaces at
// the top.
const READ_ACCENT = "var(--accent-read)";

export function WorthAReadList({ onBack }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchWorthARead()
      .then((list) => {
        if (active) setEntries(list);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <StatusScreen
        label="could not load the list"
        title="Worth a Read"
        accent="read"
        onAction={onBack}
        actionLabel="back to topics"
      />
    );
  }
  if (!entries) {
    return <StatusScreen label="loading" title="Worth a Read" accent="read" />;
  }
  if (entries.length === 0) {
    return (
      <StatusScreen
        label="nothing here yet"
        title="Come back soon"
        accent="read"
        onAction={onBack}
        actionLabel="back to topics"
      />
    );
  }

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
            go back
          </button>
        </div>
        <h1
          className="mt-3 font-sans text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: READ_ACCENT }}
        >
          Worth a Read
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          A running list of things worth reading. Tap any entry to open it.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {entries.map((entry) => (
          <a
            key={entry.id}
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-4 rounded-lg border border-hairline bg-paper px-5 py-4 text-left transition-colors hover:border-ink"
          >
            <span
              className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: READ_ACCENT }}
              aria-hidden="true"
            />
            <span className="flex flex-col gap-1">
              <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
                {entry.title}
              </span>
              {entry.note && (
                <span className="font-sans text-[14px] leading-relaxed text-muted">
                  {entry.note}
                </span>
              )}
            </span>
          </a>
        ))}
      </div>
    </main>
  );
}
