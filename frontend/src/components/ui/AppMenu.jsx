import { useState } from "react";

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Persistent hamburger menu in the app's top chrome: a single icon
// button that opens a slide-in sheet with a
// list of entries, at minimum "Profile". Reused across screens so the
// chrome stays consistent; the sheet is styled like the days drawer, not
// a new visual language. The menu closes before an entry's action runs.
export function AppMenu({ entries = [] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 p-1 text-muted transition-colors hover:text-ink"
      >
        <HamburgerIcon />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            className="h-full w-full bg-ink/40"
            onClick={close}
            aria-label="Close menu"
          />
          <div className="flex h-full w-[72%] max-w-xs flex-col border-l border-hairline bg-paper shadow-lg">
            <div className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
              <h2 className="font-sans text-lg font-semibold tracking-tight text-ink">
                Menu
              </h2>
              <button
                type="button"
                onClick={close}
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
              >
                close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <button
                    key={entry.label}
                    type="button"
                    onClick={() => {
                      close();
                      entry.onSelect();
                    }}
                    className="rounded-lg border border-hairline px-4 py-3 text-left font-sans text-[15px] font-medium tracking-tight text-ink transition-colors hover:border-ink"
                  >
                    {entry.label}
                  </button>
                ))}
                {entries.length === 0 && (
                  <p className="font-sans text-[14px] leading-relaxed text-muted">
                    Nothing here yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
