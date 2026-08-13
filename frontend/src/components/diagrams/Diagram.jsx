import { AddressSpaceDiagram } from "./AddressSpaceDiagram";
import { ProcessStateDiagram } from "./ProcessStateDiagram";
import { FdTableDiagram } from "./FdTableDiagram";

// The content pipeline tags a card with text_diagram and describes the
// diagram in diagram_ref. The frontend resolves which schematic to draw
// from that description. This is the single place that maps a diagram
// reference to a rendered diagram, so new diagram types land here.
function resolveDiagramKind(ref) {
  const text = (ref || "").toLowerCase();
  if (text.includes("address space") || text.includes("virtual address")) {
    return "address-space";
  }
  if (text.includes("state diagram") || text.includes("states")) {
    return "process-state";
  }
  if (text.includes("table") || text.includes("descriptor")) {
    return "fd-table";
  }
  return "generic";
}

function GenericDiagram() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-hairline">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        diagram pending
      </span>
    </div>
  );
}

export function Diagram({ diagramRef, accent }) {
  const kind = resolveDiagramKind(diagramRef);

  switch (kind) {
    case "address-space":
      return <AddressSpaceDiagram accent={accent} />;
    case "process-state":
      return <ProcessStateDiagram accent={accent} />;
    case "fd-table":
      return <FdTableDiagram accent={accent} />;
    default:
      return <GenericDiagram />;
  }
}
