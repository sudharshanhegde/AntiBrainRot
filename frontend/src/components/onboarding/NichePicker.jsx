import { niches } from "../../data/topics";

// Onboarding: the first-visit niche choice. Picking a niche sets the
// topic list that follows. Uses the same token system as the feed, not
// a separate visual language.
export function NichePicker({ onPick }) {
  return (
    <main className="screen-in h-dvh overflow-y-auto bg-paper">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          antibrainrot
        </p>
        <h1 className="mt-3 font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
          What do you build?
        </h1>
        <p className="mt-3 max-w-md font-sans text-[16px] leading-relaxed text-muted">
          Pick a lane. Your topic list follows from it, and each topic
          serves one deck of ten cards at a time.
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {niches.map((niche) => (
          <button
            key={niche.slug}
            type="button"
            onClick={() => onPick(niche.slug)}
            className="group flex flex-col gap-1 rounded-lg border border-hairline bg-paper px-5 py-4 text-left transition-colors hover:border-ink"
          >
            <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
              {niche.name}
            </span>
            <span className="font-sans text-[14px] leading-relaxed text-muted">
              {niche.description}
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {niche.topics.length} topics
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
