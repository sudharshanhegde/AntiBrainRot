import { useCallback, useEffect, useRef, useState } from "react";
import { CardShell } from "../card/CardShell";
import { TemplateRenderer } from "../card/TemplateRenderer";
import { StatusScreen } from "../ui/StatusScreen";
import { EndCard } from "./EndCard";
import { topicPalette } from "../../data/topics";
import { fetchDeckChunk } from "../../api/feedService";
import { useActiveCardIndex } from "../../hooks/useActiveCardIndex";

// The vertical scroll-snap feed. Native CSS scroll-snap does the
// physics; no JS touch handling. Each card is a full-viewport snap
// target. The deck loads in chunks: the first chunk renders, and when
// the active card approaches the end of what is loaded, the next chunk
// is fetched ahead of time (prefetch rule in SKILL_frontend.md). Once
// every chunk is loaded, an end card marks a deliberate stopping point.
//
// revisionDeckIndex re-reads a specific already-completed deck (revise
// mode) instead of the next deck; in that mode reaching the end does not
// reset the 24h cooldown.
export function Feed({
  topicSlug,
  onBack,
  onDeckComplete,
  onSurprise,
  revisionDeckIndex = null,
}) {
  const scrollRef = useRef(null);

  const [cards, setCards] = useState([]);
  const [meta, setMeta] = useState({ total: 0, difficulty: "fundamentals", deckIndex: 0 });
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const completedRef = useRef(false);

  const activeIndex = useActiveCardIndex(scrollRef, cards.length + (hasMore ? 0 : 1));
  const topic = topicPalette[topicSlug] || topicPalette["operating-systems"];

  const loadChunk = useCallback(
    async (offset) => {
      setError(null);
      setLoading(true);
      try {
        const { cards: chunk, hasMore: more, total, difficulty, deckIndex } =
          await fetchDeckChunk(topicSlug, revisionDeckIndex, offset);
        setCards((prev) => [...prev, ...chunk]);
        setHasMore(more);
        if (offset === 0) setMeta({ total, difficulty, deckIndex });
      } catch (err) {
        setError(err instanceof Error ? err.message : "could not load the deck");
      } finally {
        setLoading(false);
      }
    },
    [topicSlug, revisionDeckIndex]
  );

  // Load the first chunk whenever the topic changes.
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
  // Skipped in revision mode so re-reading does not reset the cooldown.
  const endCardIndex = hasMore ? -1 : cards.length;
  useEffect(() => {
    if (revisionDeckIndex != null) return;
    if (endCardIndex !== -1 && activeIndex === endCardIndex && !completedRef.current) {
      completedRef.current = true;
      onDeckComplete(meta.deckIndex);
    }
  }, [activeIndex, endCardIndex, meta.deckIndex, onDeckComplete, revisionDeckIndex]);

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
          onBack={onBack}
        >
          <TemplateRenderer card={card} accent={topic.accent} />
        </CardShell>
      ))}

      {showEndCard && (
        <EndCard
          topic={topic}
          difficulty={meta.difficulty}
          onExplore={onBack}
          onSurprise={onSurprise}
        />
      )}
    </div>
  );
}
