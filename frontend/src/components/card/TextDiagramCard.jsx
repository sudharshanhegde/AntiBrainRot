import { Diagram } from "../diagrams/Diagram";

// text_diagram template: explanation plus a diagram. The diagram panel
// has a reserved fixed height, so the card never shifts when it mounts.
export function TextDiagramCard({ title, body, diagramRef, accent }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-sans text-2xl font-semibold leading-snug tracking-tight sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="font-sans text-[17px] leading-[1.7] text-ink/90">{body}</p>
      <figure className="panel diagram-panel">
        <Diagram diagramRef={diagramRef} accent={accent} />
      </figure>
    </div>
  );
}
