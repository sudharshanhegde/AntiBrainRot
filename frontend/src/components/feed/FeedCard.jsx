import { memo } from "react";
import { CardShell } from "../card/CardShell";
import { TemplateRenderer } from "../card/TemplateRenderer";
import { ThemeToggle } from "../ui/ThemeToggle";

// Small calendar glyph for the "days" chrome button. When the hamburger
// menu was retired, its "Days" entry (the only non-obsolete item it still
// held) moved out here as a direct button in the top-left chrome, where the
// hamburger icon used to sit. Same 24px stroke language as the rest of the
// chrome, sized by currentColor.
function DaysIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </svg>
  );
}

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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenDays}
              aria-label="Open days"
              className="flex items-center gap-1.5 p-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
            >
              <DaysIcon />
              days
            </button>
            <ThemeToggle />
          </div>
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
