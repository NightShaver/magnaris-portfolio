"use client";

import { motion } from "motion/react";

import { fadeUp, stagger } from "@/lib/motion";

const STEPS = [
  {
    index: "01",
    title: "Richtung",
    duration: "1 — 2 Wochen",
    body: "Ziele, Zielgruppe, Wettbewerb, technische Randbedingungen. Am Ende steht eine Entscheidung, kein Stimmungsbild.",
  },
  {
    index: "02",
    title: "Konzept",
    duration: "2 — 3 Wochen",
    body: "Informationsarchitektur, Wireframes, Designsystem. Kritische Interaktionen werden als Prototyp gebaut, nicht beschrieben.",
  },
  {
    index: "03",
    title: "Bau",
    duration: "4 — 10 Wochen",
    body: "Frontend, Backend, 3D-Pipeline parallel. Wöchentliche Builds auf einer echten Staging-URL statt Screenshots im Chat.",
  },
  {
    index: "04",
    title: "Betrieb",
    duration: "laufend",
    body: "Launch, Monitoring, Backups, Weiterentwicklung. Feste Reaktionszeiten, ein Ansprechpartner.",
  },
];

const STACK = [
  "Next.js",
  "React Three Fiber",
  "WebGL / WebGPU",
  "TypeScript",
  "GSAP",
  "Blender",
  "Unreal",
  "Node",
  "PostgreSQL",
  "Docker",
  "Cloudflare",
  "Figma",
];

export function Process() {
  return (
    <section
      id="ablauf"
      className="relative mx-auto max-w-[1600px] px-6 py-[12vh] md:px-10"
    >
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="tag">Ablauf</p>
          <h2 className="mt-4 max-w-[14ch] text-headline font-semibold uppercase tracking-[-0.035em]">
            Vier Schritte
          </h2>
          <p className="mt-6 max-w-[38ch] text-sm leading-relaxed text-steel">
            Kein Wasserfall, keine Blackbox. Jede Phase endet mit etwas, das
            man ansehen und benutzen kann.
          </p>
        </div>

        <motion.ol
          variants={stagger(0, 0.09)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-12%" }}
        >
          {STEPS.map((step) => (
            <motion.li
              key={step.index}
              variants={fadeUp}
              className="group grid grid-cols-[auto_1fr] gap-6 border-t border-line py-8 md:gap-12"
            >
              <span className="tag pt-2 transition-colors group-hover:text-teal">
                {step.index}
              </span>
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="text-[clamp(1.5rem,2.4vw,2.2rem)] font-semibold uppercase tracking-[-0.03em]">
                    {step.title}
                  </h3>
                  <span className="tag">{step.duration}</span>
                </div>
                <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-steel">
                  {step.body}
                </p>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>

      {/* Stack marquee — pure CSS, duplicated once for a seamless loop. */}
      <div className="mt-24 overflow-hidden border-y border-line py-5">
        <div className="marquee flex w-max gap-10">
          {[...STACK, ...STACK].map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-steel"
            >
              {item}
              <span className="ml-10 text-teal">/</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Process;
