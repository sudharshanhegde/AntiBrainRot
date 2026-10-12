import { AuthIntro } from "../profile/AuthIntro";

export function WelcomeGate({ onRegister, onLogin, onGuest }) {
  const primaryBtn =
    "w-full rounded-lg bg-ink px-6 py-3.5 font-sans text-[16px] font-semibold tracking-tight text-paper transition-opacity hover:opacity-90";
  const secondaryBtn =
    "w-full rounded-lg border border-ink bg-paper px-6 py-3.5 font-sans text-[16px] font-semibold tracking-tight text-ink transition-colors hover:bg-ink hover:text-paper";

  const features = [
    { label: "Quick Bites", detail: "One idea at a time, swiped in seconds." },
    { label: "Subject Decks", detail: "Ten cards a day, each ending in a quiz." },
    { label: "Timed Tests", detail: "Recall under pressure, tracked over time." },
    { label: "Job Board", detail: "Postings picked for you, and every application." },
  ];

  return (
    <main className="screen-in min-h-dvh overflow-y-auto bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-10">
        <header className="flex items-center gap-3">
          <img
            src="/brand/logo.png"
            alt="antibrainrot"
            className="h-11 w-11 rounded-lg object-contain"
          />
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
            antibrainrot
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-12 py-12 lg:flex-row lg:items-center lg:gap-16">
          <section className="flex-1">
            <h1 className="font-sans text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
              Learn CS, test yourself, and find your next job.
            </h1>
            <p className="mt-5 max-w-xl font-sans text-[17px] leading-relaxed text-muted">
              Short lessons, day-by-day subject decks with a quiz on every
              concept, timed recall tests, and a job board that keeps track of
              every application you send.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <div
                  key={feature.label}
                  className="rounded-lg border border-hairline bg-panel px-4 py-3"
                >
                  <p className="font-sans text-[15px] font-semibold tracking-tight text-ink">
                    {feature.label}
                  </p>
                  <p className="mt-1 font-sans text-[13px] leading-relaxed text-muted">
                    {feature.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <AuthIntro framed={false} showOverview={false} />
            </div>
          </section>

          <section className="w-full lg:max-w-sm">
            <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-paper p-6">
              <h2 className="font-sans text-xl font-semibold tracking-tight text-ink">
                Get started
              </h2>
              <p className="font-sans text-[14px] leading-relaxed text-muted">
                Create an account to save your progress across devices, or jump
                straight in without one.
              </p>
              <button type="button" onClick={onRegister} className={primaryBtn}>
                Create an account
              </button>
              <button type="button" onClick={onLogin} className={secondaryBtn}>
                Log in
              </button>
              <div className="my-1 flex items-center gap-3">
                <span className="h-px flex-1 bg-hairline" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  no account needed
                </span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <button
                type="button"
                onClick={onGuest}
                className="w-full rounded-lg px-6 py-3 font-sans text-[15px] font-medium tracking-tight text-ink underline-offset-4 transition-opacity hover:underline hover:opacity-70"
              >
                Continue without an account
              </button>
            </div>
          </section>
        </div>

        <footer className="border-t border-hairline pt-5">
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            No premium, no paywall, no money at any point. Your data stays
            yours.
          </p>
        </footer>
      </div>
    </main>
  );
}
