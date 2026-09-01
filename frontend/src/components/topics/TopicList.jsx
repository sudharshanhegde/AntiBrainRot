import { useEffect, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { StreakIndicator } from "../ui/StreakIndicator";
import { findNiche, topicPalette } from "../../data/topics";
import { fetchTopics } from "../../api/feedService";
import { fetchCooldownMap } from "../../api/progress";
import { useAuth } from "../../auth/AuthContext";

// Topic list for the chosen niche (three-zone layout):
//   left   - the daily streak indicator, smaller than the profile
//            version, always visible so the user sees it every time they
//            pick what to learn next,
//   center - a plain "Leaderboard" text entry that opens the leaderboard
//            screen on tap (label, not an icon-only trophy),
//   main   - the topic grid itself, unchanged from before.
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
    return <StatusScreen label="unknown niche" title="Nothing to show here" />;
  }
  if (!topicSlugs) {
    return <StatusScreen label="loading topics" title={niche.name} />;
  }

  return (
    <main className="screen-in h-dvh overflow-y-auto bg-paper">
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
          Pick a topic to open its feed. One day per deck, always available.
        </p>
      </header>

      {/* Three-zone row: streak (left), leaderboard entry (center),
          profile (right). The topic grid below is the main area. */}
      <div className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-lg border border-hairline bg-paper px-4 py-3">
        <StreakIndicator count={user ? (streak?.current_streak ?? 0) : null} label="day streak" />
        <button
          type="button"
          onClick={onOpenLeaderboard}
          className="font-sans text-[14px] font-medium tracking-tight text-ink transition-colors hover:text-muted"
        >
          Leaderboard
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
        >
          profile
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

      {/* Quick Bites: a separate entry point from the topic picker, not a
          topic nested inside the grid. It is a genuinely different mode
          (SKILL_quick_bites.md), so it is framed honestly as the thing to
          open when bored rather than dressed up as another lesson. */}
      <div className="mt-6 px-6">
        <button
          type="button"
          onClick={onOpenQuickBites}
          className="group flex w-full items-center gap-4 rounded-lg border border-hairline bg-panel px-5 py-4 text-left transition-colors hover:border-ink"
        >
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: "var(--accent-bite)" }}
            aria-hidden="true"
          />
          <span className="flex flex-col gap-1">
            <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
              Quick Bites
            </span>
            <span className="font-sans text-[14px] leading-relaxed text-muted">
              Bored? Get a quick CS refresh.
            </span>
          </span>
        </button>
      </div>

      {/* Worth a Read: the third entry point, alongside the topic picker
          and Quick Bites. A curated list of links worth reading, framed
          honestly as the thing to open when you want to go deeper rather
          than as another lesson. */}
      <div className="mt-3 px-6">
        <button
          type="button"
          onClick={onOpenWorthARead}
          className="group flex w-full items-center gap-4 rounded-lg border border-hairline bg-panel px-5 py-4 text-left transition-colors hover:border-ink"
        >
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: "var(--accent-read)" }}
            aria-hidden="true"
          />
          <span className="flex flex-col gap-1">
            <span className="font-sans text-[17px] font-semibold tracking-tight text-ink">
              Worth a Read
            </span>
            <span className="font-sans text-[14px] leading-relaxed text-muted">
              Curated links worth your time.
            </span>
          </span>
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {topicSlugs.map((slug) => {
          const t = topicPalette[slug];
          if (!t) return null;
          const accent = `var(--${t.accent})`;
          const cd = cooldowns.get(slug);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => onPick(slug)}
              className="group flex items-start gap-4 rounded-lg border border-hairline bg-paper px-5 py-4 text-left transition-colors hover:border-ink"
            >
              <span
                className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              />
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className="font-sans text-[17px] font-semibold tracking-tight"
                    style={{ color: accent }}
                  >
                    {t.name}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    day {(cd?.last_deck_index_completed ?? -1) + 1}
                  </span>
                </span>
                <span className="font-sans text-[14px] leading-relaxed text-muted">
                  {t.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </div>

    </main>
  );
}
