// First-visit gate: the one deliberate
// blocking moment in the app, shown only for genuinely first-time
// visitors (no active session and no existing guest id). Three equal
// choices, none visually subordinate: register, log in, or continue as a
// guest. The moment any choice is made a session or a local guest id
// exists, so this screen never appears again for that browser.
export function WelcomeGate({ onRegister, onLogin, onGuest }) {
  const equalBtn =
    "w-full rounded-lg border border-ink bg-paper px-6 py-3.5 font-sans text-[16px] font-semibold tracking-tight text-ink transition-colors hover:bg-ink hover:text-paper";

  return (
    <main className="screen-in flex h-dvh flex-col bg-paper px-6 pt-[max(4rem,env(safe-area-inset-top))]">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        antibrainrot
      </p>
      <h1 className="mt-4 max-w-md font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
        Learn, one card at a time.
      </h1>
      <p className="mt-3 max-w-md font-sans text-[16px] leading-relaxed text-muted">
        Short, dense lessons with a quiz on every concept. Pick a topic,
        swipe through a deck, and come back tomorrow for the next day.
      </p>

      <div className="mt-auto flex flex-col gap-3 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onRegister} className={equalBtn}>
          Register
        </button>
        <button type="button" onClick={onLogin} className={equalBtn}>
          Log in
        </button>
        <div className="my-1 flex items-center gap-3">
          <span className="h-px flex-1 bg-hairline" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            no account needed
          </span>
          <span className="h-px flex-1 bg-hairline" />
        </div>
        <button type="button" onClick={onGuest} className={equalBtn}>
          Continue without an account
        </button>
      </div>
    </main>
  );
}
