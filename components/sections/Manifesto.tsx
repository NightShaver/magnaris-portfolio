"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

import { BRAND } from "@/lib/site";

const WORDS = BRAND.principle.split(" ");

/**
 * The breath between the hero and the services. A single sentence that
 * de-fogs word by word as it scrolls through the viewport.
 */
export function Manifesto() {
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start 0.85", "end 0.35"],
  });

  return (
    <section
      ref={section}
      id="manifest"
      className="relative mx-auto max-w-[1600px] px-6 py-[18vh] md:px-10"
    >
      <p className="tag mb-10">Haltung</p>
      <p className="flex max-w-[24ch] flex-wrap gap-x-[0.3em] text-headline font-semibold leading-[1.02] tracking-[-0.03em]">
        {WORDS.map((word, index) => {
          const start = index / WORDS.length;
          const end = start + 1 / WORDS.length;
          return <Word key={`${word}-${index}`} progress={scrollYProgress} range={[start, end]}>{word}</Word>;
        })}
      </p>
    </section>
  );
}

function Word({
  children,
  progress,
  range,
}: {
  children: string;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return <motion.span style={{ opacity }}>{children}</motion.span>;
}

export default Manifesto;
