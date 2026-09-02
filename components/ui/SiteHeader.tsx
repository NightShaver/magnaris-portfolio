"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";

import { BRAND } from "@/lib/site";
import { EASE_BRAND } from "@/lib/motion";
import { Logo } from "@/components/ui/Logo";
import { useWalkableSupport } from "@/lib/useWalkableSupport";

const NAV = [
  { label: "Leistungen", href: "#leistungen" },
  { label: "Arbeiten", href: "#arbeiten" },
  { label: "Ablauf", href: "#ablauf" },
  { label: "Studio", href: "#studio" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const { scrollY } = useScroll();
  const [condensed, setCondensed] = useState(false);
  const [time, setTime] = useState<string>("");
  const walkable = useWalkableSupport();

  useMotionValueEvent(scrollY, "change", (value) => {
    setCondensed(value > 64);
  });

  // Local studio time — small signal of a real team behind the site.
  useEffect(() => {
    const tick = () =>
      setTime(
        new Intl.DateTimeFormat("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Berlin",
        }).format(new Date()),
      );
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: EASE_BRAND, delay: 0.2 }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={[
          "mx-auto flex items-center justify-between gap-6 px-6 transition-all duration-500 md:px-10",
          condensed
            // backdrop-filter re-samples everything behind the bar on every
            // scrolled frame. Phones get an opaque bar instead, which looks
            // near-identical over this palette and costs nothing.
            ? "h-14 border-b border-line/70 bg-ink/95 md:bg-ink/70 md:backdrop-blur-xl"
            : "h-20 border-b border-transparent bg-transparent",
        ].join(" ")}
      >
        <a href="#top" className="group flex items-center gap-3">
          <Logo className="h-6 w-auto text-frost transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-[-6deg]" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            {BRAND.name}
          </span>
          <span className="tag hidden transition-colors group-hover:text-teal sm:inline">
            {BRAND.discipline}
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Hauptnavigation">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group relative text-[13px] text-steel transition-colors hover:text-frost"
            >
              {item.label}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-teal transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <span className="tag hidden lg:inline">DE / {time} MEZ</span>
          {walkable !== "unsupported" && (
            <button
              type="button"
              data-walkable-trigger
              className="tag hidden transition-colors hover:text-violet md:inline"
            >
              Raum
            </button>
          )}
          <a
            href="#kontakt"
            className="rounded-full border border-line px-4 py-2 text-[12px] tracking-wide transition-colors duration-300 hover:border-teal hover:text-teal"
          >
            Projekt starten
          </a>
        </div>
      </div>
    </motion.header>
  );
}
