import { useEffect, useState } from "react";

// Tracks which card in the scroll-snap feed is currently dominant,
// by measuring intersection ratios against the feed container.
//
// cardCount is passed so the observer re-arms whenever the feed appends
// a prefetched chunk, keeping newly mounted cards observed.
//
// This hook is also the seam where feed-API prefetching attaches: when
// activeIndex approaches the last loaded card, the next deck chunk is
// fetched well before the user reaches the boundary (SKILL_frontend.md,
// motion and interaction rules).
export function useActiveCardIndex(scrollRef, cardCount) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const cards = Array.from(scroller.children).filter(
      (el) => el instanceof HTMLElement && el.classList.contains("feed-card")
    );

    const observer = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        }
        if (!best) return;
        const idx = cards.indexOf(best.target);
        if (idx !== -1) setActiveIndex(idx);
      },
      { threshold: [0.4, 0.6, 0.8] }
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [scrollRef, cardCount]);

  return activeIndex;
}
