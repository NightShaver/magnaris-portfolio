import type { Transition, Variants } from "motion/react";

/** One easing curve for the entire site — mirrors --ease-brand in CSS. */
export const EASE_BRAND = [0.16, 1, 0.3, 1] as const;
export const EASE_SWIFT = [0.32, 0.72, 0, 1] as const;

export const transition = {
  base: { duration: 0.9, ease: EASE_BRAND } satisfies Transition,
  swift: { duration: 0.5, ease: EASE_SWIFT } satisfies Transition,
};

/** Parent that staggers masked lines / list items. */
export const stagger = (delayChildren = 0, staggerChildren = 0.07): Variants => ({
  hidden: {},
  visible: {
    transition: { delayChildren, staggerChildren },
  },
});

/** Child of `.mask-line` — slides up from behind its own mask. */
export const maskUp: Variants = {
  hidden: { y: "110%", opacity: 0 },
  visible: {
    y: "0%",
    opacity: 1,
    transition: { duration: 1, ease: EASE_BRAND },
  },
};

export const fadeUp: Variants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.8, ease: EASE_BRAND },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 1.2, ease: EASE_BRAND } },
};

/** Splits a string into words so each can sit in its own mask. */
export const splitWords = (value: string) => value.trim().split(/\s+/);
