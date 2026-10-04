import { usePet } from "../../pet/PetContext";
import { MOOD_COPY, petLabel } from "../../pet/petModel";
import { PetAdoptForm } from "./PetAdoptForm";
import { PetArt } from "./PetArt";
import { PetStatBar } from "./PetStatBar";

// The profile screen's pet: the adopted companion with its stats, or the
// adoption picker when there is none yet. Local-only (api/pet.js), so it
// renders for guests and signed-in users alike.
export function PetCard() {
  const { pet, stats, mood, hidden, streak, adopt, hideCompanion, showCompanion } =
    usePet();

  if (!pet) return <AdoptPet onAdopt={adopt} />;

  return (
    <section className="rounded-lg border border-hairline bg-paper px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          your pet
        </p>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--accent-pet)" }}
        >
          {mood}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 bg-panel"
          style={{ borderColor: "var(--accent-pet)" }}
        >
          <PetArt
            type={pet.type}
            title={petLabel(pet.type)}
            mood={mood}
            className="h-16 w-16"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <p className="font-sans text-[16px] font-semibold tracking-tight text-ink">
              {pet.name}
            </p>
            <p className="font-sans text-[13px] leading-relaxed text-muted">
              {MOOD_COPY[mood](pet.name)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <StatRow label="hunger" value={stats.hunger} warning={50} danger={80} />
            <StatRow
              label="happiness"
              value={stats.happiness}
              warning={40}
              danger={20}
              inverse
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        <span>day streak {streak}</span>
        <span>{stats.cardsToday} slides today</span>
      </div>

      {/* Companion visibility. Hiding it keeps it off the reading screens;
          the pet and its stats stay right here. */}
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="font-sans text-[13px] leading-relaxed text-muted">
          Show on the reading screens
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={!hidden}
          aria-label="Show pet on the reading screens"
          onClick={() => (hidden ? showCompanion() : hideCompanion())}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
            hidden
              ? "border-hairline bg-panel"
              : "border-accent-complete bg-accent-complete"
          }`}
        >
          <span
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-paper transition-all ${
              hidden ? "left-1" : "left-[calc(100%-1.25rem)]"
            }`}
          />
        </button>
      </div>
    </section>
  );
}

function StatRow({ label, value, warning, danger, inverse }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <PetStatBar value={value} warning={warning} danger={danger} inverse={inverse} />
    </div>
  );
}

// The adoption picker, shown when there is no pet yet: the same form the
// first-run prompt uses.
function AdoptPet({ onAdopt }) {
  return (
    <section className="rounded-lg border border-hairline bg-paper px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        your pet
      </p>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
        Adopt a companion. It grows happier as you read and gets hungry when
        you go quiet.
      </p>

      <PetAdoptForm onAdopt={onAdopt} />
    </section>
  );
}
