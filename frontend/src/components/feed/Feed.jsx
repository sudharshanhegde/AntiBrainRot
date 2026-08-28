import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CardShell } from "../card/CardShell";
import { TemplateRenderer } from "../card/TemplateRenderer";
import { StatusScreen } from "../ui/StatusScreen";
import { EndCard } from "./EndCard";
import { DaysDrawer } from "./DaysDrawer";
import { AppMenu } from "../ui/AppMenu";
import { topicPalette } from "../../data/topics";
import { fetchDeckChunk, fetchDays } from "../../api/feedService";
import { saveViewedCardIndex } from "../../api/progress";
import { useActiveCardIndex } from "../../hooks/useActiveCardIndex";
import { useSwipeExit } from "../../hooks/useSwipeExit";

// Maps the stored difficulty tier to the friendly name shown in the brief
// "level" banner when a topic opens (fundamentals -> basics).
const LEVEL_LABELS = {
  fundamentals: "basics",
  intermediate: "intermediate",
  advanced: "advanced",
};

// The vertical scroll-snap feed. This is the single surface that opens
// for a topic. Native CSS scroll-snap does the physics; no JS touch
// handling. Each card is a full-viewport snap target.
//
// Resume behavior: opening a topic resumes
// in the current in-progress deck (the backend already serves the next
// deck from last_deck_index_completed) and scrolls straight to the card
// the user was last on, before first paint. As the user scrolls, the
// position is saved throttled (~1s), reset to 0 automatically when the
// deck is completed. A hamburger menu in the top chrome opens the days
// drawer and the profile page.
export function Feed({
  topicSlug,
  onBack,
  onExplore,
  onDeckComplete,
  onSurprise,
  onOpenProfile = () => {},
  revisionDeckIndex = null,
  initialCardIndex = 0,
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
  // Whether the initial card position has been restored for this open.
  const restoredRef = useRef(false);
  // Debounced resume-position write: one per second at most, flushed on
  // unmount. Only meaningful in normal play (deckTarget is null) and
  // never on the end card or after completion.
  const pendingSave = useRef({ timer: null, index: -1, slug: null });
  // Brief "level" banner: shown once per open, auto-dismissed.
  const [showLevelToast, setShowLevelToast] = useState(false);
  const levelToastShownRef = useRef(false);

  const activeIndex = useActiveCardIndex(scrollRef, cards.length + (hasMore ? 0 : 1));
  const topic = topicPalette[topicSlug] || topicPalette["operating-systems"];

  // A clearly horizontal swipe (left or right) exits back to topics
  // without ever touching the vertical scroll that moves between cards.
  useSwipeExit(scrollRef, onBack);

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
    restoredRef.current = false;
    loadChunk(0);
  }, [loadChunk]);

  // Restore the resume position before first paint, once the first chunk
  // of cards exists. Skips if the position is the start or out of range
  // (clamped to the loaded cards; the prefetch loads the rest).
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || cards.length === 0 || restoredRef.current) return;
    const target = Number.isInteger(initialCardIndex) ? initialCardIndex : 0;
    if (target <= 0) return;
    restoredRef.current = true;
    const clamp = Math.min(target, cards.length - 1);
    scroller.scrollTop = clamp * scroller.clientHeight;
  }, [cards.length, initialCardIndex]);

  // Prefetch: fetch the next chunk well before the user runs out of
  // loaded cards, so the next 3-5 cards are already in memory.
  useEffect(() => {
    if (loading || !hasMore || cards.length === 0) return;
    if (activeIndex >= cards.length - 3) {
      loadChunk(cards.length);
    }
  }, [activeIndex, cards, hasMore, loading, loadChunk]);

  // Mark the deck complete once the end card becomes the active snap.
  // Skipped in revision mode (deckTarget set) so re-reading a specific
  // day does not advance progress.
  const endCardIndex = hasMore ? -1 : cards.length;
  useEffect(() => {
    if (deckTarget != null) return;
    if (endCardIndex !== -1 && activeIndex === endCardIndex && !completedRef.current) {
      completedRef.current = true;
      onDeckComplete(meta.deckIndex);
    }
  }, [activeIndex, endCardIndex, meta.deckIndex, onDeckComplete, deckTarget]);

  // Debounced resume-position save (~1s). Not on the end card, not after
  // completion, not in revision mode.
  useEffect(() => {
    if (deckTarget != null || cards.length === 0 || completedRef.current) return;
    if (endCardIndex !== -1 && activeIndex >= endCardIndex) return;
    const st = pendingSave.current;
    st.index = activeIndex;
    st.slug = topicSlug;
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      saveViewedCardIndex(st.slug, st.index);
      st.timer = null;
    }, 1000);
  }, [activeIndex, deckTarget, endCardIndex, cards.length, topicSlug]);

  // Flush the pending position on unmount so leaving mid-deck is saved.
  useEffect(() => {
    return () => {
      const st = pendingSave.current;
      if (st.timer) clearTimeout(st.timer);
      if (st.index >= 0 && !completedRef.current) {
        saveViewedCardIndex(st.slug, st.index);
      }
    };
  }, []);

  // Show the difficulty tier (basics / intermediate / advanced) once the
  // deck has loaded, so the user knows the level of content they are
  // about to explore. Held ~1.5s (long enough to actually read), then
  // fades out. Runs once per feed open.
  useEffect(() => {
    if (levelToastShownRef.current) return;
    if (cards.length === 0) return;
    levelToastShownRef.current = true;
    setShowLevelToast(true);
    const t = setTimeout(() => setShowLevelToast(false), 1500);
    return () => clearTimeout(t);
  }, [cards.length]);

  const handleSelectDay = (day) => {
    // No cooldown and no lock: any published day can be opened directly.
    setDeckTarget(day.deck_index);
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
                <AppMenu
                  entries={[
                    { label: "Days", onSelect: () => setDrawerOpen(true) },
                    { label: "Profile", onSelect: onOpenProfile },
                  ]}
                />
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

      {showLevelToast && (
        <div className="level-toast" role="status" aria-live="polite">
          <span className="level-toast-label">you're exploring</span>
          <span className="level-toast-value">
            {LEVEL_LABELS[meta.difficulty] || meta.difficulty}
          </span>
          <span className="level-toast-topic">level of {topic.name}</span>
        </div>
      )}

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
