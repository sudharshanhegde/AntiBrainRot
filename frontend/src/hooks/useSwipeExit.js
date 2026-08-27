import { useEffect, useRef } from "react";

// Horizontal "swipe to exit" for the vertical scroll-snap feed.
//
// The feed scrolls vertically (top/bottom swipes move between cards), so
// this hook must never get in the way of that. Vertical scrolling stays
// 100% native: the scroller carries `touch-action: pan-y` (set in CSS),
// which lets the browser own vertical pans and keeps horizontal drags
// flowing to these pointer handlers. We never call preventDefault, so a
// scroll is never blocked.
//
// Only a clearly horizontal gesture is treated as an exit: the horizontal
// travel must clear a distance threshold AND dominate the vertical travel
// by a comfortable margin. A mostly-vertical swipe (normal scrolling)
// therefore never triggers anything. While the finger moves sideways the
// feed nudges along with it for tactile feedback; releasing past the
// threshold calls onExit(), otherwise it springs back. pointercancel (the
// browser taking over, e.g. for a scroll) resets cleanly.
export function useSwipeExit(scrollRef, onExit, { threshold = 80 } = {}) {
  const stateRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof onExit !== "function") return;

    const reset = () => {
      el.style.transition = "transform 180ms ease";
      el.style.transform = "";
      stateRef.current = null;
    };

    const onPointerDown = (e) => {
      // Only touch/pen gestures. Mouse drags stay available for text
      // selection and should never exit.
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      stateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        maxDx: 0,
        maxDy: 0,
      };
    };

    const onPointerMove = (e) => {
      const s = stateRef.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      s.maxDx = Math.max(s.maxDx, Math.abs(dx));
      s.maxDy = Math.max(s.maxDy, Math.abs(dy));
      // Only start the visual follow once the gesture is clearly
      // horizontal, so a vertical scroll never looks like a swipe.
      if (s.maxDx < 12) return;
      el.style.transition = "none";
      // Light resistance: the feed moves at half the finger's speed.
      el.style.transform = `translateX(${dx * 0.5}px)`;
    };

    const onPointerUp = (e) => {
      const s = stateRef.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const horizontal =
        s.maxDx >= threshold && s.maxDx > s.maxDy * 1.5;
      reset();
      if (horizontal) onExit();
    };

    const onPointerCancel = () => reset();

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [scrollRef, onExit, threshold]);
}
