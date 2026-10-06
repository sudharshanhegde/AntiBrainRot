import { useEffect, useState } from "react";
import { usePet } from "../../pet/PetContext";
import { MOOD_COPY, petLabel } from "../../pet/petModel";
import { PetArt } from "./PetArt";
import { PetStatBar } from "./PetStatBar";

// The ring/dot colour tracks the mood: the pet accent when all is well,
// the flame tone when the pet is hungry or sick.
const MOOD_COLOR = {
  happy: "var(--accent-pet)",
  content: "var(--accent-pet)",
  hungry: "var(--accent-flame)",
  sick: "var(--accent-flame)",
};

// The small floating pet shown on the swipe feeds. Tapping it expands a
// compact panel with the pet's name, a mood line, and its stats. It never
// covers the card body, and renders nothing until a pet is adopted.
export function PetCompanion() {
  const { pet, stats, mood, hidden, surfaceAllows, feedEvent, hideCompanion } =
    usePet();
  const [open, setOpen] = useState(false);

  if (!pet || hidden || !surfaceAllows) return null;
  const color = MOOD_COLOR[mood] || "var(--accent-pet)";

  return (
    <div className="pet-companion">
      {open && (
        <div className="w-64 rounded-lg border border-hairline bg-paper px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[14px] font-semibold tracking-tight text-ink">
              {pet.name}
            </span>
            <span
              className="font-mono text-[9px] uppercase tracking-[0.14em]"
              style={{ color }}
            >
              {mood}
            </span>
          </div>
          <p className="mt-1 font-sans text-[12px] leading-relaxed text-muted">
            {MOOD_COPY[mood](pet.name)}
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            <PetStatBar value={stats.hunger} warning={50} danger={80} />
            <PetStatBar
              value={stats.happiness}
              warning={40}
              danger={20}
              inverse
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={hideCompanion}
          aria-label={`Hide ${pet.name} while reading`}
          title="Hide while reading"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline bg-paper text-muted shadow-sm transition-colors hover:text-ink"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${pet.name}, ${mood}`}
          className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-panel shadow-md transition-transform hover:scale-105 ${
            feedEvent ? "pet-celebrate" : ""
          }`}
          style={{ borderColor: color }}
        >
          <PetArt
            type={pet.type}
            title={petLabel(pet.type)}
            mood={mood}
            className="h-11 w-11"
          />
        </button>
      </div>
    </div>
  );
}

// The "you fed me" note, raised by PetContext every fifth slide read on
// the feeds. The pet appears oversized (uncropped, so it reads as the
// animal itself rather than a thumbnail) with its line as a spoken aside,
// more of a character beat than a system notification. Auto-dismisses,
// tappable to dismiss early, and never blocks the scroll behind it.
export function PetToast() {
  const { feedEvent, dismissFeedEvent, pet, mood, surfaceAllows } = usePet();

  useEffect(() => {
    if (!feedEvent) return;
    const t = setTimeout(dismissFeedEvent, 5000);
    return () => clearTimeout(t);
  }, [feedEvent, dismissFeedEvent]);

  if (!feedEvent || !pet || !surfaceAllows) return null;

  return (
    <div className="pet-toast" role="status" aria-live="polite">
      <div className="flex items-end gap-3 rounded-2xl border border-hairline bg-paper px-4 py-3 shadow-xl">
        <PetArt
          type={pet.type}
          title={petLabel(pet.type)}
          mood={mood}
          className="h-28 w-28 shrink-0"
        />
        <div className="min-w-0 pb-1">
          <p className="font-sans text-[14px] leading-snug text-ink">
            {feedEvent.message}
          </p>
          <button
            type="button"
            onClick={dismissFeedEvent}
            className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            keep going
          </button>
        </div>
      </div>
    </div>
  );
}
