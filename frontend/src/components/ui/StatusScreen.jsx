// Full-screen loading and error state, styled with the same token
// system as the rest of the app. Used by the feed and the topic list.
// Static text only, no spinners and no animation beyond the shared
// screen-in fade.
export function StatusScreen({ label, title, accent, onAction, actionLabel, description }) {
  return (
    <div className="screen-in flex h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      {accent && (
        <span
          className="inline-block h-2 w-2 rounded-[2px]"
          style={{ backgroundColor: `var(--${accent})` }}
          aria-hidden="true"
        />
      )}
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      {title && (
        <p className="font-sans text-lg font-semibold tracking-tight text-ink">
          {title}
        </p>
      )}
      {description && (
        <p className="max-w-xs font-sans text-[14px] leading-relaxed text-muted">
          {description}
        </p>
      )}
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
        >
          {actionLabel || "try again"}
        </button>
      )}
    </div>
  );
}
