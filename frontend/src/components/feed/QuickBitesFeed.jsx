import { memo, useCallback, useEffect, useRef, useState } from "react";
import { StatusScreen } from "../ui/StatusScreen";
import { AppMenu } from "../ui/AppMenu";
import { fetchQuickBites, markBitesSeen } from "../../api/quickBitesService";
import { useActiveCardIndex } from "../../hooks/useActiveCardIndex";
import { useSwipeExit } from "../../hooks/useSwipeExit";

// The Quick Bites feed 
//
// Reuses the exact same vertical scroll-snap feed mechanism as the topic
// feed (the .feed-scroll / .feed-card CSS, useActiveCardIndex for the
// dominant card, useSwipeExit for horizontal exit, prefetch before the
// user runs out) but with a genuinely different data source and content
// shape: no decks, no difficulty, no cooldown, no quiz, no "which day am
// I on". Each card is a single short, loosely-tagged fact. Cards are
// marked seen as the user scrolls past them, so the backend serves fresh
// unseen ones on the next prefetch and the feed keeps going instead of
// hitting a wall.

const QUICK_BITES_ACCENT = "var(--accent-bite)";

// Memoized single bite card. The feed re-renders whenever the dominant
// card changes (for seen-tracking and prefetching), but a bite's own
// content depends only on its own props, so memoizing keeps the other
// cards from re-rendering during a scroll, which keeps the feed smooth.
const QuickBiteCard = memo(function QuickBiteCard({ bite, index, onBack, onOpenProfile }) {
  return (
    <article className="feed-card flex flex-col" aria-label={`Quick bite ${index + 1}`}>
      <header className="shrink-0 px-5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex items-center justify-between">
          <AppMenu
            entries={[
              { label: "Profile", onSelect: onOpenProfile },
              { label: "Topics", onSelect: onBack },
            ]}
          />
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            go back
          </button>
        </div>
        <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.14em]">
          <span className="text-muted">quick bites</span>
          <span className="flex items-center gap-2" style={{ color: QUICK_BITES_ACCENT }}>
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: QUICK_BITES_ACCENT }}
              aria-hidden="true"
            />
            {bite.tag}
          </span>
        </div>
        <div className="mt-2 h-px bg-hairline" />
      </header>

      <div className="card-body min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
        <p className="font-sans text-lg leading-relaxed text-ink">{bite.body}</p>
      </div>

      <footer className="shrink-0 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="h-px bg-hairline" />
        <div className="mt-3 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span>quick bites</span>
          <span>swipe</span>
        </div>
      </footer>
    </article>
  );
});

export function QuickBitesFeed({ onBack, onOpenProfile = () => {} }) {
  const scrollRef = useRef(null);
  const [bites, setBites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exhausted, setExhausted] = useState(false);
  const fetchingRef = useRef(false);
  // Ids already reported as seen, so a card is never re-reported on every
  // render as the active index moves.
  const markedRef = useRef(new Set());

  const activeIndex = useActiveCardIndex(scrollRef, bites.length);
  useSwipeExit(scrollRef, onBack);

  const loadMore = useCallback(async (reset) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setError(null);
    try {
      const chunk = await fetchQuickBites();
      if (chunk.length === 0) {
        setExhausted(true);
      } else {
        setBites((prev) => {
          if (reset) return chunk;
          // The backend only excludes cards already marked seen, so a
          // prefetch can re-return cards this session has loaded but not
          // yet scrolled past. Drop any id already in the list so the feed
          // never shows a duplicate.
          const existing = new Set(prev.map((b) => b.id));
          const fresh = chunk.filter((b) => !existing.has(b.id));
          return [...prev, ...fresh];
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load quick bites");
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Load the first chunk on open.
  useEffect(() => {
    setBites([]);
    setExhausted(false);
    loadMore(true);
  }, [loadMore]);

  // Mark cards seen as they scroll past (everything before the dominant
  // card has been left behind and should not resurface).
  useEffect(() => {
    if (activeIndex <= 0) return;
    const toMark = bites
      .slice(0, activeIndex)
      .filter((b) => !markedRef.current.has(b.id));
    if (toMark.length === 0) return;
    toMark.forEach((b) => markedRef.current.add(b.id));
    markBitesSeen(toMark.map((b) => b.id));
  }, [activeIndex, bites]);

  // Prefetch the next unseen chunk well before the user runs out of
  // loaded cards, so the feed never visibly stalls. Prefetching earlier
  // and in smaller chunks keeps the DOM growth smooth instead of
  // appending a large block right under the user's thumb.
  useEffect(() => {
    if (exhausted || loading || bites.length === 0) return;
    if (activeIndex >= bites.length - 6) {
      loadMore(false);
    }
  }, [activeIndex, bites.length, exhausted, loading, loadMore]);

  if (bites.length === 0 && loading) {
    return <StatusScreen label="loading quick bites" title="quick bites" accent="bite" />;
  }
  if (bites.length === 0 && error) {
    return (
      <StatusScreen
        label={error}
        title="quick bites"
        accent="bite"
        onAction={() => loadMore(true)}
        actionLabel="try again"
      />
    );
  }
  if (bites.length === 0) {
    // Nothing to serve yet: the pool is empty (e.g. generation has not
    // run). Offer a way back instead of a dead-end.
    return (
      <StatusScreen
        label="no quick bites yet"
        title="Come back soon"
        accent="bite"
        onAction={onBack}
        actionLabel="back to topics"
      />
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="feed-scroll"
        role="region"
        aria-label="Quick bites"
      >
        {bites.map((bite, i) => (
          <QuickBiteCard
            key={bite.id}
            bite={bite}
            index={i}
            onBack={onBack}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </div>
    </>
  );
}
