"use client";

import dynamic from "next/dynamic";

import { useWalkableSupport } from "@/lib/useWalkableSupport";

/**
 * Client-side mount point for the walkable room.
 *
 * `ssr: false` is only legal inside a client component, and it is what keeps
 * the second three.js context — room shell, exhibits, controls — out of the
 * page's server graph. Without this wrapper Next preloads the whole 3D bundle
 * on first paint even though nobody has asked for the room yet.
 */
const WalkableRoom = dynamic(
  () => import("./WalkableRoom").then((mod) => mod.WalkableRoom),
  { ssr: false },
);

export function WalkableRoomMount() {
  const walkable = useWalkableSupport();

  /**
   * Nothing until the device has been asked what it is.
   *
   * This used to be a gate: a phone had no way to look around and therefore no
   * business downloading the room. It has one now — a tour of standing points
   * instead of a walk — so both answers mount, and what is still worth waiting
   * for is the answer itself. The chunk is fetched the moment this renders, and
   * several hundred kilobytes of geometry and controls should not be fetched on
   * a guess that the first effect is about to correct.
   */
  if (walkable === "unknown") return null;

  return <WalkableRoom />;
}

export default WalkableRoomMount;
