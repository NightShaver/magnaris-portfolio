"use client";

import dynamic from "next/dynamic";

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
  return <WalkableRoom />;
}

export default WalkableRoomMount;
