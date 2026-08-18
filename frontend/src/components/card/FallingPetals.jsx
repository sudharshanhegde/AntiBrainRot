import { useEffect, useState } from "react";

// One-shot correct-answer celebration. A brief burst of
// falling petals, under roughly a second, plays once and does not loop.
// When prefers-reduced-motion is set, the motion is skipped entirely and
// a simple static checkmark is shown instead. The component has no
// dimensions of its own; it is positioned over the quiz card body by its
// parent.
export function FallingPetals() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onChange = () => setReduced(mq.matches);
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else mq.addListener(onChange);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener("change", onChange);
        else mq.removeListener(onChange);
      };
    } catch {
      return undefined;
    }
  }, []);

  if (reduced) {
    return (
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full border border-ink"
        aria-label="Correct"
        role="img"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 8.5L6.5 12L13 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  // One-shot petals. Random-but-static inline styles keep the burst
  // organic without re-randomizing on re-render.
  const petals = Array.from({ length: 14 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 220,
    duration: 650 + Math.random() * 250,
    size: 7 + Math.random() * 4,
    color: i % 4 === 0 ? "#B4470B" : i % 4 === 1 ? "#1E5A8A" : i % 4 === 2 ? "#5B3A8E" : "#1F6F63",
  }));

  return (
    <span className="petal-scene" aria-hidden="true">
      {petals.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.25,
            backgroundColor: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
          }}
        />
      ))}
    </span>
  );
}
