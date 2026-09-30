import { useState } from "react";
import { usePet } from "../../pet/PetContext";
import { MOOD_COPY, PET_TYPES, petLabel } from "../../pet/petModel";
import { PetArt } from "./PetArt";
import { PetStatBar } from "./PetStatBar";

// Primary action button, matching the profile screen's register language.
const PRIMARY_BTN =
  "w-full rounded-lg border border-accent-complete bg-accent-complete px-6 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

// The profile screen's pet: the adopted companion with its stats, or the
// adoption picker when there is none yet. Local-only (api/pet.js), so it
// renders for guests and signed-in users alike.
export function PetCard() {
  const { pet, stats, mood, adopt } = usePet();

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
            <StatRow label="tiredness" value={stats.sleep} warning={60} danger={85} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        <span>care streak {pet.streak}</span>
        <span>{stats.cardsToday} slides today</span>
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

// The adoption picker: choose one of the four animals the tamagotchi
// project ships artwork for, give it a name, and it is yours.
function AdoptPet({ onAdopt }) {
  const [type, setType] = useState(PET_TYPES[0]);
  const [name, setName] = useState("");

  return (
    <section className="rounded-lg border border-hairline bg-paper px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        your pet
      </p>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
        Adopt a companion. It grows happier as you read and gets hungry when
        you go quiet.
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {PET_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            aria-label={petLabel(t)}
            className="flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors"
            style={{
              borderColor:
                type === t ? "var(--accent-pet)" : "var(--color-hairline)",
            }}
          >
            <PetArt
              type={t}
              className="h-10 w-10"
              style={t === type ? undefined : { opacity: 0.5 }}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              {petLabel(t)}
            </span>
          </button>
        ))}
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={petLabel(type)}
          maxLength={24}
          className="rounded-lg border border-hairline bg-paper px-4 py-2.5 font-sans text-[15px] text-ink outline-none transition-colors focus:border-ink"
        />
      </label>

      <button
        type="button"
        onClick={() => onAdopt(type, name)}
        className={`${PRIMARY_BTN} mt-4`}
      >
        adopt
      </button>
    </section>
  );
}
