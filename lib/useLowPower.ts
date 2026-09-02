"use client";

import { useEffect, useState } from "react";

/* ==========================================================================
   LOW-POWER PROFILE
   --------------------------------------------------------------------------
   One question, asked once: should this device get the cheap version?

   A phone loses on three fronts at the same time — a GPU that pays dearly for
   full-screen passes and large blurs, a CPU that has to parse every kilobyte
   of JavaScript, and a thermal budget that a permanently running render loop
   eats through. So the answer here does not gate a single effect; it picks a
   whole profile: no postprocessing, a lower pixel ratio, a smaller
   environment map, no smooth-scroll loop, no room bundle.

   The signals, in order of how much they say:
     - a coarse pointer, which is what a touchscreen reports
     - `deviceMemory`, when the browser exposes it (Chromium does)
     - `hardwareConcurrency`, as the last resort

   A desktop with a touchscreen is misclassified by the first signal. That is
   the trade accepted here: it still gets a correct, complete page, just a
   quieter one.
   ========================================================================== */

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

/**
 * False on the server and for the first paint, so nothing has to be guessed
 * before the client can measure. Treat the first render as "full quality" —
 * downgrading a frame later is invisible, while upgrading is not.
 */
export function useLowPower(): boolean {
  const [low, setLow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");

    const resolve = () => {
      const memory = (navigator as NavigatorWithMemory).deviceMemory;
      const cores = navigator.hardwareConcurrency;

      setLow(
        query.matches ||
          (typeof memory === "number" && memory <= 4) ||
          (typeof cores === "number" && cores <= 4),
      );
    };

    resolve();
    query.addEventListener("change", resolve);
    return () => query.removeEventListener("change", resolve);
  }, []);

  return low;
}
