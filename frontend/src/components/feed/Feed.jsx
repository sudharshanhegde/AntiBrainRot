import { useCallback, useEffect, useRef, useState } from "react";
import { CardShell } from "../card/CardShell";
import { TemplateRenderer } from "../card/TemplateRenderer";
import { StatusScreen } from "../ui/StatusScreen";
import { EndCard } from "./EndCard";
import { DaysDrawer } from "./DaysDrawer";
import { topicPalette } from "../../data/topics";
import { fetchDeckChunk, fetchDays } from "../../api/feedService";
import { useActiveCardIndex } from "../../hooks/useActiveCardIndex";

function HamburgerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// The vertical scroll-snap feed. This is the single surface that opens
// for a topic. Native CSS scroll-snap does the physics; no JS touch
// handling. Each card is a full-viewport snap target.
//
// A hamburger in the card header opens a drawer listing the topic's days
// (Day 0, Day 1, ...), so the user can jump to previous days or see what
// is locked. revisionDeckIndex (optional) opens a specific completed day
// (e.g. when a topic on cooldown is tapped); in revision mode reaching
// the end does not reset the cooldown.
export function Feed({
  topicSlug,
  onBack,
  onExplore,
  onDeckComplete,
  onSurprise,
  revisionDeckIndex = null,
}) {
  const scrollRef = useRef(null);
  const [deckTarget, setDeckTarget] = useState(revisionDeckIndex); // null = next deck, number = specific day
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [days, setDays] = useState({ days: [] });
  const [cards, setCards] = useState([]);
  const [meta, setMeta] = useState({ total: 0, difficulty: "fundamentals", deckIndex: 0 });
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const completedRef = useRef(false);

  const activeIndex = useActiveCardIndex(scrollRef, cards.length + (hasMore ? 0 : 1));
  const topic = topicPalette[topicSlug] || topicPalette["operating-systems"];

  // Reset to the initial day whenever the topic (re)opens.
  useEffect(() => {
    setDeckTarget(revisionDeckIndex);
  }, [revisionDeckIndex, topicSlug]);

  // Load the day list for the drawer.
  useEffect(() => {
    let active = true;
    fetchDays(topicSlug)
      .then((d) => {
        if (active) setDays(d);
      })
      .catch(() => {
        if (active) setDays({ days: [] });
      });
    return () => {
      active = false;
    };
  }, [topicSlug]);

  const loadChunk = useCallback(
    async (offset) => {
      setError(null);
      setLoading(true);
      try {
        const { cards: chunk, hasMore: more, total, difficulty, deckIndex } =
          await fetchDeckChunk(topicSlug, deckTarget, offset);
        setCards((prev) => [...prev, ...chunk]);
        setHasMore(more);
        if (offset === 0) setMeta({ total, difficulty, deckIndex });
      } catch (err) {
        setError(err instanceof Error ? err.message : "could not load the deck");
      } finally {
        setLoading(false);
      }
    },
    [topicSlug, deckTarget]
  );

  // Load the first chunk whenever the topic or target day changes.
  useEffect(() => {
    setCards([]);
    setHasMore(true);
    completedRef.current = false;
    loadChunk(0);
  }, [loadChunk]);

  // Prefetch: fetch the next chunk well before the user runs out of
  // loaded cards, so the next 3-5 cards are already in memory.
  useEffect(() => {
    if (loading || !hasMore || cards.length === 0) return;
    if (activeIndex >= cards.length - 3) {
      loadChunk(cards.length);
    }
  }, [activeIndex, cards, hasMore, loading, loadChunk]);

  // Mark the deck complete once the end card becomes the active snap.
  // Skipped in revision mode (deckTarget set) so re-reading does not
  // reset the cooldown.
  const endCardIndex = hasMore ? -1 : cards.length;
  useEffect(() => {
    if (deckTarget != null) return;
    if (endCardIndex !== -1 && activeIndex === endCardIndex && !completedRef.current) {
      completedRef.current = true;
      onDeckComplete(meta.deckIndex);
    }
  }, [activeIndex, endCardIndex, meta.deckIndex, onDeckComplete, deckTarget]);

  const handleSelectDay = (day) => {
    // available -> play the next deck; completed -> re-read that day
    setDeckTarget(day.status === "completed" ? day.deck_index : null);
    setDrawerOpen(false);
  };

  if (cards.length === 0 && loading) {
    return <StatusScreen label="loading deck" title={topic.name} accent={topic.accent} />;
  }
  if (cards.length === 0 && error) {
    return (
      <StatusScreen
        label={error}
        title={topic.name}
        accent={topic.accent}
        onAction={() => loadChunk(0)}
      />
    );
  }
  if (cards.length === 0) {
    // Loaded but nothing to serve: the topic has no reviewed decks yet.
    return (
      <StatusScreen
        label="no content yet"
        title={topic.name}
        accent={topic.accent}
        onAction={onBack}
        actionLabel="back to topics"
      />
    );
  }

  const total = meta.total || cards.length;
  const showEndCard = !hasMore && cards.length > 0;
  const atEnd = showEndCard && activeIndex >= cards.length;

  return (
    <>
      <div
        ref={scrollRef}
        className="feed-scroll"
        role="region"
        aria-label={
          atEnd
            ? `End of deck, ${topic.name}`
            : `${topic.name}, card ${Math.min(activeIndex, total - 1) + 1} of ${total}`
        }
      >
        {cards.map((card) => (
          <CardShell
            key={card.order_index}
            topic={topic}
            difficulty={meta.difficulty}
            deckIndex={meta.deckIndex}
            index={card.order_index}
            total={total}
            topBar={
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
                  aria-label="Open days"
                >
                  <HamburgerIcon />
                  days
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
                >
                  topics
                </button>
              </div>
            }
          >
            <TemplateRenderer card={card} accent={topic.accent} />
          </CardShell>
        ))}

        {showEndCard && (
          <EndCard
            topic={topic}
            difficulty={meta.difficulty}
            onExplore={onExplore || onBack}
            onSurprise={onSurprise}
          />
        )}
      </div>

      {drawerOpen && (
        <DaysDrawer
          topicSlug={topicSlug}
          days={days.days}
          onSelect={handleSelectDay}
          onClose={() => setDrawerOpen(false)}
          onBackToTopics={onBack}
        />
      )}
    </>
  );
}
