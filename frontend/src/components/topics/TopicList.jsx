import { useEffect, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { findNiche, topicPalette } from "../../data/topics";
import { fetchTopics } from "../../api/feedService";
import { fetchCooldownMap } from "../../api/progress";

// Topic list for the chosen niche. Tapping a topic opens its feed
// directly; previous days are reached from the feed's hamburger. A topic
// on cooldown (its last day completed recently) shows the remaining time
// and, when tapped, asks whether to revise the completed day.
export function TopicList({ nicheSlug, onPick, onChangeNiche }) {
  const niche = findNiche(nicheSlug);
  const [topicSlugs, setTopicSlugs] = useState(null);
  const [cooldowns, setCooldowns] = useState(new Map());
  const [pendingRevision, setPendingRevision] = useState(null);

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
          Pick a topic to open its feed. One day per deck, and the next day
          unlocks after a short cooldown.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {topicSlugs.map((slug) => {
          const t = topicPalette[slug];
          if (!t) return null;
          const accent = `var(--${t.accent})`;
          const cd = cooldowns.get(slug);
          const cooldown = Boolean(cd?.is_on_cooldown);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => {
                if (cooldown) {
                  setPendingRevision({
                    slug,
                    deckIndex: cd.last_deck_index_completed,
                    name: t.name,
                  });
                } else {
                  onPick(slug);
                }
              }}
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
                    {cooldown
                      ? `come back in ${cd.cooldown_remaining_hours}h`
                      : "day 0"}
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

      {pendingRevision && (
        <ConfirmDialog
          title="Revise this day?"
          body={`You already finished the ${pendingRevision.name} day. Read it again?`}
          confirmLabel="Revise"
          cancelLabel="Not now"
          onConfirm={() => {
            onPick(pendingRevision.slug, pendingRevision.deckIndex);
            setPendingRevision(null);
          }}
          onCancel={() => setPendingRevision(null)}
        />
      )}
    </main>
  );
}
