import { useRef } from "react";
import { useCardEnter } from "../../hooks/useCardEnter";

// Full-viewport ledger page that holds one card. The header is a
// monospace metadata row (topic, difficulty, index register), a
// hairline rule separates it from the body, and a quiet footer sits
// at the bottom. The body area scrolls internally only if content
// ever overflows; the page itself is a snap target of the feed.
export function CardShell({
  topic,
  difficulty,
  deckIndex,
  index,
  total,
  children,
  footer,
  onBack,
}) {
  const bodyRef = useRef(null);
  useCardEnter(bodyRef);

  const accentVar = `var(--${topic.accent})`;

  return (
    <article
      className="feed-card flex flex-col"
      aria-label={`Card ${index + 1} of ${total}, ${topic.name}, ${difficulty}`}
    >
      <header className="shrink-0 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        {onBack && (
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
            >
              back to topics
            </button>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.14em]">
          <div className="flex items-baseline gap-3">
            <span className="flex items-center gap-2" style={{ color: accentVar }}>
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: accentVar }}
                aria-hidden="true"
              />
              {topic.short}
            </span>
            <span className="text-muted">{difficulty}</span>
          </div>
          <span className="text-muted tabular-nums">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
        </div>
        <div className="mt-3 h-px bg-hairline" />
      </header>

      <div
        ref={bodyRef}
        className="card-body min-h-0 flex-1 overflow-y-auto px-5 py-6"
      >
        {children}
      </div>

      <footer className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {footer ? (
          footer
        ) : (
          <>
            <div className="h-px bg-hairline" />
            <div className="mt-3 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              <span>
                {topic.short} / deck {String(deckIndex).padStart(2, "0")}
              </span>
              <span>swipe</span>
            </div>
          </>
        )}
      </footer>
    </article>
  );
}
