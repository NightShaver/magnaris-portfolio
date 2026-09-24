"use client";

import { useEffect, useState } from "react";

/* ==========================================================================
   HOW DOES THIS DEVICE VISIT THE ROOM?
   --------------------------------------------------------------------------
   Not whether it can any more. It can.

   The desktop room is driven by the Pointer Lock API: the cursor is captured
   and the raw mouse movement becomes the look direction. iOS Safari does not
   ship that API at all, and on Android it only works with a real mouse
   attached, so for a long time the honest answer on a phone was "not here" and
   this hook returned it.

   What changed is that the phone got its own way in — thirteen standing points,
   a tap to move between them, a drag to look around, in lib/tourStations and
   components/walkable/TourPlayer. So the question is no longer whether the
   visitor is allowed in, it is which set of controls to hand them. A phone
   that reported "unsupported" and got a dead end is now a phone that reports
   "touch" and gets a tour.

   Two signals, same as before, read the other way round:
     - a coarse pointer, which is what a touchscreen reports
     - the Pointer Lock API actually being present

   The media query is watched rather than read once, because switching on the
   device toolbar in DevTools — or docking a tablet to a keyboard — flips the
   answer while the page is open.
   ========================================================================== */

/**
 * "unknown" on the server and for the first paint, so nothing has to be
 * guessed before the client can measure. Callers should treat it as "not yet
 * decided" and keep the neutral state on screen: mounting the room during that
 * first render would fetch its bundle before anyone had been asked.
 */
export type WalkableSupport = "unknown" | "pointer" | "touch";

export function useWalkableSupport(): WalkableSupport {
  const [support, setSupport] = useState<WalkableSupport>("unknown");

  useEffect(() => {
    // `?controls=touch` forces the tour on a desktop, which is the only way to
    // review it with a profiler attached — and `?controls=pointer` forces the
    // walk on a tablet with a keyboard. Neither is reachable by accident.
    const override = new URLSearchParams(window.location.search).get("controls");
    if (override === "touch" || override === "pointer") {
      setSupport(override);
      return undefined;
    }

    const query = window.matchMedia("(pointer: coarse)");

    const hasPointerLock =
      "requestPointerLock" in document.documentElement &&
      typeof document.exitPointerLock === "function";

    const resolve = () =>
      setSupport(!query.matches && hasPointerLock ? "pointer" : "touch");

    resolve();
    query.addEventListener("change", resolve);
    return () => query.removeEventListener("change", resolve);
  }, []);

  return support;
}
