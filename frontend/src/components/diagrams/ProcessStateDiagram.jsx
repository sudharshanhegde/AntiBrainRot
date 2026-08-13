// Three-node process state diagram with the transitions a scheduler
// spends its time on: dispatch, preempt, I/O wait, and I/O complete.
export function ProcessStateDiagram({ accent }) {
  const accentVar = `var(--${accent})`;
  const ink = "#1B1E23";
  const muted = "#666B72";
  const hairline = "#DCDAD2";
  const paper = "#F3F2EC";

  return (
    <svg
      viewBox="0 0 340 200"
      role="img"
      aria-label="Diagram of process states: ready, running, and blocked"
      className="h-full w-full max-w-[340px]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <defs>
        <marker
          id="state-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ink} />
        </marker>
      </defs>

      {/* arrows */}
      {/* ready -> running (dispatch) */}
      <line x1="88" y1="118" x2="150" y2="76" stroke={ink} strokeWidth="1.2" markerEnd="url(#state-arrow)" />
      <text x="104" y="106" fontSize="9" fill={muted}>
        dispatch
      </text>

      {/* running -> ready (preempt / slice) */}
      <line x1="128" y1="62" x2="82" y2="112" stroke={ink} strokeWidth="1.2" markerEnd="url(#state-arrow)" />
      <text x="84" y="92" fontSize="9" fill={muted}>
        preempt
      </text>

      {/* running -> blocked (I/O wait) */}
      <line x1="218" y1="76" x2="246" y2="112" stroke={ink} strokeWidth="1.2" markerEnd="url(#state-arrow)" />
      <text x="222" y="104" fontSize="9" fill={muted}>
        I/O wait
      </text>

      {/* blocked -> ready (I/O done) */}
      <line x1="220" y1="138" x2="112" y2="138" stroke={ink} strokeWidth="1.2" markerEnd="url(#state-arrow)" />
      <text x="148" y="152" fontSize="9" fill={muted}>
        I/O done
      </text>

      {/* new -> ready */}
      <line x1="12" y1="138" x2="26" y2="138" stroke={ink} strokeWidth="1.2" markerEnd="url(#state-arrow)" />
      <text x="8" y="128" fontSize="9" fill={muted}>
        new
      </text>

      {/* nodes */}
      <rect x="34" y="114" width="72" height="34" rx="4" fill={paper} stroke={hairline} strokeWidth="1.2" />
      <text x="70" y="135" fontSize="11" fill={ink} textAnchor="middle">
        READY
      </text>

      <rect x="122" y="44" width="96" height="36" rx="4" fill={accentVar} opacity="0.14" stroke={accentVar} strokeWidth="1.4" />
      <text x="170" y="67" fontSize="11" fill={accentVar} textAnchor="middle">
        RUNNING
      </text>

      <rect x="240" y="114" width="84" height="34" rx="4" fill={paper} stroke={hairline} strokeWidth="1.2" />
      <text x="282" y="135" fontSize="11" fill={ink} textAnchor="middle">
        BLOCKED
      </text>
    </svg>
  );
}
