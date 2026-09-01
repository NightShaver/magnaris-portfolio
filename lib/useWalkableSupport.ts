"use client";

import { useEffect, useState } from "react";

/* ==========================================================================
   CAN THIS DEVICE WALK THE ROOM?
   --------------------------------------------------------------------------
   The room is driven by the Pointer Lock API: the cursor is captured, and the
   raw mouse movement becomes the look direction. iOS Safari does not ship
   that API at all, and on Android it only works with a real mouse attached.
   A phone therefore cannot look around — it could walk with an on-screen
   stick, but it would be stuck staring straight ahead.

   So the honest answer on a touch device is "not here", and it has to be
   given before the room opens. An entrance that leads into a dead end is
   worse than a door that says desktop only.

   Two signals, both required:
     - a fine pointer, which is what a mouse or trackpad reports
     - the Pointer Lock API actually being present

   The media query is watched rather than read once, because switching on the
   device toolbar in DevTools — or docking a tablet to a keyboard — flips the
   answer while the page is open.
   ========================================================================== */

export type WalkableSupport = "unknown" | "supported" | "unsupported";

/**
 * Returns "unknown" on the server and for the first paint, so nothing has to
 * be guessed before the client can measure. Callers should treat "unknown"
 * as "not yet decided" and keep the neutral state on screen.
 */
export function useWalkableSupport(): WalkableSupport {
  const [support, setSupport] = useState<WalkableSupport>("unknown");

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");

    const hasPointerLock =
      "requestPointerLock" in document.documentElement &&
      typeof document.exitPointerLock === "function";

    const resolve = () =>
      setSupport(!query.matches && hasPointerLock ? "supported" : "unsupported");

    resolve();
    query.addEventListener("change", resolve);
    return () => query.removeEventListener("change", resolve);
  }, []);

  return support;
}
