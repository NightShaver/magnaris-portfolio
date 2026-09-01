"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { BRAND } from "@/lib/site";
import { EASE_BRAND } from "@/lib/motion";
import { Logo } from "@/components/ui/Logo";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";

const MIN_DURATION = 1100;
const SESSION_KEY = "magnaris:intro-shown";

/**
 * Intro gate.
 *
 * Runs once per session, never on a reduced-motion machine, and never longer
 * than it takes the document to actually finish loading. The page underneath
 * is fully rendered the whole time — this is a curtain, not a loading screen,
 * so a visitor who arrives mid-animation loses nothing.
 */
export function Preloader() {
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    setVisible(true);
    document.body.style.overflow = "hidden";

    const started = performance.now();
    let frame = 0;

    const tick = () => {
      const elapsed = performance.now() - started;
      const ratio = Math.min(1, elapsed / MIN_DURATION);
      // Ease-out so the counter decelerates into 100 instead of snapping.
      setProgress(Math.round((1 - Math.pow(1 - ratio, 3)) * 100));

      if (ratio < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const finish = () => {
        sessionStorage.setItem(SESSION_KEY, "1");
        setVisible(false);
        document.body.style.overflow = "";
        window.__lenis?.scrollTo(0, { immediate: true });
      };

      if (document.readyState === "complete") finish();
      else window.addEventListener("load", finish, { once: true });
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = "";
    };
  }, [reducedMotion]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="preloader"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.9, ease: EASE_BRAND }}
          className="fixed inset-0 z-[95] flex flex-col justify-between bg-ink-900 px-6 py-8 md:px-10"
        >
          <div className="flex items-center justify-between">
            <span className="tag text-frost">{BRAND.name}</span>
            <span className="tag">{BRAND.discipline}</span>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: EASE_BRAND }}
              className="w-[42vw] max-w-[280px] text-frost"
            >
              <Logo className="w-full" />
            </motion.div>
          </div>

          <div>
            <div className="flex items-end justify-between">
              <span className="tag">{BRAND.claim}</span>
              <span className="font-mono text-[clamp(2rem,6vw,4.5rem)] leading-none tracking-[-0.04em]">
                {String(progress).padStart(3, "0")}
              </span>
            </div>
            <div className="mt-4 h-px w-full bg-line">
              <motion.div
                className="h-px bg-teal"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.2, ease: "linear" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Preloader;
