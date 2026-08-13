// Schematic of a process virtual address space: text, data, heap,
// an unmapped gap, and the stack, ordered from low to high address.
// Rendered inline so it mounts with zero network cost and no layout
// shift; the panel reserves a fixed height in CSS.
export function AddressSpaceDiagram({ accent }) {
  const accentVar = `var(--${accent})`;
  const ink = "#1B1E23";
  const muted = "#666B72";
  const hairline = "#DCDAD2";
  const paper = "#F3F2EC";

  return (
    <svg
      viewBox="0 0 340 200"
      role="img"
      aria-label="Diagram of a process virtual address space"
      className="h-full w-full max-w-[340px]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <defs>
        <pattern
          id="gap-hatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke={hairline} strokeWidth="1.5" />
        </pattern>
      </defs>

      {/* axis */}
      <line x1="26" y1="34" x2="26" y2="196" stroke={hairline} strokeWidth="1" />

      {/* address labels */}
      <text x="16" y="30" fontSize="10" fill={muted} textAnchor="end">
        0xFFFF...
      </text>
      <text x="16" y="200" fontSize="10" fill={muted} textAnchor="end">
        0x0000...
      </text>

      {/* stack, grows downward */}
      <rect x="40" y="34" width="284" height="40" fill={accentVar} rx="3" />
      <text x="52" y="58" fontSize="11" fill={paper}>
        stack
      </text>
      <path
        d="M 306 44 L 296 44 L 301 38 z"
        fill={paper}
        transform="translate(8 18)"
      />

      {/* unmapped gap */}
      <rect x="40" y="74" width="284" height="56" fill="url(#gap-hatch)" rx="3" />
      <text x="52" y="106" fontSize="10" fill={muted}>
        unmapped gap
      </text>

      {/* heap, grows upward */}
      <rect x="40" y="130" width="284" height="30" fill={ink} opacity="0.78" rx="3" />
      <text x="52" y="149" fontSize="11" fill={paper}>
        heap
      </text>

      {/* data */}
      <rect x="40" y="160" width="284" height="20" fill={ink} opacity="0.58" rx="3" />
      <text x="52" y="174" fontSize="10" fill={paper}>
        data
      </text>

      {/* text (code) */}
      <rect x="40" y="180" width="284" height="16" fill={ink} opacity="0.4" rx="3" />
      <text x="52" y="192" fontSize="10" fill={paper}>
        text (code)
      </text>
    </svg>
  );
}
