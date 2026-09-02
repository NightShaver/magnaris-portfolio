"use client";

import { useEffect } from "react";
import Lenis from "lenis";

import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useLowPower } from "@/lib/useLowPower";

/**
 * Lenis smooth scroll, driven by rAF.
 *
 * The instance is published on `window.__lenis` so scroll-locking components
 * (the Walkable Room overlay, modals) can stop and start it without prop
 * drilling a ref through half the tree.
 */
declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();
  const lowPower = useLowPower();

  useEffect(() => {
    if (reduced) return;
    /**
     * Touch scrolling already runs on the compositor, off the main thread, and
     * Lenis does not take it over by default. What would remain is a
     * requestAnimationFrame loop doing scroll maths on every frame for no
     * visible gain — on a phone that is a frame budget spent on nothing.
     */
    if (lowPower) return;

    const lenis = new Lenis({
      duration: 1.1,
      // Matches --ease-brand closely enough to feel like one system.
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    window.__lenis = lenis;

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      delete window.__lenis;
    };
  }, [reduced, lowPower]);

  return <>{children}</>;
}
