// A short, honest explainer for the sign-in and sign-up surfaces: what the
// app is, the little an account is actually needed for, and the reassurances
// that matter before someone hands over an email. Deliberately plain and
// brief, in the creator's own voice, rather than a feature list or a pitch.
//
// Framed on the signed-out profile page (next to the forms); borderless on
// the first-visit gate, so it drops into that screen's minimal layout
// instead of reading as a boxed-off panel.

export function AuthIntro({ framed = true, showOverview = true }) {
  return (
    <section
      className={framed ? "rounded-lg border border-hairline bg-panel px-5 py-4" : ""}
    >
      {framed && (
        <h2 className="font-sans text-lg font-semibold tracking-tight text-ink">
          Do you need an account?
        </h2>
      )}
      <div
        className={`flex flex-col gap-3 font-sans text-[14px] leading-relaxed text-muted ${
          framed ? "mt-2" : ""
        }`}
      >
        {showOverview && (
          <p>
            antibrainrot is a small study app: quick bites for one idea at a
            time, timed tests, and subject decks you work through a day at a
            time, each ending in a quiz. None of that needs an account.
          </p>
        )}
        <p>
          An account is only for the jobs side: postings picked for you, and a
          list of what you've applied to. It also keeps your progress, streak,
          and leaderboard spot saved across devices.
        </p>
        <p>
          No premium and no paywall, no money at any point, and your data
          isn't sold. I built this to help myself study, and I'm sharing it
          because it turned out useful.
        </p>
      </div>
    </section>
  );
}
