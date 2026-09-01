"use client";

import { motion } from "motion/react";

import { BRAND, MEMBERS } from "@/lib/site";
import { fadeUp, stagger } from "@/lib/motion";
import { Logo } from "@/components/ui/Logo";

export function StudioContact() {
  return (
    <>
      <section
        id="studio"
        className="relative mx-auto max-w-[1600px] px-6 py-[12vh] md:px-10"
      >
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="tag">Studio</p>
            <h2 className="mt-4 max-w-[16ch] text-headline font-semibold uppercase tracking-[-0.035em]">
              Zwei Gründer. Eine Verantwortung.
            </h2>
          </div>

          <motion.div
            variants={stagger(0, 0.1)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-15%" }}
            className="flex flex-col gap-8"
          >
            <motion.p
              variants={fadeUp}
              className="max-w-[56ch] text-lg leading-relaxed text-steel"
            >
              {BRAND.positioning} Keine Zwischenebenen, keine Übergaben — die
              Leute, die beraten, bauen auch.
            </motion.p>

            {MEMBERS.map((member) => (
              <motion.div
                key={member.slug}
                variants={fadeUp}
                className="border-t border-line pt-5"
              >
                <p
                  className="font-mono text-[11px] uppercase tracking-[0.18em]"
                  style={{
                    color: member.accent === "teal" ? "#0F8E91" : "#6F63C7",
                  }}
                >
                  {member.name}
                </p>
                <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-steel">
                  {member.detail}
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {member.skills.map((skill) => (
                    <li
                      key={skill}
                      className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel/80"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section
        id="kontakt"
        className="relative mx-auto max-w-[1600px] px-6 pb-[10vh] pt-[8vh] md:px-10"
      >
        <div className="rule mb-16" />
        <p className="tag">Kontakt</p>
        <a
          href="mailto:hallo@magnaris.studio"
          className="mt-8 block text-display font-semibold uppercase leading-[0.9] tracking-[-0.045em] transition-colors duration-500 hover:text-teal"
        >
          Projekt
          <br />
          starten
        </a>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-8">
          <Logo className="h-8 w-auto text-frost" />
          <span className="tag">
            © {new Date().getFullYear()} {BRAND.name} — {BRAND.discipline}
          </span>
          <span className="tag">{BRAND.claim}</span>
        </div>
      </section>
    </>
  );
}

export default StudioContact;
