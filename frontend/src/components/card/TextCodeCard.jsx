// text_code template: explanation plus a short code or syscall snippet.
// The panel has a fixed-height chrome (caption bar plus pre) so nothing
// shifts when the snippet mounts.
export function TextCodeCard({ title, body, code }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-sans text-2xl font-semibold leading-snug tracking-tight sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="font-sans text-[17px] leading-[1.7] text-ink/90">{body}</p>
      <figure className="panel code-panel">
        <figcaption className="flex items-center justify-between border-b border-hairline px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span>code</span>
          <span>syscall</span>
        </figcaption>
        <pre className="px-3 py-3">
          <code>{code}</code>
        </pre>
      </figure>
    </div>
  );
}
