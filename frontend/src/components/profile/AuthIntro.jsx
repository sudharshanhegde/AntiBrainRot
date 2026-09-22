// Plain-language explainer for the sign-up / sign-in surfaces: what the
// app actually is, the two things an account is genuinely needed for, and
// the reassurances that matter before someone hands over an email (no
// premium, no paywall, no data farming). It is deliberately explicit that
// everything learning-related stays open without an account, so choosing
// "continue as guest" never feels like a downgrade.
//
// Rendered on the signed-out profile page (framed, alongside the forms) and
// on the first-visit gate (borderless, so it slots into that screen's
// deliberately minimal layout without introducing a new visual block).

const REASONS = [
  {
    label: "Jobs",
    text: "See postings matched to you and track every application in one place.",
  },
  {
    label: "Saved progress",
    text: "Streaks, finished days, and quiz history across your devices, plus the leaderboard if you opt in.",
  },
];

export function AuthIntro({ framed = true }) {
  const shell = framed
    ? "rounded-lg border border-hairline bg-panel px-5 py-4"
    : "";
  return (
    <section className={shell}>
      <h2 className="font-sans text-lg font-semibold tracking-tight text-ink">
        Why an account?
      </h2>
      <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted">
        antibrainrot is a small place to learn computer science. Quick Bites
        give you one idea per card, the Tests tab times your recall, and
        Subjects hold full multi-day decks, each day ending in a quiz.
      </p>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        an account is only needed for
      </p>
      <ul className="mt-2 flex flex-col gap-3">
        {REASONS.map((reason) => (
          <li key={reason.label} className="flex flex-col gap-0.5">
            <span className="font-sans text-[15px] font-semibold tracking-tight text-ink">
              {reason.label}
            </span>
            <span className="font-sans text-[13px] leading-relaxed text-muted">
              {reason.text}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 font-sans text-[13px] leading-relaxed text-ink/90">
        There is no premium and no paywall. You will never be asked for money,
        and your data is not sold or farmed. The account exists only so your
        progress and applications can be saved.
      </p>
      <p className="mt-3 font-sans text-[13px] leading-relaxed text-muted">
        Not ready? Quick Bites, Tests, and reading the subjects all work
        without an account. Register only for Jobs and saved progress.
      </p>
      <p className="mt-3 font-sans text-[13px] leading-relaxed text-muted">
        This started as a tool to help me learn. It turned out useful enough to
        share, so here it is. If it helps you too, that is thanks enough.
      </p>
    </section>
  );
}
