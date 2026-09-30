import { usePet } from "../../pet/PetContext";
import { PetAdoptForm } from "./PetAdoptForm";

// The one-time invitation to adopt a pet, shown to every user who has not
// adopted and has not dismissed it yet. Declining is non-destructive: the
// Profile page's pet card still offers adoption at any time, and the
// prompt is never shown again for this browser.
export function PetPrompt() {
  const { shouldPrompt, adopt, dismissPrompt } = usePet();

  if (!shouldPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your pet"
        className="w-full max-w-sm rounded-lg border border-hairline bg-paper p-6 shadow-lg"
      >
        <h2 className="font-sans text-xl font-semibold tracking-tight text-ink">
          Pick a reading buddy
        </h2>
        <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted">
          Your pet grows happier every time you read and gets hungry when you
          go quiet. Choose one now, or set it up later on your profile.
        </p>

        <PetAdoptForm onAdopt={adopt} />

        <button
          type="button"
          onClick={dismissPrompt}
          className="mt-3 w-full font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
        >
          maybe later
        </button>
      </div>
    </div>
  );
}
