import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * Brand typography
 * ----------------
 * The brandboard specifies Inter Display (headlines), Go Mono (technical
 * details/tags) and Gillius (accents). None of those three are served by
 * Google Fonts, so this file ships in two modes:
 *
 *  1. ACTIVE (below): metric-compatible web fallbacks so `npm run dev` works
 *     on a clean checkout without any licensed binaries in the repo.
 *  2. LICENSED: drop the real files into /fonts and swap in the `localFont`
 *     block at the bottom. The CSS variable names never change, so nothing
 *     else in the codebase has to be touched.
 */

export const fontDisplay = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-display",
  axes: ["opsz"],
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-go-mono",
});

// Gillius has no Google equivalent — until the licensed file is in place it
// intentionally resolves to the display family via the CSS fallback chain.
export const fontAccent = { variable: "" } as const;

export const fontVariables = [
  fontDisplay.variable,
  fontMono.variable,
  fontAccent.variable,
]
  .filter(Boolean)
  .join(" ");

/* ------------------------------------------------------------------------
   LICENSED SETUP — uncomment once /fonts contains the real files.

import localFont from "next/font/local";

export const fontDisplay = localFont({
  variable: "--font-inter-display",
  display: "swap",
  src: [
    { path: "../fonts/InterDisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/InterDisplay-Medium.woff2",  weight: "500", style: "normal" },
    { path: "../fonts/InterDisplay-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/InterDisplay-Bold.woff2",    weight: "700", style: "normal" },
  ],
});

export const fontMono = localFont({
  variable: "--font-go-mono",
  display: "swap",
  src: [
    { path: "../fonts/GoMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GoMono-Bold.woff2",    weight: "700", style: "normal" },
  ],
});

export const fontAccent = localFont({
  variable: "--font-gillius",
  display: "swap",
  src: [{ path: "../fonts/Gillius-Regular.woff2", weight: "400", style: "normal" }],
});
------------------------------------------------------------------------ */
