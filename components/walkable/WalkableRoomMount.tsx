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
   * A phone cannot enter the room — there is no Pointer Lock API to look
   * around with — so it must not pay for the bundle either. The chunk is
   * fetched when this renders, which is why the check sits here and not
   * inside the room: several hundred kilobytes of geometry, materials and
   * controls that would only ever be parsed and thrown away.
   */
  if (walkable !== "supported") return null;

  return <WalkableRoom />;
}

export default WalkableRoomMount;
