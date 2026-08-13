import { useEffect, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { findNiche, topicPalette } from "../../data/topics";
import { fetchTopics } from "../../api/feedService";
import { fetchCooldownMap } from "../../api/progress";

// Topic list for the chosen niche. Topics load through the data
// service (the seam for GET /api/topics). Each topic carries its
// accent color and a short blurb. Cooldown state ("come back tomorrow")
// is read from the backend, the authoritative source, so stale local
// data can never lock a topic the server considers fresh.
export function TopicList({ nicheSlug, onPick, onChangeNiche }) {
  const niche = findNiche(nicheSlug);
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

    return () => {
      active = false;
    };
  }, [nicheSlug]);

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
          Pick a topic to open its next deck. A finished deck unlocks again
          the next day.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {topicSlugs.map((slug) => {
          const t = topicPalette[slug];
          if (!t) return null;
          const accent = `var(--${t.accent})`;
          const cooldown = Boolean(cooldowns.get(slug)?.is_on_cooldown);
          return (
            <button
              key={slug}
              type="button"
              onClick={cooldown ? undefined : () => onPick(slug)}
              aria-disabled={cooldown || undefined}
              className={`group flex items-start gap-4 rounded-lg border bg-paper px-5 py-4 text-left transition-colors ${
                cooldown
                  ? "cursor-not-allowed border-hairline opacity-70"
                  : "border-hairline hover:border-ink"
              }`}
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
                    {cooldown ? "come back tomorrow" : "deck 0"}
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
