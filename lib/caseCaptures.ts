import * as THREE from "three";

import { CASES } from "./site";

/* ==========================================================================
   THE CASE CAPTURES
   --------------------------------------------------------------------------
   Loading the seven project screenshots that hang in the walkable hall.

   WHY NOT drei's useTexture

   Because of what it does when a load fails, which is throw. A throw inside
   the Canvas is not a missing picture: React unmounts the subtree, R3F tears
   the renderer down with it, and the room goes black with nothing in the
   console — the exact failure this project has already spent a day on once.

   The trigger does not have to be a missing file. A capture that is on disk
   and served correctly still fails if its request is cancelled, and the room
   opens by firing seven JPEGs, a 315 KB glTF and sixteen textures at the dev
   server in the same tick. One reset connection was enough to put a Next error
   overlay over the whole hall.

   So a failure resolves to null instead of throwing, and the wall hangs the
   drawn placeholder it already has for unfilled slots. A picture goes missing;
   the room does not.

   WHY A MODULE-LEVEL CACHE

   Two reasons. The loads start at import, before anything mounts, so a
   remount cannot orphan a request that is already in flight. And the textures
   outlive the component: the visitor leaves the room and comes back, and the
   captures are still there rather than being fetched and decoded again.

   Deliberately never disposed. These are seven images for the lifetime of the
   page, which is what drei's cache did too — and a disposed texture in a cache
   that still hands it out is worse than a few megabytes held.
   ========================================================================== */

const pending = new Map<string, Promise<THREE.Texture | null>>();

function capture(url: string): Promise<THREE.Texture | null> {
  let promise = pending.get(url);
  if (promise) return promise;

  promise = new Promise<THREE.Texture | null>((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        // Set here rather than in a layout effect on the other side: by the
        // time the component renders, the texture is already correct, so
        // there is no frame where a capture is shown in the wrong space.
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => {
        console.warn(
          `[Exhibits] ${url} konnte nicht geladen werden. ` +
            "Der Platz bekommt die gezeichnete Platte.",
        );
        resolve(null);
      },
    );
  });

  pending.set(url, promise);
  return promise;
}

let settled: (THREE.Texture | null)[] | null = null;
let inFlight: Promise<void> | null = null;

function start(): Promise<void> {
  inFlight ??= Promise.all(CASES.map((entry) => capture(entry.image))).then(
    (textures) => {
      settled = textures;
    },
  );
  return inFlight;
}

/**
 * Begin loading. Call from module scope, so the requests are in flight before
 * the first render rather than being started and abandoned by one.
 *
 * Does nothing on the server, and it has to say so out loud. This site is a
 * static export: every route is prerendered in Node, /raum imports the room
 * components directly rather than through a dynamic boundary, and so this
 * module's top level runs during the build. THREE.TextureLoader reaches for
 * `document` the moment it is asked for an image, and the whole export fell
 * over with "document is not defined" — at prerender time, not in any browser.
 */
export function preloadCaseCaptures(): void {
  if (typeof document === "undefined") return;
  void start();
}

/**
 * The captures, or null for each one that did not arrive.
 *
 * Suspends by throwing the pending promise, which is what every suspense
 * loader in this stack does — drei's useTexture included, through
 * suspend-react. It is the pattern R3F's reconciler is known to handle.
 */
export function readCaseCaptures(): (THREE.Texture | null)[] {
  if (settled) return settled;
  if (typeof document === "undefined") return CASES.map(() => null);
  throw start();
}
