import { memo } from "react";
import { CardShell } from "../card/CardShell";
import { TemplateRenderer } from "../card/TemplateRenderer";
import { AppMenu } from "../ui/AppMenu";

// Memoized per-card wrapper for the topic feed.
//
// The feed re-renders on every dominant-card change (to track resume
// position, prefetching, and deck completion), but a card's own content
// depends only on its own props, none of which change when the active
// index moves. Wrapping each card in React.memo means scrolling from one
// card to the next no longer re-renders the whole list of cards (and
// their code panels and diagrams), which is what keeps card-to-card
// scrolling smooth on Android devices.
export const FeedCard = memo(function FeedCard({
  card,
  topic,
  difficulty,
  deckIndex,
  index,
  total,
  onBack,
  onOpenProfile,
  onOpenDays,
}) {
  return (
    <CardShell
      topic={topic}
      difficulty={difficulty}
      deckIndex={deckIndex}
      index={index}
      total={total}
      topBar={
        <div className="mb-2 flex items-center justify-between">
          <AppMenu
            entries={[
              { label: "Days", onSelect: onOpenDays },
              { label: "Profile", onSelect: onOpenProfile },
            ]}
          />
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[13px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            go back
          </button>
        </div>
      }
    >
      <TemplateRenderer card={card} accent={topic.accent} />
    </CardShell>
  );
});
