import { clamp } from "../../pet/petModel";

// Port of the tamagotchi project's ProgressBar, retokenized to the app's
// palette: the fill uses the pet accent and turns to the flame tone when
// the stat crosses its danger threshold. inverse flips the sense for
// stats where a low value is the bad one (happiness).
export function PetStatBar({ value, warning, danger, inverse = false }) {
  const isDanger = inverse ? value <= danger : value >= danger;
  const isWarning = inverse ? value <= warning : value >= warning;
  const color = isDanger ? "var(--accent-flame)" : "var(--accent-pet)";

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-hairline"
      role="progressbar"
      aria-valuenow={Math.round(clamp(value))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${clamp(value)}%`,
          backgroundColor: color,
          opacity: isWarning && !isDanger ? 0.65 : 1,
        }}
      />
    </div>
  );
}
