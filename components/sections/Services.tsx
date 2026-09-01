"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";

import { PILLARS, type Pillar } from "@/lib/site";
import { EASE_BRAND, fadeUp, stagger } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { Logo } from "@/components/ui/Logo";

const ACCENT: Record<Pillar["accent"], string> = {
  teal: "#0F8E91",
  violet: "#6F63C7",
};

/**
 * The four pillars as a pinned scroll sequence.
 *
 * One viewport-high stage stays put while the page scrolls four screens past
 * it; the pillar index is derived from scroll progress, so the transition is
 * always in sync with the scrollbar instead of running on its own timer.
 *
 * Below `lg` the pin is dropped entirely — pinning on a phone fights the
 * browser's own address-bar behaviour and costs more than it delivers.
 */
export function Services() {
  const section = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const index = Math.min(
      PILLARS.length - 1,
      Math.max(0, Math.floor(value * PILLARS.length)),
    );
    setActive(index);
  });

  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const pillar = PILLARS[active];
  const accent = ACCENT[pillar.accent];

  return (
    <section id="leistungen" ref={section} className="relative">
      {/* ---------------- pinned stage (lg and up) ---------------- */}
      <div className="hidden lg:block" style={{ height: `${PILLARS.length * 100}vh` }}>
        <div className="sticky top-0 h-screen overflow-hidden">
          {/* Accent wash, retinted per pillar. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -left-[10%] top-1/2 h-[80vh] w-[60vw] -translate-y-1/2 rounded-full blur-[160px]"
            animate={{ backgroundColor: accent, opacity: 0.16 }}
            transition={{ duration: 1.1, ease: EASE_BRAND }}
          />

          <div className="mx-auto flex h-full max-w-[1600px] flex-col px-10 pt-24">
            <header className="flex items-end justify-between gap-6 border-b border-line pb-6">
              <div>
                <p className="tag">Leistungen</p>
                <h2 className="mt-3 text-[clamp(1.8rem,2.4vw,2.6rem)] font-semibold uppercase tracking-[-0.035em]">
                  Vier Säulen
                </h2>
              </div>
              <p className="max-w-[40ch] text-sm leading-relaxed text-steel">
                Konzept, Gestaltung, Entwicklung und Betrieb in einer Hand —
                von der Landingpage bis zum begehbaren 3D-Raum.
              </p>
            </header>

            <div className="grid flex-1 grid-cols-[auto_1fr_1fr] items-center gap-16">
              {/* Rail */}
              <ol className="flex h-[46vh] flex-col justify-between">
                {PILLARS.map((entry, index) => (
                  <li key={entry.key} className="flex items-center gap-4">
                    <span
                      className="h-px transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{
                        width: index === active ? 42 : 18,
                        background: index === active ? ACCENT[entry.accent] : "#253044",
                      }}
                    />
                    <span
                      className="font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-500"
                      style={{ color: index === active ? "#F3F6F8" : "#8D98A6" }}
                    >
                      {entry.index} {entry.title}
                    </span>
                  </li>
                ))}
              </ol>

              {/* Copy */}
              <div className="relative h-[46vh]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={pillar.key}
                    initial={reducedMotion ? false : { opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -20 }}
                    transition={{ duration: 0.55, ease: EASE_BRAND }}
                    className="absolute inset-0 flex flex-col justify-center"
                  >
                    <p className="tag" style={{ color: accent }}>
                      {pillar.index} / {pillar.subtitle}
                    </p>
                    <h3 className="mt-5 text-[clamp(3rem,6.5vw,7rem)] font-semibold uppercase leading-[0.9] tracking-[-0.045em]">
                      {pillar.title}
                    </h3>
                    <p className="mt-7 max-w-[46ch] text-base leading-relaxed text-steel">
                      {pillar.body}
                    </p>

                    <ul className="mt-9 max-w-[46ch]">
                      {pillar.capabilities.map((capability, index) => (
                        <motion.li
                          key={capability}
                          initial={reducedMotion ? false : { opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.5,
                            ease: EASE_BRAND,
                            delay: 0.12 + index * 0.06,
                          }}
                          className="flex items-center gap-3 border-t border-line py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-steel"
                        >
                          <span
                            className="h-1 w-1 rounded-full"
                            style={{ background: accent }}
                          />
                          {capability}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Mark, retinted and turned per pillar. */}
              <div className="relative flex h-[46vh] items-center justify-center">
                <motion.div
                  aria-hidden
                  animate={{
                    rotate: active * -6,
                    scale: 1 + active * 0.02,
                  }}
                  transition={{ duration: 1, ease: EASE_BRAND }}
                  className="relative w-[62%]"
                  style={{ color: "#1B2434" }}
                >
                  <Logo className="w-full" />
                  <motion.div
                    className="absolute inset-0 blur-[60px]"
                    animate={{ backgroundColor: accent, opacity: 0.18 }}
                    transition={{ duration: 1, ease: EASE_BRAND }}
                  />
                </motion.div>

                <span className="tag absolute bottom-0 right-0 text-[10px]">
                  {String(active + 1).padStart(2, "0")} / 0{PILLARS.length}
                </span>
              </div>
            </div>

            {/* Progress */}
            <div className="relative h-px w-full bg-line">
              <motion.span
                className="absolute inset-y-0 left-0 w-full origin-left"
                style={{ scaleX: railScale, background: accent }}
              />
            </div>
            <div className="h-8" />
          </div>
        </div>
      </div>

      {/* ---------------- stacked fallback (below lg) ---------------- */}
      <div className="mx-auto max-w-[1600px] px-6 py-[12vh] lg:hidden">
        <p className="tag">Leistungen</p>
        <h2 className="mt-3 text-headline font-semibold uppercase tracking-[-0.035em]">
          Vier Säulen
        </h2>

        <motion.div
          variants={stagger(0, 0.08)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
          className="mt-10 flex flex-col gap-px bg-line"
        >
          {PILLARS.map((entry) => (
            <motion.article key={entry.key} variants={fadeUp} className="bg-ink py-8">
              <div className="flex items-baseline justify-between gap-4">
                <span className="tag" style={{ color: ACCENT[entry.accent] }}>
                  {entry.index}
                </span>
                <span className="tag">{entry.subtitle}</span>
              </div>
              <h3 className="mt-5 text-[2.4rem] font-semibold uppercase leading-none tracking-[-0.04em]">
                {entry.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-steel">{entry.body}</p>
              <ul className="mt-5">
                {entry.capabilities.map((capability) => (
                  <li
                    key={capability}
                    className="border-t border-line/70 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-steel"
                  >
                    {capability}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default Services;
