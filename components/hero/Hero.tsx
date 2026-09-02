"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

import { BRAND, PILLARS } from "@/lib/site";
import { EASE_BRAND, maskUp, stagger } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useWalkableSupport } from "@/lib/useWalkableSupport";

/**
 * The WebGL bundle never runs on the server and never blocks first paint —
 * the typographic half of the hero is complete on its own.
 */
const HeroCanvas = dynamic(
  () => import("./HeroCanvas").then((mod) => mod.HeroCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full rounded-2xl border border-line/80 bg-ink-900" />
    ),
  },
);

const CLAIM_LINES = ["RICHTUNG", "WIRD", "WIRKUNG."];

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  /**
   * A phone has no Pointer Lock API, so the room cannot be looked around in.
   * The invitation is withdrawn here rather than inside the overlay: a door
   * that opens onto an apology is worse than a door marked desktop only.
   */
  const walkable = useWalkableSupport();

  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end start"],
  });

  // The type layer drifts up and dims as the next section takes over.
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "-18%"]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const canvasScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);

  return (
    <section
      id="top"
      ref={section}
      className="relative min-h-[100svh] w-full overflow-hidden pt-20"
    >
      {/* Ambient brand glow behind the whole hero. */}
      <div
        aria-hidden
        // A 140px blur over 90vw x 70vh is a full-screen offscreen buffer at
        // three times the pixels on a phone. The gradient is already soft, so
        // the wide radius only earns its keep on a desktop.
        className="pointer-events-none absolute -top-40 left-1/2 h-[70vh] w-[90vw] -translate-x-1/2 rounded-full opacity-30 blur-3xl md:blur-[140px]"
        style={{
          background:
            "radial-gradient(45% 55% at 30% 40%, #0f8e91 0%, transparent 70%), radial-gradient(45% 55% at 70% 60%, #6f63c7 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid min-h-[calc(100svh-5rem)] w-full max-w-[1600px] grid-cols-1 items-center gap-10 px-6 pb-16 md:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* ---------------------------------------------------------------
            LEFT — razor-sharp typography
           --------------------------------------------------------------- */}
        <motion.div
          style={reducedMotion ? undefined : { y: textY, opacity: textOpacity }}
          className="relative z-10 flex flex-col justify-center pt-10 lg:pt-0"
        >
          <motion.div
            variants={stagger(0.15, 0.06)}
            initial="hidden"
            animate="visible"
          >
            {/* Eyebrow */}
            <motion.div
              variants={maskUp}
              className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              <span className="tag text-frost">{BRAND.discipline}</span>
              <span className="h-px w-10 bg-line" aria-hidden />
              <span className="tag flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal" />
                </span>
                Verfügbar für Q4 2026
              </span>
            </motion.div>

            {/* Claim */}
            <h1 className="font-display text-display font-semibold uppercase">
              {CLAIM_LINES.map((line, index) => (
                <span key={line} className="mask-line">
                  <motion.span
                    variants={maskUp}
                    className={
                      index === CLAIM_LINES.length - 1
                        ? "block gradient-text"
                        : "block"
                    }
                  >
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>

            {/* Sub-claim */}
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
              {BRAND.claimSub.split(" ").map((word) => (
                <span key={word} className="mask-line">
                  <motion.span
                    variants={maskUp}
                    className="block font-mono text-[13px] uppercase tracking-[0.2em] text-steel"
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </div>

            {/* Positioning */}
            <motion.p
              variants={maskUp}
              className="mt-10 max-w-[52ch] text-balance text-[15px] leading-relaxed text-steel md:text-base"
            >
              {BRAND.positioning}
            </motion.p>

            {/* Actions */}
            <motion.div
              variants={maskUp}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <a
                href="#kontakt"
                className="group relative overflow-hidden rounded-full bg-frost px-7 py-3.5 text-[13px] font-medium tracking-wide text-ink transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5"
              >
                <span className="relative z-10">Projekt starten</span>
                <span className="absolute inset-0 -translate-x-full bg-teal transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0" />
              </a>

              {walkable === "unsupported" ? (
                <span className="flex items-center gap-3 rounded-full border border-line/60 px-7 py-3.5 text-[13px] tracking-wide text-steel">
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    <span className="absolute h-2 w-2 rounded-full border border-steel/60" />
                  </span>
                  Raum betreten
                  <span className="tag text-[9px] text-steel/70">
                    NUR AM DESKTOP
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  data-walkable-trigger
                  className="group flex items-center gap-3 rounded-full border border-line px-7 py-3.5 text-[13px] tracking-wide transition-colors duration-500 hover:border-violet hover:text-violet"
                >
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    <span className="absolute h-2 w-2 rounded-full border border-violet transition-transform duration-500 group-hover:scale-150" />
                  </span>
                  Raum betreten
                  <span className="tag text-[9px] text-steel/70 group-hover:text-violet">
                    EXPERIMENTAL
                  </span>
                </button>
              )}
            </motion.div>
          </motion.div>

          {/* Pillar index — sets up the services section before it arrives. */}
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 1, ease: EASE_BRAND }}
            className="mt-14 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6"
          >
            {PILLARS.map((pillar) => (
              <li key={pillar.key} className="flex items-baseline gap-2">
                <span className="tag text-[10px] text-teal">{pillar.index}</span>
                <a
                  href="#leistungen"
                  className="font-mono text-[12px] uppercase tracking-[0.16em] text-steel transition-colors hover:text-frost"
                >
                  {pillar.title}
                </a>
              </li>
            ))}
          </motion.ul>
        </motion.div>

        {/* ---------------------------------------------------------------
            RIGHT — realtime canvas
           --------------------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: EASE_BRAND, delay: 0.2 }}
          style={reducedMotion ? undefined : { scale: canvasScale }}
          className="relative h-[46svh] w-full lg:h-[74svh]"
        >
          <HeroCanvas />
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
        className="pointer-events-none absolute bottom-6 left-6 hidden items-center gap-3 md:flex"
      >
        <span className="tag text-[10px]">Scrollen</span>
        <span className="relative h-10 w-px overflow-hidden bg-line">
          <motion.span
            animate={reducedMotion ? undefined : { y: ["-100%", "100%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-x-0 h-4 bg-teal"
          />
        </span>
      </motion.div>
    </section>
  );
}

export default Hero;
