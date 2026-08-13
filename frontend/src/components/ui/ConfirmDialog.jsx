// A small modal for confirming an action, styled with the same token
// system as the rest of the app. No em dashes, no emojis.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg border border-hairline bg-paper p-6 shadow-lg"
      >
        <h2 className="font-sans text-xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {body && (
          <p className="mt-2 font-sans text-[15px] leading-relaxed text-muted">
            {body}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-ink bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
