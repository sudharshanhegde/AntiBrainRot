import { useEffect, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { StreakIndicator } from "../ui/StreakIndicator";
import { findNiche, topicPalette } from "../../data/topics";
import { fetchTopics } from "../../api/feedService";
import { fetchCooldownMap } from "../../api/progress";
import { useAuth } from "../../auth/AuthContext";

// Topic picker for the chosen niche, laid out as a ledger rather than a
// stack of identical boxes:
//   - a streak strip carrying the day streak (left) and the Leaderboard
//     entry (right),
//   - a Worth a Read aside, visually separate from the lesson list,
//   - the subjects themselves as one bordered table with hairline row
//     dividers, each row a full-height accent rail, the topic's mono short
//     code, its name and blurb, and a register-style day counter.
// The accent is used sparingly per row (the rail and the short code), so a
// topic keeps its colour association without every name shouting at once.
// There is no cooldown: tapping a topic always opens its next deck, and
// the day tracker lets the user jump to any published day freely.
export function TopicList({
  nicheSlug,
  onPick,
  onChangeNiche,
  onOpenLeaderboard,
  onOpenProfile,
  onOpenQuickBites,
  onOpenWorthARead,
  onOpenJobs,
  notice,
  onDismissNotice,
}) {
  const niche = findNiche(nicheSlug);
  const { user, streak, refreshProfile } = useAuth();
  const [topicSlugs, setTopicSlugs] = useState(null);
  const [cooldowns, setCooldowns] = useState(new Map());

  useEffect(() => {
    let active = true;
    setTopicSlugs(null);

    fetchTopics(nicheSlug)
      .then((slugs) => {
        if (active) setTopicSlugs(slugs);
      })
      .catch(() => {
        if (active) setTopicSlugs([]);
      });

    fetchCooldownMap()
      .then((map) => {
        if (active) setCooldowns(map);
      })
      .catch(() => {
        if (active) setCooldowns(new Map());
      });

    // Refresh the streak from the backend: the user may have just
    // finished a deck and navigated back here. Only when signed in —
    // anonymous browsers have no account-scoped streak to fetch.
    if (user) refreshProfile();

    return () => {
      active = false;
    };
  }, [nicheSlug, refreshProfile, user]);

  if (!niche) {
    // A brand-new user lands on Quick Bites first, so the Subjects tab can
    // be opened before any niche is chosen. Offer
    // a way to pick one instead of a dead end.
    return (
      <StatusScreen
        label="no subjects yet"
        title="Pick a subject to get started"
        onAction={onChangeNiche}
        actionLabel="choose a subject"
      />
    );
  }
  if (!topicSlugs) {
    return <StatusScreen label="loading topics" title={niche.name} />;
  }

  const topicCount = topicSlugs.filter((s) => topicPalette[s]).length;

  return (
    <main className="screen-in h-dvh overflow-y-auto bg-paper pb-[calc(max(2.5rem,env(safe-area-inset-bottom))+var(--tabbar-h))]">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            antibrainrot
          </p>
          <button
            type="button"
            onClick={onChangeNiche}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            change niche
          </button>
        </div>
        <h1 className="mt-3 font-sans text-2xl font-semibold tracking-tight sm:text-3xl">
          {niche.name}
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          {niche.description}
        </p>
      </header>

      {/* Streak strip: the day streak on the left, the Leaderboard entry on
          the right. A single hairline box so the two read as one bar. */}
      <div className="mx-6 mt-5 flex items-center justify-between gap-5 rounded-lg border border-hairline bg-panel px-5 py-3.5">
        <span className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            current streak
          </span>
          <StreakIndicator
            count={user ? streak?.current_streak ?? 0 : null}
            label="day streak"
          />
        </span>
        <button
          type="button"
          onClick={onOpenLeaderboard}
          className="group flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
        >
          leaderboard
          <Chevron />
        </button>
      </div>

      {notice && (
        <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-lg border border-hairline bg-panel px-4 py-3">
          <p className="font-sans text-[14px] leading-relaxed text-ink/90">
            {notice}
          </p>
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Dismiss notice"
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            close
          </button>
        </div>
      )}

      {/* Worth a Read is the one non-tab destination left on this screen:
          a curated list of links worth reading, framed honestly as the
          thing to open when you want to go deeper rather than as another
          lesson. Quick Bites and Jobs live on the bottom bar now. */}
      <section className="mt-7 px-6">
        <SectionLabel>worth a read</SectionLabel>
        <button
          type="button"
          onClick={onOpenWorthARead}
          className="group mt-3 flex w-full items-center gap-4 overflow-hidden rounded-lg border border-hairline bg-panel px-0 py-0 text-left transition-colors hover:border-ink"
        >
          <span
            className="w-[3px] shrink-0 self-stretch"
            style={{ backgroundColor: "var(--accent-read)" }}
            aria-hidden="true"
          />
          <span className="flex flex-1 flex-col gap-1 py-4 pr-5">
            <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
              Worth a Read
            </span>
            <span className="font-sans text-[14px] leading-relaxed text-muted">
              Curated links worth your time.
            </span>
          </span>
          <span className="pr-5 text-muted transition-colors group-hover:text-ink">
            <Chevron />
          </span>
        </button>
      </section>

      {/* The subjects, as one table. Rows are separated by hairlines inside
          a single border, so the list reads as a register instead of a pile
          of loose cards. */}
      <section className="mt-7 px-6">
        <SectionLabel>
          {topicCount === 1 ? "1 subject" : `${topicCount} subjects`}
        </SectionLabel>

        <div className="mt-3 overflow-hidden rounded-lg border border-hairline bg-paper">
          {topicSlugs.map((slug) => {
            const t = topicPalette[slug];
            if (!t) return null;
            const accent = `var(--${t.accent})`;
            const day = (cooldowns.get(slug)?.last_deck_index_completed ?? -1) + 1;
            return (
              <button
                key={slug}
                type="button"
                onClick={() => onPick(slug)}
                className="group flex w-full items-stretch border-b border-hairline text-left transition-colors last:border-b-0 hover:bg-panel"
              >
                <span
                  className="w-[3px] shrink-0 self-stretch"
                  style={{ backgroundColor: accent }}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-1 items-center gap-4 px-4 py-4">
                  <span
                    className="w-11 shrink-0 font-mono text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: accent }}
                  >
                    {t.short}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
                      {t.name}
                    </span>
                    <span className="font-sans text-[14px] leading-relaxed text-muted">
                      {t.blurb}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    day {day}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

// A mono section label paired with a hairline rule, the same register
// language the card metadata uses.
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {children}
      </span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

// The same 24px stroke language as the rest of the chrome, sized by
// currentColor so it inherits the row's hover tone.
function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
