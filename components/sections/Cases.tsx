"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { CASES } from "@/lib/site";
import { fadeUp, stagger } from "@/lib/motion";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";

const CaseCanvas = dynamic(
  () => import("./CaseCanvas").then((mod) => mod.CaseCanvas),
  { ssr: false },
);

/**
 * The work index.
 *
 * Rows are plain anchors — hover state lives in refs so moving the mouse
 * never re-renders the list; only the WebGL plate reacts, at frame rate.
 * On touch devices and under reduced-motion the canvas is not mounted at all
 * and the section degrades to a clean typographic index.
 */
export function Cases() {
  const container = useRef<HTMLDivElement>(null);
  const activeIndex = useRef<number>(-1);
  const pointer = useRef({ x: 0, y: 0 });

  const reducedMotion = usePrefersReducedMotion();
  const [canRender, setCanRender] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setCanRender(window.matchMedia("(pointer: fine)").matches);
  }, []);

  const handleMove = (event: React.MouseEvent) => {
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds) return;
    pointer.current.x = event.clientX - bounds.left;
    pointer.current.y = event.clientY - bounds.top;
  };

  const showCanvas = canRender && !reducedMotion;

  return (
    <section
      id="arbeiten"
      className="relative mx-auto max-w-[1600px] px-6 py-[12vh] md:px-10"
    >
      <div className="mb-14 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="tag">Ausgewählte Arbeiten</p>
          <h2 className="mt-4 text-headline font-semibold uppercase tracking-[-0.035em]">
            Cases
          </h2>
        </div>
        <p className="tag">
          {label ?? `${CASES.length} Projekte / 2024 — 2025`}
        </p>
      </div>

      <div
        ref={container}
        onMouseMove={showCanvas ? handleMove : undefined}
        onMouseLeave={() => {
          activeIndex.current = -1;
          setLabel(null);
        }}
        className="relative"
      >
        {/* Distortion plate. Sits above the rows, ignores every event. */}
        {showCanvas && (
          <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
            <CaseCanvas activeIndex={activeIndex} pointer={pointer} />
          </div>
        )}

        <motion.ul
          variants={stagger(0, 0.06)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-12%" }}
          className="relative z-10"
        >
          {CASES.map((entry, index) => (
            <motion.li key={entry.client} variants={fadeUp}>
              <a
                href={entry.url}
                target="_blank"
                rel="noreferrer noopener"
                onMouseEnter={() => {
                  activeIndex.current = index;
                  setLabel(`${entry.index} / ${entry.client}`);
                }}
                onFocus={() => setLabel(`${entry.index} / ${entry.client}`)}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-6 border-b border-line py-8 transition-colors duration-500 hover:border-teal md:gap-10 md:py-10"
              >
                <span className="tag transition-colors group-hover:text-teal">
                  {entry.index}
                </span>

                <span className="flex flex-col gap-2 md:flex-row md:items-baseline md:gap-6">
                  <span className="text-[clamp(1.6rem,3.4vw,3rem)] font-semibold uppercase leading-none tracking-[-0.035em] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-3">
                    {entry.client}
                  </span>
                  <span className="text-sm text-steel">{entry.title}</span>
                </span>

                <span className="flex items-center gap-4">
                  <span className="tag hidden sm:inline">
                    {entry.disciplines.join(" / ")}
                  </span>
                  <span className="tag">{entry.year}</span>
                  <span
                    aria-hidden
                    className="inline-block transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1 group-hover:-translate-y-1"
                  >
                    ↗
                  </span>
                </span>
              </a>
            </motion.li>
          ))}
        </motion.ul>
      </div>

      <p className="tag mt-8">
        Plates werden prozedural erzeugt — echte Captures nach
        <span className="text-frost"> /public/cases </span>
        legen und in lib/site.ts verweisen.
      </p>
    </section>
  );
}

export default Cases;
