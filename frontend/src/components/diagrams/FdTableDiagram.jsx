// Table showing how small integers map to files: 0, 1, 2 are standard
// input, output, and error, and a newly opened file takes the lowest
// free slot.
export function FdTableDiagram({ accent }) {
  const accentVar = `var(--${accent})`;
  const ink = "#1B1E23";
  const muted = "#666B72";
  const hairline = "#DCDAD2";
  const paper = "#F3F2EC";

  const rows = [
    { fd: "0", role: "stdin", target: "terminal" },
    { fd: "1", role: "stdout", target: "terminal" },
    { fd: "2", role: "stderr", target: "terminal" },
    { fd: "3", role: "file", target: "open on disk" },
  ];

  const xFd = 34;
  const xRole = 96;
  const xTarget = 200;
  const yHeader = 26;
  const rowH = 26;
  const wFd = 44;
  const wRole = 92;
  const wTarget = 120;

  return (
    <svg
      viewBox="0 0 340 200"
      role="img"
      aria-label="Diagram of a file descriptor table"
      className="h-full w-full max-w-[340px]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {/* header */}
      <text x={xFd} y={yHeader - 6} fontSize="10" fill={muted}>
        FD
      </text>
      <text x={xRole} y={yHeader - 6} fontSize="10" fill={muted}>
        ROLE
      </text>
      <text x={xTarget} y={yHeader - 6} fontSize="10" fill={muted}>
        TARGET
      </text>
      <line x1={xFd} y1={yHeader} x2={xTarget + wTarget} y2={yHeader} stroke={hairline} strokeWidth="1.2" />

      {rows.map((row, i) => {
        const y = yHeader + 6 + i * rowH;
        const isNew = i === rows.length - 1;
        return (
          <g key={row.fd}>
            <rect
              x={xFd}
              y={y}
              width={wFd}
              height={rowH - 4}
              fill={isNew ? accentVar : "none"}
              stroke={isNew ? accentVar : hairline}
              strokeWidth={isNew ? 1.4 : 1}
              rx="3"
            />
            <rect
              x={xRole}
              y={y}
              width={wRole}
              height={rowH - 4}
              fill="none"
              stroke={isNew ? accentVar : hairline}
              strokeWidth={isNew ? 1.4 : 1}
              rx="3"
            />
            <rect
              x={xTarget}
              y={y}
              width={wTarget}
              height={rowH - 4}
              fill="none"
              stroke={isNew ? accentVar : hairline}
              strokeWidth={isNew ? 1.4 : 1}
              rx="3"
            />
            <text
              x={xFd + wFd / 2}
              y={y + 17}
              fontSize="11"
              textAnchor="middle"
              fill={isNew ? paper : ink}
            >
              {row.fd}
            </text>
            <text x={xRole + 8} y={y + 17} fontSize="11" fill={isNew ? accentVar : ink}>
              {row.role}
            </text>
            <text x={xTarget + 8} y={y + 17} fontSize="11" fill={isNew ? accentVar : ink}>
              {row.target}
            </text>
          </g>
        );
      })}

      {/* lowest free slot note */}
      <text x={xFd} y={yHeader + 6 + rows.length * rowH + 8} fontSize="9" fill={muted}>
        new descriptors take the lowest free slot
      </text>
    </svg>
  );
}
