import { useEffect } from "react";

// Adds the "enter" class to the referenced element once it intersects,
// triggering the single allowed fade-in moment defined in index.css.
// Below-fold cards animate only as they settle into view, and
// prefers-reduced-motion is handled in CSS.
export function useCardEnter(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) el.classList.add("enter");
        });
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
