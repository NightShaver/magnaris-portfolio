"use client";

import { useCallback, useSyncExternalStore } from "react";

/* ==========================================================================
   TWO ROOMS, ONE BUILDING
   --------------------------------------------------------------------------
   The hall is the same geometry, the same bake and the same glTF everywhere.
   What changes between a desktop and a phone is how much of it the GPU is
   asked to resolve per fragment, and how much of it has to be resident.

   The numbers that made this necessary, measured rather than assumed:

     - The full texture set is 2.4 MB over the wire and about 72 MB once
       decoded, because a texture in GPU memory is uncompressed RGBA plus its
       mip chain. iOS Safari does not slow down at that figure, it discards the
       tab. The lite set is 0.5 MB and 19 MB.
     - The room carries seven runtime lights, for the wall blocks, the two
       sculptures and the mark — everything that moves and therefore has no
       lightmap. three.js compiles the light count into every material's
       shader, so all seven are paid for on every fragment of every wall, forty
       metres away from any of them. On lite there are two, moved to wherever
       the visitor is standing.
     - The reflection probe renders six 512 faces at load. On a desktop that is
       a frame; on a phone it is a visible stall before the room appears, and
       what it buys is a sheen at 0.4 strength on a floor being looked at from
       a fixed station.

   None of this is a different room. It is the same room with the things the
   screen cannot show anyway turned off.

   WHY NOT REACT CONTEXT

   Both the room's shell and the components inside the <Canvas> need the answer,
   and the pieces inside are reached through a different reconciler. Rather than
   depend on whether context crosses that boundary in this version of
   react-three-fiber, the tier lives in a one-value store: set once before the
   canvas mounts, read with useSyncExternalStore, identical on both sides.
   ========================================================================== */

export type RoomTier = "full" | "lite";

/**
 * What each tier asks for.
 *
 * Everything that differs between a phone and a desktop is one of these
 * fields, so there is one place to look when the phone version is wrong and
 * one place to change when a phone three years from now can afford more.
 */
export type RoomQuality = {
  tier: RoomTier;
  /** Subdirectory of public/room/ the textures come from. */
  textureDir: string;
  /** Normal maps on the tiling materials. Dropped surfaces read flatter. */
  normalMaps: boolean;
  /**
   * Roughness maps on the tiling materials.
   *
   * Off on lite, where the scalar from the manifest carries the surface on its
   * own. It is the cheapest of the three to lose: the variation it adds shows
   * in a grazing highlight across a large surface, and a station-bound visitor
   * on a 390 px screen is not looking down the floor at a grazing angle.
   */
  roughnessMaps: boolean;
  /**
   * The cube-rendered reflection probe, and with it the environment map on the
   * baked surfaces.
   */
  probe: boolean;
  /** Ceiling on the device pixel ratio. */
  dprMax: number;
  /**
   * Frames per second the room is allowed to draw.
   *
   * Not a performance measure by itself — a phone that can hold 60 would hold
   * it. It is a thermal one: a permanently running render loop on a handheld
   * device throttles the whole SoC within a couple of minutes, and a room that
   * starts smooth and degrades is worse than one that was always 30.
   */
  fpsCap: number;
};

const FULL: RoomQuality = {
  tier: "full",
  textureDir: "",
  normalMaps: true,
  roughnessMaps: true,
  probe: true,
  dprMax: 1.75,
  fpsCap: 0,
};

const LITE: RoomQuality = {
  tier: "lite",
  textureDir: "lite/",
  normalMaps: true,
  roughnessMaps: false,
  probe: false,
  // Two, and the reason it is not lower is that this room is mostly pictures.
  //
  // It was 1.25 for one build, which on a 390 point screen is 488 pixels
  // across — and a case capture standing two metres away then filled about
  // three hundred of them and was stretched back up to nine hundred by the
  // display. The screenshots read as pixelated, which for a portfolio is the
  // one thing they may not be.
  //
  // Two costs 2.5 times the fragments of 1.25 and the room can afford it,
  // because of what the tour does rather than despite it: the frame rate is
  // capped at 30, and parked at a station — which is where a picture is
  // actually read — nothing moves and the loop falls to five. The expensive
  // frames are the ones during a drag, and those are the ones nobody is
  // studying.
  dprMax: 2,
  fpsCap: 30,
};

export const QUALITY: Record<RoomTier, RoomQuality> = { full: FULL, lite: LITE };

/* --------------------------------------------------------------------------
   The store.
   -------------------------------------------------------------------------- */
let current: RoomTier = "full";
const listeners = new Set<() => void>();

/**
 * Set the tier. Called once by whoever is about to mount the room, before the
 * canvas exists, from a power profile or a query parameter.
 *
 * Changing it while the room is open is legal and costs a reload of the
 * textures — useful when reviewing the lite tier on a desktop, and not
 * something a visitor can trigger.
 */
export function setRoomTier(next: RoomTier) {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const read = () => current;

/** The current tier. Safe on the server, where it reads "full". */
export function useRoomTier(): RoomTier {
  return useSyncExternalStore(subscribe, read, read);
}

/** The current tier's settings. */
export function useRoomQuality(): RoomQuality {
  const tier = useRoomTier();
  return QUALITY[tier];
}

/**
 * The tier as it should be for this device, and a setter that applies it.
 *
 * `?quality=lite` or `?quality=full` on the URL wins, so the phone version can
 * be looked at on a desktop with a real GPU profiler attached. Without it the
 * answer comes from the power profile the caller passes in, which is what
 * lib/useLowPower measured.
 */
export function useTierFromProfile() {
  return useCallback((low: boolean) => {
    const override = new URLSearchParams(window.location.search).get("quality");
    if (override === "lite" || override === "full") {
      setRoomTier(override);
      return override as RoomTier;
    }
    const tier: RoomTier = low ? "lite" : "full";
    setRoomTier(tier);
    return tier;
  }, []);
}
