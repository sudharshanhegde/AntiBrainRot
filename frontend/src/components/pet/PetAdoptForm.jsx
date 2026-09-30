import { useState } from "react";
import { PET_TYPES, petLabel } from "../../pet/petModel";
import { PetArt } from "./PetArt";

// Primary action button, matching the profile screen's register language.
const PRIMARY_BTN =
  "w-full rounded-lg border border-accent-complete bg-accent-complete px-6 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

// The adoption picker shared by the profile card and the first-run
// prompt: choose one of the four animals, give it a name, adopt.
export function PetAdoptForm({ onAdopt }) {
  const [type, setType] = useState(PET_TYPES[0]);
  const [name, setName] = useState("");

  return (
    <>
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
    </>
  );
}
