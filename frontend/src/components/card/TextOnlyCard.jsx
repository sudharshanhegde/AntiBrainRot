// text_only template: a title plus a 100-200 word explanation body.
export function TextOnlyCard({ title, body }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-sans text-2xl font-semibold leading-snug tracking-tight sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="font-sans text-[17px] leading-[1.7] text-ink/90">{body}</p>
    </div>
  );
}
