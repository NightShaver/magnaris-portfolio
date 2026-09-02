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

export type PowerProfile = "unknown" | "low" | "full";

/**
 * The three-state answer. "unknown" lasts until the first effect runs, and a
 * caller that is about to mount something expensive has to wait for it —
 * mounting a dynamic canvas during that first render fetches its bundle, and
 * a phone would have paid for it before ever being asked.
 */
export function usePowerProfile(): PowerProfile {
  const [profile, setProfile] = useState<PowerProfile>("unknown");

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");

    const resolve = () => {
      const memory = (navigator as NavigatorWithMemory).deviceMemory;
      const cores = navigator.hardwareConcurrency;

      const low =
        query.matches ||
        (typeof memory === "number" && memory <= 4) ||
        (typeof cores === "number" && cores <= 4);

      setProfile(low ? "low" : "full");
    };

    resolve();
    query.addEventListener("change", resolve);
    return () => query.removeEventListener("change", resolve);
  }, []);

  return profile;
}

/**
 * The same answer as a plain boolean, for callers that only tune something
 * already on screen — a pixel ratio, a material, whether a loop starts.
 * "unknown" reads as false there: the first frame runs at full quality, and
 * downgrading a frame later is invisible while upgrading is not.
 */
export function useLowPower(): boolean {
  return usePowerProfile() === "low";
}
