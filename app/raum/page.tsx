"use client";

import { Suspense, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import * as THREE from "three";

import {
  BakedHall,
  HallEnvironment,
  HallMotion,
  RoomProbe,
  HallEnvironmentBinding,
} from "@/components/walkable/BakedHall";
import {
  EntryGate,
  GazePicker,
  HiddenWall,
  Exhibits,
  HallFittings,
  MarkPlinth,
  TeamExhibits,
} from "@/components/walkable/WalkableRoom";
import manifest from "@/public/room/room.json";
import { EXHIBIT, EXHIBIT_X, ROOM, SECTION } from "@/lib/roomLayout";
import { LiteFill } from "@/components/walkable/TourPlayer";
import type { AimTarget } from "@/lib/aimTarget";
import { type RoomTier, setRoomTier, useRoomTier } from "@/lib/roomQuality";

/* ==========================================================================
   HALL REVIEW
   --------------------------------------------------------------------------
   The baked hall on its own, with nothing in front of it.

   The walkable room is behind a pointer lock, which is right for a visitor and
   useless for looking at a building: it cannot be reviewed on a phone, it
   cannot be screenshotted by a test, and it cannot be opened at a fixed
   viewpoint to compare two bakes. So the hall also renders here, under an
   orbit camera, with the numbers the export wrote next to it.

   Use it after every re-bake. What to look for, in order:
     - the cove band should be the brightest thing in the nave, and continuous
     - each picture bay should be evenly lit corner to corner, not a hot pool
     - the shadow gaps at floor and cornice should read as dark lines
     - the marble should tile without a visible seam at the bay joints
   ========================================================================== */

/** Viewpoints worth comparing between bakes. */
const VIEWS = [
  {
    id: "nave",
    label: "Mittelschiff",
    position: [0, ROOM.eyeHeight, 16] as const,
    target: [0, 2.2, -10] as const,
  },
  {
    id: "aisle",
    label: "Seitenschiff",
    position: [-9.4, ROOM.eyeHeight, 10] as const,
    target: [-12.9, 2.4, 4.25] as const,
  },
  {
    id: "arcade",
    label: "Arkade",
    position: [-4, ROOM.eyeHeight, 6] as const,
    target: [-12.9, 2.4, 4.25] as const,
  },
  {
    // The fittings come out of Blender mirrored in x — see `yawOnLoad` in
    // room.json — so the bench roomLayout puts at -3.4 stands at +3.4 here.
    id: "fittings",
    label: "Möblierung",
    position: [0.9, 1.25, 12.6] as const,
    target: [4.2, 0.5, 8.6] as const,
  },
  {
    // Close enough to judge the stone rather than the silhouette: the shaft
    // carries a unique baked albedo at 134 texels per metre, so this is where
    // tiling artefacts, a flat entasis or a wall with no surface would show.
    id: "pier",
    label: "Säule",
    position: [9.4, 1.6, 6.4] as const,
    target: [7.6, 2.2, 8.5] as const,
  },
  {
    // Straight up in the nave. The ceiling is dark polished stone rather than
    // plaster, so what should be visible here is the cove band reflected in
    // it — not a black void.
    id: "ceiling",
    label: "Decke",
    position: [0, 1.7, 8] as const,
    target: [0, 8, 1] as const,
  },
  {
    // Steeply up from the aisle, across the arcade. The one angle that shows
    // the soffit over an arcade opening, which is a different surface from the
    // clerestory above it and has to read as a different one.
    id: "soffit",
    label: "Sturz",
    position: [10.5, 1.7, 4.25] as const,
    target: [6.6, 4.4, 4.25] as const,
  },
  {
    // Far enough back that the hidden wall stays shut: it opens on proximity,
    // and this is the view for judging whether it reads as wall at all.
    id: "endwall",
    label: "Stirnwand",
    position: [0, 1.8, -11] as const,
    target: [0, 2.7, -ROOM.depth / 2] as const,
  },
  {
    // Inside the trigger radius, so the mechanism runs. The orbit camera counts
    // as a visitor — HiddenWall reads camera.position and nothing else.
    id: "open",
    label: "Wand offen",
    position: [0, 1.7, -14.2] as const,
    target: [0, 2.0, -ROOM.depth / 2 - 1] as const,
  },
  {
    // Close on the left podium, aimed at the middle of the orbit rather than
    // at the plinth. This page has no crosshair but it mounts the same picker
    // the walkable room does, so pointing it into the system is what makes the
    // skill labels fire: the bodies sweep through the centre of the view and
    // name themselves as they pass.
    //
    // What else to look for: a contact shadow under the plinth, the light
    // channel reading as a recess rather than a stripe, and the lectern plate
    // legible from standing height.
    id: "exhibit",
    label: "Exponat",
    position: [-2.3, 1.72, -15.4] as const,
    // Beside the world, not on it: half a metre out along the orbit band, at
    // right angles to the view. Aimed at the middle, the crosshair only ever
    // finds the world — which blocks it on purpose — and the bodies the ray
    // used to reach through it were the ones behind.
    target: [
      -EXHIBIT_X + 0.43,
      EXHIBIT.podiumHeight + EXHIBIT.hoverHeight,
      -ROOM.depth / 2 + EXHIBIT.standoff - 0.35,
    ] as const,
  },
  {
    // The other podium. Anwendungsentwicklung gets a net rather than a system
    // of bodies, and what to look for here is the traffic: six lights running
    // the edges between the nodes, three to five times each over the loop,
    // scaled out at the far end so the return trip is never seen.
    id: "netz",
    label: "Netz",
    position: [2.3, 1.72, -15.4] as const,
    target: [
      EXHIBIT_X,
      EXHIBIT.podiumHeight + EXHIBIT.hoverHeight,
      -ROOM.depth / 2 + EXHIBIT.standoff,
    ] as const,
  },
  {
    // Straight down the plate's own normal. The lectern leans 32 degrees, so
    // this is the only view that shows the skill text the way a reader sees it
    // — and the only one that catches it arriving mirrored, which it did.
    id: "plate",
    label: "Tafel",
    position: [-EXHIBIT_X, 2.02, -ROOM.depth / 2 + 3.49] as const,
    target: [-EXHIBIT_X, 1.0, -ROOM.depth / 2 + 2.85] as const,
  },
  {
    // The portal, from inside, closed. It is the same wall as the one at the
    // far end and it has to read the same way: plaster, hairlines, no door.
    // What is different here is the reveal — the blocks sit flush with the
    // outer face, because this is the side the visitor arrives on, so from in
    // here you are looking 80 mm into the thickness of the wall.
    //
    // EntryGate is not mounted on this page, so nothing plays the clip and the
    // wall stays shut. The mechanism itself is the one under "Wand offen".
    id: "portal",
    label: "Portal",
    position: [0, 1.75, ROOM.depth / 2 - 9] as const,
    target: [0, 2.0, ROOM.depth / 2] as const,
  },
  {
    id: "section",
    label: "Querschnitt",
    position: [0, 4.2, 30] as const,
    target: [0, 3.6, 0] as const,
  },
] as const;

function Facts() {
  const rows: [string, string][] = [
    ["Halle", `${ROOM.width} x ${ROOM.depth} x ${SECTION.naveHeight} m`],
    ["Seitenschiff", `${SECTION.aisleWidth} x ${SECTION.aisleHeight} m`],
    ["Mittelschiff", `${(ROOM.width - 2 * SECTION.aisleWidth - 2 * SECTION.pierWidth).toFixed(1)} x ${SECTION.naveHeight} m`],
    ...manifest.meshes.map(
      (mesh) =>
        [
          `Lightmap ${mesh.name}`,
          `${mesh.lightmap.resolution} px, ${mesh.lightmap.samples} Samples, ` +
            `x${mesh.lightmap.intensity}`,
        ] as [string, string],
    ),
    ["Texturen", Object.keys(manifest.textures).join(", ")],
    ["Materialien", String(manifest.materials.length)],
    ["Hängeplätze", String(manifest.anchors.length)],
  ];

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[11px] leading-relaxed">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-frost/45 uppercase tracking-[0.12em]">{term}</dt>
          <dd className="text-frost/85 tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function RaumPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]>(VIEWS[0]);
  const [stats, setStats] = useState(false);
  /**
   * Bare hall or the whole room.
   *
   * Bare is for judging the bake: nothing in front of the light, nothing
   * casting a shadow the lightmap does not know about. Furnished is for
   * judging the result, and for the two things that are easy to get wrong and
   * invisible from inside a pointer lock — whether the plates really hang on
   * the anchors from the glTF, and whether anything that is not baked is still
   * lit at all now that the room has no runtime lights left.
   */
  const [furnished, setFurnished] = useState(true);
  /**
   * What the centre of the view is pointing at.
   *
   * The walkable room has a crosshair and this page has an orbit camera, but
   * the picker only ever cared about where the camera looks — so it works
   * here unchanged, and the skill labels on the two podiums become reviewable
   * without a pointer lock this page cannot get.
   */
  const [aim, setAim] = useState<AimTarget | null>(null);
  /**
   * The arrival flight, held at zero.
   *
   * EntryGate reads this to decide how far the portal has parted, and on this
   * page nobody is arriving — so the wall stays shut, which is the state worth
   * reviewing. What mounting it buys is the light: the blocks filling that
   * opening move, so they carry no lightmap, and the wash that lights them
   * lives in that component. Without it the portal reviewed as a black
   * rectangle.
   */
  const arrival = useRef(0);
  /**
   * Which tier is on screen.
   *
   * The phone version is not a separate room, it is this one with half-size
   * textures, no roughness maps, no reflection probe and no runtime lights.
   * That makes it reviewable here, on a monitor, which is the only way to judge
   * whether what it drops is worth what it saves — the alternative is holding a
   * phone up next to a laptop and guessing.
   */
  const tier = useRoomTier();

  return (
    <main className="fixed inset-0 bg-ink-900">
      <Canvas
        // `key` remounts the canvas on a view change, which is the cheapest
        // honest way to move an OrbitControls camera to an exact position:
        // setting it from outside fights the controls' own damping.
        key={view.id}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 62, near: 0.05, far: 140, position: [...view.position] }}
        onCreated={({ gl }) => {
          // AgX, not ACES Filmic. Blender grades under AgX and that is what
          // every look decision in this room was made against; shipping ACES
          // meant approving one image and delivering a different one, with
          // more contrast in the darks than the bake was judged with.
          gl.toneMapping = THREE.AgXToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <color attach="background" args={["#070a10"]} />

        <Suspense fallback={null}>
          <BakedHall />
          <HallMotion />
          {/* The lite tier takes all seven runtime lights out of the room, so
              the review has to put its one replacement back or everything that
              moves — the wall blocks, the two sculptures, the mark — reviews as
              a silhouette. */}
          {tier === "lite" ? <LiteFill /> : null}
          <HallEnvironment />
          <RoomProbe />
          <HallEnvironmentBinding />
          {furnished ? (
            <>
              <HallFittings />
              <MarkPlinth />
              <TeamExhibits aim={aim} />
              <GazePicker onAim={setAim} />
              {/* Shut here: it opens on proximity, which needs a walking
                  visitor. What this view is for is the end wall as a whole —
                  door and both founder panels have to fit between the two
                  piers without touching each other or the arcade. */}
              <HiddenWall />
              <EntryGate progress={arrival} />
              <Exhibits />
            </>
          ) : null}
        </Suspense>

        <OrbitControls
          makeDefault
          target={[...view.target]}
          enableDamping
          dampingFactor={0.08}
          maxDistance={60}
          minDistance={0.4}
        />
        {stats ? <Stats /> : null}
      </Canvas>

      {/* Below the site header, which the root layout puts over every page. */}
      <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-between gap-6 p-6">
        <div className="pointer-events-auto rounded-xl border border-frost/10 bg-ink-900/85 p-5 backdrop-blur">
          <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-frost/45">
            Gebackene Halle
          </p>
          <Facts />
          <p className="mt-4 max-w-[34ch] text-[11px] leading-relaxed text-frost/40">
            Aus {manifest.generated}. Ziehen dreht, Scrollen zoomt. Diese Seite
            ist zum Prüfen da, der begehbare Raum liegt auf der Startseite.
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setView(entry)}
              className={`rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition ${
                entry.id === view.id
                  ? "border-frost/70 bg-frost text-ink-900"
                  : "border-frost/15 bg-ink-900/85 text-frost/70 hover:border-frost/40"
              }`}
            >
              {entry.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFurnished((on) => !on)}
            className="mt-2 rounded-full border border-frost/15 bg-ink-900/85 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-frost/70 transition hover:border-frost/40"
          >
            {furnished ? "Nur Halle" : "Möbliert"}
          </button>
          <button
            type="button"
            onClick={() =>
              setRoomTier((tier === "lite" ? "full" : "lite") as RoomTier)
            }
            className="mt-2 rounded-full border border-frost/15 bg-ink-900/85 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-frost/70 transition hover:border-frost/40"
          >
            {tier === "lite" ? "Lite (Handy)" : "Volle Qualität"}
          </button>
          <button
            type="button"
            onClick={() => setStats((on) => !on)}
            className="rounded-full border border-frost/15 bg-ink-900/85 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-frost/70 transition hover:border-frost/40"
          >
            {stats ? "FPS aus" : "FPS an"}
          </button>
        </div>
      </div>
    </main>
  );
}
