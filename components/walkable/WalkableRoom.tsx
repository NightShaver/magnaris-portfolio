"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  KeyboardControls,
  PointerLockControls,
  RoundedBox,
  useKeyboardControls,
} from "@react-three/drei";
import * as THREE from "three";

import { BRAND_COLORS } from "@/components/hero/HeroScene";
import {
  BakedHall,
  HallEnvironment,
  HallMotion,
  RoomProbe,
  HallEnvironmentBinding,
  useHall,
} from "@/components/walkable/BakedHall";
import { CASES, MEMBERS } from "@/lib/site";
import {
  FRAME,
  COLUMN_RADIUS,
  COLUMN_X,
  EXHIBIT,
  EXHIBIT_X,
  HIDDEN_WALL,
  NAVE_HALF_WIDTH,
  PILASTER_Z,
  PORTAL,
  ROOM,
  SECTION,
  SLOTS,
  WALL_THICKNESS,
  WASH,
  WASH_HEIGHT,
  WASH_LENGTH,
} from "@/lib/roomLayout";
import {
  createCaptionTexture,
  createPlaceholderCaption,
  createPlaceholderPlate,
} from "@/lib/caseTexture";
import { createSignTexture } from "@/lib/signTexture";
import { preloadCaseCaptures, readCaseCaptures } from "@/lib/caseCaptures";
import { createSkillPlate } from "@/lib/displayTexture";
import { createPlanetTextures, createWorldTexture } from "@/lib/planetTexture";
import { createSkillLabel, type SkillLabel } from "@/lib/skillLabel";
import { LOGO_PARTS, LOGO_SCALE } from "@/lib/logo";
import { createLogoGeometry } from "@/lib/logoGeometry";
import { EASE_BRAND } from "@/lib/motion";
import { useRoomAmbience } from "@/lib/useRoomAmbience";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useWalkableSupport } from "@/lib/useWalkableSupport";
import type { AimTarget } from "@/lib/aimTarget";
import { useRoomQuality, useTierFromProfile } from "@/lib/roomQuality";
import { usePowerProfile } from "@/lib/useLowPower";
import {
  FrameCadence,
  LiteFill,
  StationMarkers,
  TourPlayer,
  type TourStatus,
  fovFor,
} from "@/components/walkable/TourPlayer";
import { STATIONS, isCramped } from "@/lib/tourStations";

/* ==========================================================================
   THE WALKABLE ROOM
   --------------------------------------------------------------------------
   A first-person gallery that takes over the viewport, so the visitor steps
   out of the 2D page and into the studio's own space.

   What is production-ready here:
     - the 2D <-> 3D handoff (scroll lock, pointer lock, focus, exit paths)
     - the movement model (WASD + mouse look, damped, sprint, head bob)
     - the architecture: single-sided surfaces, reveals, pilasters, cove light
     - the exhibits: the real case captures from /public/cases
     - a hard gate for touch devices, which cannot use pointer lock

   What the technical artist replaces:
     - the built geometry -> an authored GLTF environment
     - the axis-aligned bounds clamp -> real collision
       (three-mesh-bvh raycasts, or a Rapier character controller)
     - the still captures -> looping video textures

   WebXR: wrap the <Canvas> children in @react-three/xr's <XR> and render an
   <XRButton>. The movement code below stays; only the camera source changes.
   ========================================================================== */

/**
 * Start fetching the case captures as soon as this module is evaluated.
 *
 * WalkableRoom is loaded lazily, so this runs the moment the visitor asks for
 * the room and a beat before anything mounts. That ordering is the point: the
 * seven captures, the glTF and sixteen room textures otherwise all leave in
 * the same tick as the first render, and the request that loses that race is
 * the one that comes back as an image error with no message attached.
 */
preloadCaseCaptures();

/** Where the intro flight starts and where it hands over control. */
const INTRO = {
  from: ROOM.depth / 2 + PORTAL.tunnel - 1.5,
  to: ROOM.depth / 2 - 5,
  duration: 2.8,
};

const SPEED = { walk: 3.1, sprint: 5.6, damping: 9 };

const KEY_MAP = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "sprint", keys: ["ShiftLeft", "ShiftRight"] },
];

/**
 * What hangs where.
 *
 * The positions are not computed here any more. They come from
 * lib/roomLayout, which Blender reads through the same file, so the eight
 * slots below are the eight empties baked into the glTF — same order, same
 * coordinates. All this adds is the content: which project fills a slot, and
 * what a slot shows when the case list does not reach it. Whatever is not
 * reached reads as a reserved hanging rather than as bare wall, otherwise the
 * gallery stops mid-sentence halfway down the room.
 */
/** How far a frame stands off the wall face its anchor sits on. */
const FRAME_STANDOFF = 0.08;

/**
 * The two founder panels on the end wall.
 *
 * Their x used to be a hand-picked 6 m, from when the hall was one open
 * 26 m volume and the end wall was clear all the way across. It is not any
 * more: the arcade carries a spandrel from the aisle roof at 4.4 m up to the
 * nave ceiling, standing between x 7.1 and 8.0 for the full length of the
 * building. A panel 3.88 m wide centred at 6 m reaches 7.94, so its top outer
 * corner sat inside that spandrel — and from anywhere but dead centre a pier
 * stood in front of the rest of it.
 *
 * So the position is derived rather than chosen: the panel goes as far out as
 * the clear nave allows and no further.
 */
const PANEL = { width: 3.88, height: 5.08, margin: 0.25 } as const;
const PANEL_X = NAVE_HALF_WIDTH - PANEL.width / 2 - PANEL.margin;

/**
 * The columns of the arcade, as the mover sees them: the radius of the flared
 * foot plus half a metre of shoulder room, which keeps the camera's near plane
 * out of the stone.
 *
 * A circle now, not a box. The arcade used to be square piers and the clamp
 * was two axis-aligned tests each; a round shaft needs one distance, which is
 * both simpler and — unlike the box — exactly the shape of the thing.
 */
const COLUMN_CLEARANCE = 0.5;
const COLUMN_STANDOFF = COLUMN_RADIUS + COLUMN_CLEARANCE;

/**
 * Everything the visitor cannot walk through.
 *
 * A circle each for the arcade's columns, and a capsule for each exhibit — a
 * segment from the podium to the lectern in front of it, with one radius.
 *
 * The capsule replaced two circles, and the reason is that two circles that
 * overlap cannot be resolved by pushing out of each in turn. The podium's
 * circle is 1.14 m and the lectern's 0.82, and their centres are 1.12 apart:
 * they overlap by 84 centimetres. A visitor caught in that lens was pushed out
 * of the podium into the lectern and out of the lectern into the podium, once
 * per frame, and the second push could carry them round to the far side of the
 * first — which from inside reads as being teleported backwards.
 *
 * A capsule has no such region. One distance, one push, and it is also the
 * honest shape for two objects standing in a row.
 *
 * The squares are enclosed by the radius rather than fitted to it, so corners
 * are overstated by a few centimetres. That is the right error: stopped
 * slightly early reads as room to walk round, stopped slightly late reads as a
 * camera inside a plinth.
 */
type Obstacle = {
  x: number;
  z: number;
  /** The far end of the segment. Equal to `z` for anything round. */
  zEnd: number;
  radius: number;
};

const EXHIBIT_Z = -ROOM.depth / 2 + EXHIBIT.standoff;
const OBSTACLES: Obstacle[] = [
  ...PILASTER_Z.flatMap((z) =>
    [-1, 1].map((side) => ({
      x: side * COLUMN_X,
      z,
      zEnd: z,
      radius: COLUMN_STANDOFF,
    })),
  ),
  ...[-1, 1].map((side) => ({
    x: side * EXHIBIT_X,
    z: EXHIBIT_Z,
    zEnd: EXHIBIT_Z + EXHIBIT.lecternOffset,
    // Clears the podium's half diagonal (0.72 m) with a shoulder, and the
    // lectern's (0.39 m) with room to spare.
    radius: 0.95,
  })),
];

const EXHIBITS = SLOTS.map(({ index, side, z, slot }) => {
  const entry = CASES[index] ?? null;
  return {
    entry,
    index,
    side,
    z,
    key: entry ? entry.client : `slot-${index}`,
    /** Continues the case numbering: "07" is the first reserved slot. */
    slot,
  };
});

/* -------------------------------------------------------------------------
   Player — mouse look plus damped WASD movement on a fixed eye height.
   ------------------------------------------------------------------------- */
type ControlsRef = React.RefObject<React.ComponentRef<
  typeof PointerLockControls
> | null>;

function Player({
  controls,
  progress,
  started,
  onLockChange,
  onArrived,
}: {
  controls: ControlsRef;
  /** Shared with <EntryGate>, which opens the leaves from this value. */
  progress: React.RefObject<number>;
  /** The flight only starts once the visitor has taken the controls. */
  started: boolean;
  onLockChange: (locked: boolean) => void;
  onArrived: () => void;
}) {
  const [, getKeys] = useKeyboardControls();
  const intro = progress;
  /** Reused every frame so the walk direction allocates nothing. */
  const heading = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const front = useRef(new THREE.Vector3());
  const side = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 2, INTRO.from);
  }, [camera]);

  /**
   * Every hand-over replays the approach.
   *
   * The progress value belongs to the overlay, which outlives this canvas, so
   * it cannot be trusted to be zero here — a finished flight left it at 1 and
   * the next visit skipped straight past the gate, never reported arrival and
   * left the HUD stuck on "Anflug". Arming it at the moment the visitor takes
   * the controls makes that impossible regardless of how the room was left.
   */
  useEffect(() => {
    if (started) intro.current = 0;
  }, [started, intro]);

  useFrame((state, rawDelta) => {
    // Clamp delta so an alt-tab does not teleport the player across the room.
    const delta = Math.min(rawDelta, 0.05);

    // Hold outside the gate until the visitor locks in, then fly through it.
    // Looking around already works during the approach — only the walking is
    // on rails, and only until the hall is entered.
    if (!started) {
      camera.position.set(0, 2, INTRO.from);
      return;
    }

    if (intro.current < 1) {
      intro.current = Math.min(1, intro.current + delta / INTRO.duration);
      const t = 1 - Math.pow(1 - intro.current, 3);

      camera.position.set(
        0,
        THREE.MathUtils.lerp(2, ROOM.eyeHeight, t),
        THREE.MathUtils.lerp(INTRO.from, INTRO.to, t),
      );

      if (intro.current >= 1) onArrived();
      return;
    }

    const keys = getKeys() as Record<string, boolean>;

    const speed = keys.sprint ? SPEED.sprint : SPEED.walk;

    direction.current.set(
      Number(keys.right) - Number(keys.left),
      0,
      Number(keys.forward) - Number(keys.backward),
    );
    if (direction.current.lengthSq() > 0) direction.current.normalize();

    // Heading from the yaw alone, never from the view direction.
    //
    // This used to flatten getWorldDirection() and normalise what was left,
    // and that has a singularity exactly where a visitor in a gallery spends
    // time: looking up. Near vertical, the horizontal part of the view vector
    // is almost nothing, so normalising it amplifies whatever numerical dust
    // is left into a direction — and it flips sign as the pitch crosses the
    // top. Walking forwards while tilting up to follow a planet sent the
    // visitor backwards, which is what "it spun me 180 degrees" was.
    //
    // The yaw has no such point. PointerLockControls keeps the camera in YXZ,
    // so reading the quaternion back in that order gives the heading directly
    // and the pitch cannot reach it.
    heading.setFromQuaternion(camera.quaternion);
    const yaw = heading.y;
    front.current.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    side.current.set(Math.cos(yaw), 0, -Math.sin(yaw));

    move.current
      .set(0, 0, 0)
      .addScaledVector(front.current, direction.current.z * speed)
      .addScaledVector(side.current, direction.current.x * speed);

    // Exponential damping: instant response, no ice-skating stop.
    velocity.current.lerp(move.current, 1 - Math.exp(-SPEED.damping * delta));
    camera.position.addScaledVector(velocity.current, delta);

    // COLLISION: bounds, the columns of the arcade, and the plinth.
    //
    // Still analytic rather than swept geometry, which is the right size of
    // solution for a hall whose obstacles are eight boxes in known places.
    // What it is not is the old version: that clamped to a rectangle, and the
    // room it was written for had nothing standing in it. Walking through a
    // column is the single thing that would give away that this arcade is a
    // picture rather than a building.
    const halfW = ROOM.width / 2 - ROOM.wallClearance;
    const halfD = ROOM.depth / 2 - 1.2;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfW, halfW);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -halfD, halfD);

    for (const obstacle of OBSTACLES) {
      // Nearest point on the obstacle's spine. For a column the spine is a
      // point and this collapses to the centre.
      const span = obstacle.zEnd - obstacle.z;
      const along =
        span === 0
          ? 0
          : THREE.MathUtils.clamp(
              (camera.position.z - obstacle.z) / span,
              0,
              1,
            );
      const nearZ = obstacle.z + span * along;

      const dx = camera.position.x - obstacle.x;
      const dz = camera.position.z - nearZ;
      const distance = Math.hypot(dx, dz);
      if (distance >= obstacle.radius) continue;
      // Push straight out along the radius, so brushing a column slides the
      // visitor around it instead of stopping them dead.
      const scale = obstacle.radius / (distance || 1e-4);
      camera.position.x = obstacle.x + dx * scale;
      camera.position.z = nearZ + dz * scale;
    }

    const distance = Math.hypot(camera.position.x, camera.position.z);
    if (distance < ROOM.plinthRadius && distance > 0.001) {
      const push = ROOM.plinthRadius / distance;
      camera.position.x *= push;
      camera.position.z *= push;
    }

    // Head bob, scaled by actual speed so standing still is perfectly stable.
    const travel = velocity.current.length();
    const bob = travel > 0.15 ? Math.sin(state.clock.elapsedTime * 11) * 0.022 : 0;
    camera.position.y = ROOM.eyeHeight + bob * (travel / SPEED.walk);
  });

  return (
    <PointerLockControls
      ref={controls}
      onLock={() => onLockChange(true)}
      onUnlock={() => onLockChange(false)}
    />
  );
}

/* -------------------------------------------------------------------------
   Architecture.

   Every surface is its own single-sided plane. The earlier version put an
   inverted box *and* separate floor and ceiling planes in the same place, and
   two coplanar faces at identical depth are exactly what makes a room
   flicker — the GPU has no stable way to decide which one is in front.
   ------------------------------------------------------------------------- */
/**
 * The hall itself is modelled, lit and baked in Blender and loaded as 36 KB of
 * glTF plus a lightmap: floor, walls, aisle ceilings, the arcade, the
 * clerestory and every shadow gap are in that file.
 *
 * What is left here is only what the bake cannot hold — because it moves,
 * because it is content, or because it stands outside the building.
 *
 * Exported so the review page at /raum can put the same fittings in the same
 * hall. A room that can only be inspected from inside a pointer lock cannot be
 * inspected at all.
 */
export function HallFittings() {
  const halfD = ROOM.depth / 2;

  return (
    <group>
      {/*
        The portal: an opening in the wall and a short approach tunnel behind
        it, and nothing else.

        There used to be a steel surround here — jambs, a lintel and a cyan
        line following the reveal — from the days when this was a door with
        leaves that slid. What fills the opening now is six blocks of the same
        plaster as the wall, whose whole purpose is that you cannot see where
        the wall stops. A bolted-on metal frame with a neon strip in it
        announces the opening from thirty metres away and undoes that in one
        move, so it is gone: the reveal is the thickness of the wall, which is
        what a reveal is.
      */}
      <group position={[0, 0, halfD]}>
        {/*
          The approach tunnel, and it begins where the wall ends.

          It used to begin where the wall starts, which put its two side planes
          in exactly the same plane as the portal reveal for the first half
          metre — and its ceiling in the same plane as the underside of the
          lintel. Two coplanar surfaces at identical depth are the one thing a
          depth buffer cannot order, so the edge of the entrance flickered down
          its whole height. Only that one: it is the only opening in the
          building with anything behind it.

          The two side planes and the ceiling are therefore offset by the
          thickness of the wall they pass through, which is why that thickness
          is a shared measurement now rather than a number in the Blender
          script.

          The floor is not offset, and that is deliberate. It is horizontal, so
          it can never share a plane with a reveal, and the hall's own floor
          slab stops at the inner face — offsetting this one too left half a
          metre of nothing to look down into at the threshold.
        */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, PORTAL.tunnel / 2]}>
          <planeGeometry args={[PORTAL.width, PORTAL.tunnel]} />
          <meshStandardMaterial color="#0a0f18" roughness={1} />
        </mesh>

        <group position={[0, 0, WALL_THICKNESS]}>
          <mesh
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, PORTAL.height, PORTAL.tunnel / 2]}
          >
            <planeGeometry args={[PORTAL.width, PORTAL.tunnel]} />
            <meshStandardMaterial color="#0a0f18" roughness={1} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={`tunnel-${side}`}
              position={[
                side * (PORTAL.width / 2),
                PORTAL.height / 2,
                PORTAL.tunnel / 2,
              ]}
              rotation={[0, side * -Math.PI / 2, 0]}
            >
              <planeGeometry args={[PORTAL.tunnel, PORTAL.height]} />
              <meshStandardMaterial color="#111a26" roughness={0.95} />
            </mesh>
          ))}

          {/* Daylight at the far end of the approach. */}
          <mesh position={[0, PORTAL.height / 2, PORTAL.tunnel]}>
            <planeGeometry args={[PORTAL.width, PORTAL.height]} />
            <meshBasicMaterial color="#dfe8f0" toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* Picture lights, standing where the bake was lit from: WASH.setback
          off the wall at WASH_HEIGHT, running along the hall so the light lies
          flat across a five metre picture rather than pooling in its middle.

          These are housings only. The light they appear to throw is already in
          the lightmap, which is why they carry a lit strip and no lamp. Both
          sides read the same numbers out of lib/roomLayout, because a fixture
          standing beside its own light instead of inside it is exactly what
          makes a room read as a set. */}
      {EXHIBITS.map(({ side, z, key }) => (
        <group
          key={`washer-${key}`}
          position={[side * (ROOM.width / 2 - WASH.setback), WASH_HEIGHT, z]}
        >
          <RoundedBox
            args={[WASH.depth, 0.1, WASH_LENGTH]}
            radius={0.02}
            smoothness={2}
          >
            <meshStandardMaterial color="#19212e" roughness={0.4} metalness={0.7} />
          </RoundedBox>

          <mesh position={[0, -0.051, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[WASH.depth * 0.62, WASH_LENGTH * 0.97]} />
            <meshBasicMaterial color="#fff2e0" toneMapped={false} />
          </mesh>

          {/* Two drops to the aisle ceiling, which is WASH.drop above. */}
          {[-1, 1].map((end) => (
            <mesh
              key={`drop-${key}-${end}`}
              position={[0, WASH.drop / 2 + 0.05, (end * WASH_LENGTH) / 2.6]}
            >
              <cylinderGeometry args={[0.01, 0.01, WASH.drop, 8]} />
              <meshStandardMaterial color="#2a3344" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function RoomShell() {
  return (
    <>
      <BakedHall />
      <HallFittings />
    </>
  );
}

/**
 * Threshold: a dark recess in the floor across the opening.
 *
 * It outlived the leaves it was built for, and it lost its rails with them —
 * polished metal running across a threshold nothing runs on was the last piece
 * of door hardware in the room. What is left is the shadow line, because a
 * five metre opening whose floor simply continues reads as a hole cut in a
 * drawing. The slot is what says the building was made in parts.
 */
function DoorSill({ width }: { width: number }) {
  return (
    <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width + 0.34, 0.28]} />
      <meshStandardMaterial color="#05080d" roughness={1} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------
   The portal — the same wall as the one at the far end, driven by the flight
   instead of by proximity.

   It used to be a pair of sliding leaves with brushed steel on them. They were
   fine and they were a door, and the hall now ends at a wall that is not one:
   arriving through an obvious door and leaving through a hidden one told two
   different stories about the same building. So both openings are the same
   piece of construction, modelled once in blender/05_exhibits.py and exported
   as two clips — the difference is only what scrubs them.

   Here it is the arrival. The wall parts while the visitor is still in the
   approach and seals again behind them, which is why the first thing the hall
   does is close.
   ------------------------------------------------------------------------- */

/**
 * How quickly the portal answers the flight.
 *
 * Slower than the mechanism at the far end. That one reacts to a visitor who
 * may turn round at any moment; this one has a fixed three second approach to
 * play against, and the whole point of the shot is that a wall this heavy
 * takes its time getting out of the way.
 */
const PORTAL_RESPONSE = 3.4;

export function EntryGate({ progress }: { progress: React.RefObject<number> }) {
  const hall = useHall();
  const quality = useRoomQuality();
  const opening = useRef(0);
  const wash = useMemo(() => new THREE.Object3D(), []);
  const halfD = ROOM.depth / 2;

  const rig = useMemo(() => {
    const clip = hall.clips.get("PortalWall");
    if (!clip) return null;
    const action = hall.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    return { action, duration: clip.duration };
  }, [hall]);

  useEffect(() => {
    return () => {
      rig?.action.stop();
    };
  }, [rig]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const flight = progress.current ?? 0;

    // Open early in the approach, shut again as the hall is entered.
    const target = flight > 0.03 && flight < 0.82 ? 1 : 0;
    opening.current = THREE.MathUtils.lerp(
      opening.current,
      target,
      1 - Math.exp(-PORTAL_RESPONSE * delta),
    );

    // Write the time and nothing else; HallMotion advances the mixer.
    if (rig) {
      rig.action.time = opening.current * rig.duration;
    }
  });

  return (
    <group>
      <group position={[0, 0, halfD - 0.16]}>
        <DoorSill width={PORTAL.width} />
      </group>

      {/*
        The wash, and it exists for the same reason the one at the far end
        does: the blocks filling this opening move, so they carry no lightmap,
        and a wall lit only in the bake would show them as an unlit rectangle
        inside a lit frame. One source, both surfaces, no seam.

        Set back into the nave rather than mounted over the opening, so the
        falloff runs the full height of the wall with no edge in it.
      */}
      <primitive object={wash} position={[0, 1.3, halfD - 0.05]} />
      {quality.tier === "full" && (
        <spotLight
          position={[0, 6.9, halfD - 8.4]}
          target={wash}
          angle={0.52}
          penumbra={1}
          intensity={260}
          distance={26}
          decay={1.7}
          color="#cfe0ea"
        />
      )}

      {/*
        And one from the approach side, which the bake cannot reach at all:
        there is no geometry out there to bounce off, so without this the
        visitor flies three seconds towards a black rectangle.
      */}
      {quality.tier === "full" && (
        <pointLight
          position={[0, 2.4, halfD + 3.2]}
          intensity={26}
          distance={11}
          decay={1.6}
          color="#bccddc"
        />
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------
   The hidden wall — the way out, and not visibly a door.

   Six blocks of concrete fill the opening flush with the end wall, parted only
   by six millimetre joints with light behind them. The mechanism is modelled
   and keyframed in Blender (blender/05_exhibits.py) and arrives as one glTF
   clip; nothing about the geometry or the choreography is rebuilt here.

   What this component does is decide *when*. The clip is never played: it is
   scrubbed, its time written every frame from how close the visitor is
   standing. That is what makes the wall close again on the way out at exactly
   the pace it opened, with no second animation and nothing to reverse — and it
   means turning round halfway through runs the mechanism backwards from
   wherever it got to, rather than snapping.
   ------------------------------------------------------------------------- */

/** How quickly the wall answers the visitor. Deliberately slow: it is a metre
 *  of concrete, and a mechanism that keeps up with a walking pace reads as a
 *  panel on rails. */
const WALL_RESPONSE = 2.4;

/** Past this the alcove is open enough to aim at. */
const WALL_OPEN = 0.62;

export function HiddenWall() {
  const hall = useHall();
  const quality = useRoomQuality();
  const sign = useRef<THREE.Mesh>(null);
  const opening = useRef(0);

  const halfD = ROOM.depth / 2;
  const signTexture = useMemo(() => createSignTexture(), []);

  /**
   * The mixer, and an action that never advances on its own.
   *
   * `paused` with `time` written by hand is the whole trick. mixer.update(0)
   * then evaluates the clip at that time and writes the six blocks' transforms
   * without integrating any of its own.
   */
  const rig = useMemo(() => {
    const clip = hall.clips.get("HiddenWall");
    if (!clip) return null;
    const action = hall.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    return { action, duration: clip.duration };
  }, [hall]);

  useEffect(() => {
    return () => {
      signTexture.dispose();
      rig?.action.stop();
    };
  }, [signTexture, rig]);

  useFrame(({ camera }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);

    const distance = Math.hypot(
      camera.position.x,
      camera.position.z + halfD,
    );
    const target = distance < HIDDEN_WALL.trigger ? 1 : 0;
    opening.current = THREE.MathUtils.lerp(
      opening.current,
      target,
      1 - Math.exp(-WALL_RESPONSE * delta),
    );

    // Write the time and nothing else. HallMotion advances the mixer, which
    // then evaluates this action wherever it was put — see the note there.
    if (rig) {
      rig.action.time = opening.current * rig.duration;
    }

    // Only aimable once there is something behind the wall to aim at.
    if (sign.current) {
      sign.current.name = opening.current > WALL_OPEN ? "aim-target" : "";
      const material = sign.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.clamp(
        (opening.current - 0.35) / 0.4,
        0,
        1,
      );
    }
  });

  // Deep in the alcove, so it is revealed rather than uncovered: the wall
  // opens onto a lit recess with the invitation standing in it, which is a
  // different thing from a door with a sign screwed to the front.
  const signZ = -halfD - HIDDEN_WALL.niche + 0.18;
  /** The back of the alcove, which is what the coves actually wash. */
  const nicheZ = -halfD - HIDDEN_WALL.niche;

  /**
   * The wash on the end wall, and the only one there is.
   *
   * Blender lights every other surface in this hall and bakes the result, and
   * on this one wall it deliberately does not. The six blocks filling the
   * opening move, so they carry no lightmap; any light traced into the wall
   * around them arrives on them as an outline, which is the one thing a hidden
   * wall cannot have. One runtime spotlight lights the wall and the blocks
   * with the same falloff, so the joint between them is a six millimetre line
   * and not a change of value.
   *
   * Set back into the nave rather than mounted above the wall, and that is the
   * third attempt. Two grazing sources put two obvious pools above the
   * opening; one source directly overhead replaced them with a single bright
   * dome, which is worse — a fixture whose shape the visitor can read, in a
   * room where every other light is hidden. From six metres out the throw is
   * shallow enough that the falloff runs the full height of the wall and has
   * no edge anywhere in it.
   */
  const washTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.position.set(0, 1.3, -halfD + 0.05);
    return target;
  }, [halfD]);

  return (
    <group>
      <primitive object={washTarget} />
      {quality.tier === "full" && (
        <spotLight
          position={[0, 6.6, -halfD + 6.2]}
          target={washTarget}
          angle={0.62}
          penumbra={1}
          intensity={300}
          distance={24}
          decay={1.75}
          color="#cfe0ea"
        />
      )}

      <mesh
        ref={sign}
        position={[0, 2.0, signZ]}
        userData={{ label: "Kontakt", action: "contact" }}
      >
        {/* 1.6 : 1, the ratio the sign is drawn at — see lib/signTexture.ts.
            A square plane stretched the type by sixty per cent. */}
        <planeGeometry args={[3.0, 1.875]} />
        <meshBasicMaterial
          map={signTexture}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/*
        One soft fill for the recess, and the slots do the talking.

        Blender models the two coves and gives them an emissive material, and
        an emissive material in three.js lights nothing but itself — so the
        concrete behind them needs a source of its own. Three attempts got here.
        A single teal lamp at eye level put a bright blob on the wall directly
        behind the word "Schreib". Two lamps at the slots, a hand's width off
        the plate, put a hot spot under each one: a point light that close to a
        flat surface is a torch, not a cove.

        So it sits a metre back and lights the whole recess evenly. What reads
        as a cove is the emissive strip itself, which is what a visitor sees of
        a real one anyway — the fitting, and a surface that is simply brighter
        than the room outside it.
      */}
      {quality.tier === "full" && (
        <pointLight
          position={[0, HIDDEN_WALL.height / 2, nicheZ + 1.0]}
          intensity={13}
          distance={5.5}
          decay={1.5}
          color="#9fc4cc"
        />
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Gaze picking — pointer lock hides the cursor, so the crosshair does the
   pointing. The centre ray is cast every few frames; a hit arms the click
   handler in the overlay, which opens the case in a new tab.
   ------------------------------------------------------------------------- */
/**
 * Re-exported so the review page and anything else that already imports it from
 * here keeps working. The definition moved to lib/aimTarget because the touch
 * picker produces the same shape and this module imports that one.
 */
export type { AimTarget };

export function GazePicker({ onAim }: { onAim: (target: AimTarget | null) => void }) {
  const { camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const tick = useRef(0);
  const current = useRef<string | null>(null);

  useFrame(() => {
    tick.current += 1;
    if (tick.current % 6 !== 0) return;

    const plates = scene.getObjectsByProperty("name", "aim-target");
    if (!plates.length) return;

    camera.getWorldDirection(direction);
    raycaster.set(camera.position, direction);
    // Reaches across the aisle: the barrier holds the visitor about two metres
    // off the wall, and the far side of the hall is roughly thirteen away, so
    // a shorter ray would leave the hint dark for anyone walking down the
    // middle rather than standing at the rope.
    raycaster.far = 13;

    const hit = raycaster.intersectObjects(plates, false)[0];
    const found = hit?.object.userData as AimTarget | undefined;

    // A hit with no label is a blocker: something that is in the way but has
    // nothing to say. The world at the centre of the Technical Art podium is
    // one, and it has to be, because it is not a target and a ray therefore
    // went straight through it — the crosshair sat on the planet and named a
    // moon on the far side, whose label was then correctly hidden behind the
    // very thing the visitor was looking at.
    const target = found?.label ? found : undefined;

    // The key is what "did the aim change" is decided on. Skills carry neither
    // a url nor an action, so without them in this chain every planet resolved
    // to null — the same value as looking at nothing — and the label never
    // fired.
    const key = target ? (target.url ?? target.action ?? target.skill ?? null) : null;

    if (key !== current.current) {
      current.current = key;
      onAim(target ?? null);
    }
  });

  return null;
}

/* -------------------------------------------------------------------------
   Exhibits — the real case captures, framed and lit like a gallery wall.
   ------------------------------------------------------------------------- */
export function Exhibits() {
  const maps = readCaseCaptures();

  const captions = useMemo(
    () =>
      EXHIBITS.map(({ entry, index, slot }) =>
        entry
          ? createCaptionTexture(entry, index)
          : createPlaceholderCaption(slot),
      ),
    [],
  );

  /**
   * A drawn plate for every slot that has no capture to hang.
   *
   * Two ways to end up here. The slot has no project yet, which is the case
   * this was written for. Or the project has one and its capture did not load
   * — see lib/caseCaptures.ts, which resolves a failure to null rather than
   * throwing, because a throw inside the Canvas takes the whole room with it.
   */
  const reserved = useMemo(
    () =>
      EXHIBITS.map(({ entry, index, slot }) =>
        entry && maps[index] ? null : createPlaceholderPlate(slot),
      ),
    [maps],
  );

  useEffect(
    () => () => {
      captions.forEach((texture) => texture.dispose());
      reserved.forEach((texture) => texture?.dispose());
    },
    [captions, reserved],
  );

  /**
   * Where the plates hang.
   *
   * Not computed here: Blender writes one empty per slot into the glTF, and
   * these are those empties, in order, with the facing they were authored
   * with. The frontend used to derive both from the sign of `side`, which
   * works exactly as long as every picture hangs on a wall parallel to the
   * axis — and stops the day one does not.
   *
   * The anchor sits on the wall face, because that is a datum the building
   * has and a frame does not. Standing the frame off it is the frontend's
   * business, and it is done along the anchor's own forward axis rather than
   * along x, so an angled wall would need no new code.
   */
  const { anchors } = useHall();

  const hangings = useMemo(
    () =>
      anchors.map((anchor) => ({
        position: anchor.position
          .clone()
          .addScaledVector(
            new THREE.Vector3(0, 0, 1).applyQuaternion(anchor.quaternion),
            FRAME_STANDOFF,
          ),
        quaternion: anchor.quaternion,
      })),
    [anchors],
  );

  return (
    <group>
      {EXHIBITS.map(({ entry, index, key }, position) => (
        <group
          key={key}
          position={hangings[position].position}
          quaternion={hangings[position].quaternion}
        >
          {/* Frame */}
          <RoundedBox
            args={[FRAME.width, FRAME.height, 0.12]}
            radius={0.05}
            smoothness={3}
            position={[0, 0, -0.05]}
          >
            <meshStandardMaterial color="#0b1017" roughness={0.55} metalness={0.2} />
          </RoundedBox>

          {/* The capture itself, 1.6:1 like the source files. `name` and
              `userData` are what the crosshair raycaster reads — a reserved
              slot deliberately carries neither, so it cannot be aimed at. */}
          {entry ? (
            <mesh
              position={[0, 0, 0.03]}
              name="aim-target"
              userData={{ label: entry.client, url: entry.url }}
            >
              <planeGeometry args={[4.8, 3]} />
              <meshBasicMaterial
                map={maps[index] ?? reserved[index]!}
                toneMapped={false}
              />
            </mesh>
          ) : (
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[4.8, 3]} />
              <meshBasicMaterial map={reserved[index]!} toneMapped={false} />
            </mesh>
          )}

          {/* Accent hairline under the frame. The brand colours belong to work
              that exists; a reserved slot gets a grey one. */}
          <mesh position={[0, -1.72, 0.03]}>
            <planeGeometry args={[FRAME.width, 0.022]} />
            <meshBasicMaterial
              color={
                entry
                  ? index % 2 === 0
                    ? BRAND_COLORS.teal
                    : BRAND_COLORS.violet
                  : "#39434f"
              }
              toneMapped={false}
            />
          </mesh>

          {/* Wall label. A texture, not DOM: <Html> cannot be depth-tested, so
              the captions used to shine through the walls from the entrance
              tunnel — and one DOM node per case does not scale. */}
          <mesh position={[0, -2.25, 0.03]}>
            <planeGeometry args={[3.4, 0.8]} />
            <meshBasicMaterial
              map={captions[index]}
              transparent
              toneMapped={false}
            />
          </mesh>


        </group>
      ))}
    </group>
  );
}

/** Etched museum label for the pedestal, drawn once into a canvas. */
function createPlaqueTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 620;
  canvas.height = 200;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#0f8e91";
    ctx.font = "500 26px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.letterSpacing = "6px";
    ctx.fillText("MAGNARIS", canvas.width / 2, 58);

    ctx.fillStyle = "#f3f6f8";
    ctx.font = "600 40px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "0px";
    ctx.fillText("Signet Nr. 01", canvas.width / 2, 112);

    ctx.fillStyle = "#8d98a6";
    ctx.font = "400 24px ui-monospace, monospace";
    ctx.fillText("Echtzeit-Geometrie, WebGL / 2026", canvas.width / 2, 156);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* -------------------------------------------------------------------------
   The founder exhibits — a podium each, at the end of the hall.

   These were two printed panels on the end wall, and the problem with them was
   not the design: it was the category. A room built out of real geometry, with
   a real arcade and real benches, ended at two posters. Everything a visitor
   had been told by walking forty metres was contradicted in the last five.

   So they are exhibits now. Blender models the podium, the lectern and the
   floating object above each one, bakes the podium's contact shadow into the
   fittings lightmap, and animates the sculptures on a looping clip. What is
   left for the browser is the part that cannot be baked: the skill texts,
   which come out of lib/site.ts and are drawn onto the two plates.

   MEMBERS[0] stands on the right as you walk in and MEMBERS[1] on the left,
   which is the arrangement the panels had. Swapping the entries in site.ts
   still swaps the sides — but the sculptures do not swap with them, because
   they are geometry and each was designed for its discipline. If the order
   ever changes, the plates follow and the objects have to be rebuilt.
   ------------------------------------------------------------------------- */

/** Which plate belongs to which founder, in MEMBERS order. */
const DISPLAY_FOR_MEMBER = ["display_dev", "display_art"] as const;

/**
 * Which glTF object carries which skill.
 *
 * MEMBERS[0] is Anwendungsentwicklung and stands on the right, so its six
 * skills are the six nodes of the net; MEMBERS[1] is Technical Art on the
 * left, so its six are the planets. Both are numbered from 1 in the order
 * 05_exhibits.py built them, which is the order the skills appear on the
 * lectern plate underneath.
 */
const SKILL_PREFIX = ["skill_dev", "skill_art"] as const;

/**
 * How far above a body its name floats: clear of the body, plus a fixed hand's
 * width.
 *
 * A pure multiple of the radius does not work when the bodies run from 34 to
 * 75 millimetres — the label on the smallest one sat inside the glow of the
 * world behind it while the label on the largest floated off on its own. The
 * constant is what makes them line up.
 */
const LABEL_CLEARANCE = 0.2;

/** Height of the label in metres. Sets the type's reading size at walking distance. */
const LABEL_SCALE = 0.15;

/** Reused rather than allocated per frame. */
const ORIGIN = new THREE.Vector3();

export function TeamExhibits({ aim }: { aim?: AimTarget | null }) {
  const quality = useRoomQuality();
  const hall = useHall();
  const halfD = ROOM.depth / 2;

  const plates = useMemo(
    () => MEMBERS.map((member) => createSkillPlate(member)),
    [],
  );

  /**
   * The world and the six bodies orbiting it.
   *
   * Generated rather than shipped: seven equirectangular maps would be seven
   * more files to export every time a colour moves. See lib/planetTexture.ts —
   * they are sampled on the sphere, so they wrap without a seam.
   */
  const worldMap = useMemo(() => createWorldTexture(), []);
  const planetMaps = useMemo(() => createPlanetTextures(), []);

  /** One label per skill on each side, drawn once and kept. */
  const labels = useMemo(
    () =>
      new Map(
        MEMBERS.flatMap((member, side) =>
          member.skills
            .slice(0, 6)
            .map(
              (skill, index) =>
                [
                  `${side === 0 ? "dev" : "art"}:${index + 1}`,
                  createSkillLabel(skill),
                ] as const,
            ),
        ),
      ),
    [],
  );

  /**
   * Where each body is, so a label can be hung off it while it orbits.
   *
   * The objects come out of the glTF with their origin at the centre of the
   * system and their geometry pushed out to the orbit radius — that is what
   * lets one rotation keyframe carry a planet round. It also means the object's
   * position is the centre of the system and not the position of the planet,
   * so the label follows the bounding sphere's centre instead.
   */
  const bodies = useMemo(() => new Map<string, THREE.Mesh>(), []);

  useEffect(() => {
    const restore: Array<() => void> = [];

    // ---- The lectern plates.
    MEMBERS.forEach((member, index) => {
      const mesh = hall.runtime.get(DISPLAY_FOR_MEMBER[index]) as
        | THREE.Mesh
        | undefined;
      if (!mesh) {
        console.error(
          `[TeamExhibits] "${DISPLAY_FOR_MEMBER[index]}" fehlt im glTF. ` +
            "blender/05_exhibits.py und 08_export.py neu laufen lassen.",
        );
        return;
      }
      const previous = mesh.material as THREE.Material;
      mesh.material = new THREE.MeshBasicMaterial({
        name: `plate:${member.slug}`,
        map: plates[index],
        toneMapped: false,
      });
      restore.push(() => {
        (mesh.material as THREE.Material).dispose();
        mesh.material = previous;
      });
    });

    // ---- The world.
    const world = hall.runtime.get("planet_world") as THREE.Mesh | undefined;
    if (world) {
      // It stops the crosshair without answering it — see GazePicker.
      const wasNamed = world.name;
      world.name = "aim-target";
      restore.push(() => {
        world.name = wasNamed;
      });

      const previous = world.material as THREE.Material;
      world.material = new THREE.MeshStandardMaterial({
        name: "planet:world",
        map: worldMap,
        roughness: 0.86,
        metalness: 0,
        envMapIntensity: 0.5,
      });
      restore.push(() => {
        (world.material as THREE.Material).dispose();
        world.material = previous;
      });
    }

    // ---- The twelve skill bodies: their surface, their name, and the fact
    //      that the crosshair can find them at all.
    MEMBERS.forEach((member, side) => {
      member.skills.slice(0, 6).forEach((skill, index) => {
        const name = `${SKILL_PREFIX[side]}_${index + 1}`;
        const mesh = hall.runtime.get(name) as THREE.Mesh | undefined;
        if (!mesh) {
          console.error(
            `[TeamExhibits] "${name}" fehlt im glTF. ` +
              "blender/05_exhibits.py und 08_export.py neu laufen lassen.",
          );
          return;
        }

        const key = `${side === 0 ? "dev" : "art"}:${index + 1}`;
        bodies.set(key, mesh);

        // Only the planets get a map. The net's nodes are lit signal and are
        // meant to read as one material, which is also how the edges between
        // them read.
        if (side === 1) {
          const previous = mesh.material as THREE.Material;
          mesh.material = new THREE.MeshStandardMaterial({
            name: `planet:${index + 1}`,
            map: planetMaps[index],
            roughness: 0.9,
            metalness: 0,
            envMapIntensity: 0.5,
          });
          restore.push(() => {
            (mesh.material as THREE.Material).dispose();
            mesh.material = previous;
          });
        }

        // The name GazePicker looks for, and the payload it reads off the hit.
        const wasNamed = mesh.name;
        const wasData = mesh.userData;
        mesh.name = "aim-target";
        mesh.userData = { label: skill, skill: key } satisfies AimTarget;
        restore.push(() => {
          mesh.name = wasNamed;
          mesh.userData = wasData;
        });
      });
    });

    return () => {
      restore.forEach((undo) => undo());
      bodies.clear();
    };
  }, [hall, plates, worldMap, planetMaps, bodies, labels]);

  useEffect(
    () => () => {
      plates.forEach((plate) => plate.dispose());
      worldMap.dispose();
      planetMaps.forEach((map) => map.dispose());
      labels.forEach((label) => label.texture.dispose());
    },
    [plates, worldMap, planetMaps, labels],
  );

  /**
   * The museum spot over each sculpture.
   *
   * The same fixture Blender put there, at the same place and the same angle —
   * blender/05_exhibits.py, Exhibit_Spot_art and Exhibit_Spot_dev. It has to
   * exist twice because the podium is baked and the thing hovering over it is
   * not: the lightmap already carries this light on the plinth, and without a
   * runtime copy the sculpture would be the one object in the bay standing in
   * its own spotlight unlit.
   */
  const spots = useMemo(
    () =>
      MEMBERS.map((member, index) => {
        const x = (index === 0 ? 1 : -1) * EXHIBIT_X;
        const target = new THREE.Object3D();
        target.position.set(x, EXHIBIT.podiumHeight + 0.3, -halfD + EXHIBIT.standoff);
        return { key: member.slug, x, target };
      }),
    [halfD],
  );

  return (
    <group>
      <SkillHalo aim={aim ?? null} bodies={bodies} labels={labels} />

      {spots.map(({ key, x, target }) => (
        <group key={key}>
          <primitive object={target} />
          {quality.tier === "full" && (
            <spotLight
              position={[x, 6.4, -halfD + EXHIBIT.standoff - 0.9]}
              target={target}
              angle={0.3}
              penumbra={0.55}
              intensity={95}
              distance={9}
              decay={1.5}
              color="#dbe7f0"
            />
          )}
          {/* The podium's light channel, throwing up onto what hovers over it.
              Short range and cyan: it is the groove in the concrete, not a
              second key light. */}
          {quality.tier === "full" && (
            <pointLight
              position={[x, EXHIBIT.podiumHeight - 0.16, -halfD + EXHIBIT.standoff]}
              intensity={5.5}
              distance={2.6}
              decay={1.7}
              color={BRAND_COLORS.teal}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * The name of the body the crosshair is on, floating beside it.
 *
 * One plane, reused. Twelve labels but only ever one on screen, so the mesh
 * stays and its map, size and position are rewritten when the aim moves —
 * twelve meshes toggling visibility would cost twelve draw calls to show one
 * thing.
 *
 * It follows the body rather than sitting at a fixed point, because the body
 * is in orbit: a label pinned to the podium would drift off the planet it
 * names within a second. The position comes from the bounding sphere, since
 * these meshes have their origin at the centre of the system they orbit and
 * their geometry out at the radius.
 */
function SkillHalo({
  aim,
  bodies,
  labels,
}: {
  aim: AimTarget | null;
  bodies: Map<string, THREE.Mesh>;
  labels: Map<string, SkillLabel>;
}) {
  const plane = useRef<THREE.Mesh>(null);
  const centre = useMemo(() => new THREE.Vector3(), []);

  const key = aim?.skill ?? null;
  const label = key ? labels.get(key) : undefined;

  /**
   * React owns whether this is on screen and what is on it; the frame loop
   * owns only where it is.
   *
   * The split matters. R3F rewrites JSX props on every commit, so a field
   * written in both places is decided by whichever ran last — and `visible`
   * written both ways is a label that is on screen according to every value
   * you can read and never drawn. Here `visible` and `map` are props and
   * nothing else touches them, while position, orientation and scale are
   * never props and are only ever set below.
   */
  useFrame(({ camera }) => {
    const mesh = plane.current;
    const body = key ? bodies.get(key) : undefined;
    if (!mesh || !body || !label) return;

    // The body's origin is the centre of the system it orbits and its geometry
    // sits out at the radius, so the bounding sphere is what says where the
    // body actually is.
    body.geometry.computeBoundingSphere();
    const sphere = body.geometry.boundingSphere;
    const radius = sphere ? sphere.radius : 0.1;
    centre.copy(sphere ? sphere.center : ORIGIN);
    body.localToWorld(centre);

    mesh.position.set(centre.x, centre.y + radius + LABEL_CLEARANCE, centre.z);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.set(label.aspect * LABEL_SCALE, LABEL_SCALE, 1);
  });

  return (
    <mesh ref={plane} visible={!!label} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={label?.texture ?? null}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

/* -------------------------------------------------------------------------
   Centrepiece — the extruded mark on a plinth, same geometry as the hero.
   ------------------------------------------------------------------------- */
export function MarkPlinth() {
  const quality = useRoomQuality();
  const mark = useRef<THREE.Group>(null);

  const parts = useMemo(
    () =>
      LOGO_PARTS.map((part) => ({
        part,
        geometry: createLogoGeometry(part),
      })),
    [],
  );

  const plaque = useMemo(() => createPlaqueTexture(), []);

  /**
   * A spotlight aims at its `target` object, which lives in the scene graph.
   * Without one it points at the world origin, which is why the first pass
   * lit the middle of the room instead of the piece it belonged to.
   */
  const spotTarget = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!mark.current) return;
    mark.current.rotation.y += delta * 0.22;
  });

  return (
    <group>
      {/* Pedestal: base slab, tapered body, shadow gap, overhanging cap —
          the proportions of a museum plinth rather than a crate. */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[1.46, 0.08, 1.46]} />
        <meshStandardMaterial color="#19212e" roughness={0.6} metalness={0.2} />
      </mesh>

      <mesh position={[0, 0.58, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.62, 0.72, 1, 4, 1]} />
        <meshStandardMaterial color="#232d3e" roughness={0.32} metalness={0.45} />
      </mesh>

      {/* Glowing seam where the cap meets the body. */}
      <mesh position={[0, 1.095, 0]}>
        <boxGeometry args={[1.12, 0.012, 1.12]} />
        <meshBasicMaterial color={BRAND_COLORS.teal} toneMapped={false} />
      </mesh>

      <mesh position={[0, 1.06, 0]}>
        <boxGeometry args={[1.06, 0.06, 1.06]} />
        <meshStandardMaterial color="#0d131c" roughness={0.9} />
      </mesh>

      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[1.3, 0.07, 1.3]} />
        <meshStandardMaterial color="#2f3a4d" roughness={0.24} metalness={0.65} />
      </mesh>

      {/* Floor inlay ring — the piece gets its own footprint. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]}>
        <ringGeometry args={[1.34, 1.4, 64]} />
        <meshBasicMaterial color={BRAND_COLORS.teal} toneMapped={false} />
      </mesh>

      {/* Museum label. Drawn to a canvas rather than mounted as DOM: a
          <Html> card cannot be occluded cleanly and shows up as a smear in
          the floor reflection. */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle) => (
        <mesh
          key={`plaque-${angle}`}
          position={[Math.sin(angle) * 0.685, 0.78, Math.cos(angle) * 0.685]}
          rotation={[0, angle, 0]}
        >
          <planeGeometry args={[0.62, 0.2]} />
          <meshBasicMaterial map={plaque} transparent toneMapped={false} />
        </mesh>
      ))}

      <group ref={mark} position={[0, 2.3, 0]} scale={LOGO_SCALE * 1.25}>
        {parts.map(({ part, geometry }) =>
          part.role === "solid" ? (
            <mesh key={part.id} geometry={geometry}>
              <meshPhysicalMaterial
                color="#1b2434"
                metalness={0.92}
                roughness={0.2}
                clearcoat={0.8}
                envMapIntensity={1.8}
              />
            </mesh>
          ) : (
            <mesh key={part.id} geometry={geometry}>
              <meshStandardMaterial
                color={
                  part.role === "teal" ? BRAND_COLORS.teal : BRAND_COLORS.violet
                }
                emissive={
                  part.role === "teal" ? BRAND_COLORS.teal : BRAND_COLORS.violet
                }
                emissiveIntensity={1.1}
                metalness={0.35}
                roughness={0.28}
                toneMapped={false}
              />
            </mesh>
          ),
        )}
      </group>

      {/* Gallery spot from directly above, aimed at the piece. The only light
          left in the hall that is not baked, because the mark on the plinth is
          the one thing in the room that turns.

          It hangs from the nave ceiling, which the basilica put at 8 m instead
          of the old 6.4 m. That lengthened the throw from 3.5 to 5.1 m, and at
          decay 1.8 the piece arrived at half the light it had — hence the
          intensity, which is the old one times (5.1/3.5)^1.8. */}
      {/* On both tiers, unlike the other six.

          A spot with a thirteen metre throw and a decay of 1.8 has run out
          before it reaches anything baked, so it costs the room's own lighting
          nothing — which is exactly what the lite tier's first attempt at a
          replacement, one directional light, could not manage: a directional
          has no falloff, and turned up far enough to model the mark it also
          added that much to every wall and to the whole floor, which faces
          straight into it. The bake stopped reading as light in a room.

          So the lite tier keeps two lights rather than none, and both of them
          are local. This is one; the other is at the far end, in LiteFill. */}
      <primitive object={spotTarget} position={[0, 2.3, 0]} />
      <spotLight
        position={[0, SECTION.naveHeight - 0.6, 0]}
        target={spotTarget}
        angle={0.38}
        penumbra={0.9}
        intensity={108}
        distance={13}
        decay={1.8}
        color="#fff4e4"
      />

      {/* Rendered once, not per frame — a static room needs no live shadow. */}
      <ContactShadows
        position={[0, 0.02, 0]}
        frames={1}
        scale={7}
        blur={2.6}
        opacity={0.5}
        far={2.4}
        color="#000000"
      />
    </group>
  );
}

/* -------------------------------------------------------------------------
   Overlay shell — owns the 2D side of the handoff.
   ------------------------------------------------------------------------- */
export function WalkableRoom() {
  const controls = useRef<React.ComponentRef<typeof PointerLockControls> | null>(
    null,
  );
  const introProgress = useRef(0);
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockReady, setLockReady] = useState(true);
  /**
   * Which set of controls this device gets.
   *
   * "pointer" is the room as it was: pointer lock, WASD, mouse look. "touch" is
   * the tour — thirteen standing points, a tap to move, a drag to look — and it
   * exists because iOS Safari has no Pointer Lock API at all. This used to be a
   * gate that refused to open the room on a phone; what it decides now is only
   * which player to mount.
   */
  const walkable = useWalkableSupport();
  const touch = walkable === "touch";
  const [aim, setAim] = useState<AimTarget | null>(null);
  const [arrived, setArrived] = useState(false);

  /* ---------------------------------------------------------------- quality */
  /**
   * Which version of the room gets built, resolved before the canvas mounts.
   *
   * The tier is not a rendering detail that can be switched later: it decides
   * which textures are downloaded, how many maps each material samples and
   * whether there are lights in the room at all. Changing any of those after
   * the fact rebuilds every material and recompiles every shader, so the answer
   * has to be in hand first — which is why this is state and not a ref, and why
   * nothing is mounted until it is set.
   *
   * Two things make it lite: a touch device, and a machine that the power
   * profile calls low. They are not the same question — a tablet with a
   * keyboard is a touch device with a real GPU, and a five year old laptop is
   * neither — but they want the same room.
   */
  const profile = usePowerProfile();
  const applyTier = useTierFromProfile();
  const [tier, setTier] = useState<"full" | "lite" | null>(null);

  useEffect(() => {
    if (walkable === "unknown" || profile === "unknown") return;
    setTier(applyTier(touch || profile === "low"));
  }, [walkable, profile, touch, applyTier]);

  const quality = useRoomQuality();

  /* ------------------------------------------------------------------ tour */
  /** Which station the tour is at. Only meaningful on a touch device. */
  const [station, setStation] = useState(0);
  /**
   * Written by TourPlayer every frame and read by the frame loop, which is why
   * it is a ref: the cadence has to know whether anything is moving without a
   * re-render per frame telling it.
   */
  const tourStatus = useRef<TourStatus>({
    busy: true,
    cramped: false,
    arrived: false,
  });
  /**
   * Whether the current station can show its subject on this screen.
   *
   * Computed here rather than read back out of the ref, because it drives a
   * hint in the HUD and the HUD is React. A 5.14 m painting seen from inside a
   * 5 m aisle does not fit across a phone held upright, and the only real fix
   * is to turn the phone — so it says so, once, and does not block anything.
   */
  const [cramped, setCramped] = useState(false);

  /**
   * The frame rate, shown only when asked for with `?fps=1`.
   *
   * It is here because it is the one number about this room that cannot be
   * measured anywhere except on the device itself. A test harness on a desktop
   * renders the hall in software at whatever rate its timer happens to fire,
   * which says nothing about a phone — so the phone reports it, and the
   * question of whether the tour is fast enough gets an answer instead of an
   * estimate.
   */
  const [fps, setFps] = useState(0);
  const showFps = useMemo(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("fps"),
    [],
  );

  useEffect(() => {
    if (!touch || !open) return;
    const measure = () => {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      const current = STATIONS[station];
      setCramped(current ? isCramped(current, fovFor(aspect), aspect) : false);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [touch, open, station]);

  /**
   * The room has its own soundtrack: a quiet loop that fades up as soon as
   * the overlay opens. The click that opened it is the user gesture the
   * autoplay policy asks for, so `open` — not `locked` — is the gate.
   */
  const reducedMotion = usePrefersReducedMotion();
  const ambience = useRoomAmbience(open, reducedMotion);

  /**
   * Pointer lock has a browser-enforced cool-down: asking for it again right
   * after the user pressed Escape throws
   * "Pointer lock cannot be acquired immediately after the user has exited
   * the lock." So the gate stays disabled for a moment after every unlock,
   * and the request itself goes through the controls instance rather than a
   * synthesised click on the canvas.
   */
  const handleLockChange = useCallback((next: boolean) => {
    setLocked(next);
    if (!next) {
      setAim(null);
      // Losing the lock puts the camera back outside the gate, so the flight
      // has to be armed again. Both of these live past the canvas: the ref
      // survives because it belongs to this component, and without the reset
      // the next entry skips the approach, never reports arrival, and leaves
      // the HUD stuck on "Anflug" with no crosshair.
      setArrived(false);
      introProgress.current = 0;
    }
    if (next) {
      setLockReady(true);
      return;
    }
    setLockReady(false);
    window.setTimeout(() => setLockReady(true), 1400);
  }, []);

  /**
   * Take the controls.
   *
   * On a pointer device that means asking for the lock, which can fail inside
   * the browser's cool-down. On a touch device there is nothing to ask for: the
   * tour needs no capture, so entering is simply a flag — and it still has to
   * come from a button press, because the arrival flight, the audio and the
   * first frame all hang off it.
   */
  const requestLock = useCallback(() => {
    if (touch) {
      setStation(0);
      setArrived(false);
      introProgress.current = 0;
      setLocked(true);
      return;
    }
    try {
      controls.current?.lock();
    } catch {
      // Still inside the cool-down — keep the gate up and let the user retry.
      setLockReady(false);
      window.setTimeout(() => setLockReady(true), 1400);
    }
  }, [touch]);

  // Any element with data-walkable-trigger opens the room — no prop drilling.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-walkable-trigger]")) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Freeze the page underneath: Lenis first, then the native scrollbar.
  useEffect(() => {
    if (!open) return;
    const lenis = window.__lenis;
    lenis?.stop();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      lenis?.start();
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setLocked(false);
    setAim(null);
    setArrived(false);
    setStation(0);
    introProgress.current = 0;
  }, []);

  /**
   * What aiming at something and then asking for it does.
   *
   * Shared by both control schemes, because the answer is the same either way:
   * a case opens its live site in a new tab, and the contact wall leaves the
   * room and lands on the contact block of the page. What differs is only what
   * counts as asking — a left click under pointer lock, a second tap on a touch
   * device.
   */
  const act = useCallback(
    (target: AimTarget) => {
      if (target.action === "contact") {
        close();
        // Leave the room, then land on the contact block of the page.
        window.setTimeout(() => {
          const element = document.getElementById("kontakt");
          if (!element) return;
          const top = element.getBoundingClientRect().top + window.scrollY;
          if (window.__lenis) window.__lenis.scrollTo(top);
          else window.scrollTo({ top, behavior: "smooth" });
        }, 320);
        return;
      }

      if (target.url) window.open(target.url, "_blank", "noopener,noreferrer");
    },
    [close],
  );

  /**
   * Left click while the crosshair sits on a case opens the live site in a new
   * tab. Under pointer lock the cursor position is frozen, so the DOM click
   * target is meaningless — the aim comes from the centre ray instead.
   */
  useEffect(() => {
    if (touch || !open || !locked || !aim) return;
    const onClick = () => act(aim);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [touch, open, locked, aim, act]);

  /**
   * A tap landed on something.
   *
   * One rule, and it is the one a map has: the first tap takes you there, the
   * second one opens it. Tapping a picture from four bays away walks the tour
   * to the station in front of it; tapping it once you are standing there opens
   * the project. That is both better than opening a link the moment a thumb
   * brushes a distant wall, and the only version that can work at all — a popup
   * only counts as user-initiated while the tap that caused it is still on the
   * stack, which rules out deciding it one render later.
   */
  const handlePick = useCallback(
    (target: AimTarget | null) => {
      setAim(target);
      if (!target) return;

      // A skill on a planet is not a link. Looking at it is the interaction,
      // and the label that just appeared is the whole of the answer.
      if (target.skill) return;

      const wanted = target.action === "contact"
        ? STATIONS.findIndex((entry) => entry.kind === "contact")
        : STATIONS.findIndex(
            (entry) =>
              entry.caseIndex !== undefined &&
              CASES[entry.caseIndex]?.url === target.url,
          );

      if (wanted >= 0 && wanted !== station) {
        setStation(wanted);
        return;
      }
      act(target);
    },
    [act, station],
  );

  // Esc leaves pointer lock first (browser default), a second Esc leaves the
  // room — so the visitor is never trapped. M mutes the ambience: under
  // pointer lock the cursor is gone, so the sound control has to be a key.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !locked) close();
      if (event.code === "KeyM") ambience.toggle();
      // The arrow keys already drive movement, so the level sits on +/-.
      if (event.code === "Minus" || event.code === "NumpadSubtract") {
        ambience.stepLevel(-1);
      }
      if (event.code === "Equal" || event.code === "NumpadAdd") {
        ambience.stepLevel(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, close, ambience]);

  /* ---- Everything inside the canvas, built once for both schemes.
         Only the player, the picker and the markers differ; the building, the
         exhibits and the mechanism are the same room. */
  const canvas = tier === null ? null : (
    <Canvas
      dpr={[1, quality.dprMax]}
      // "never" hands the render loop to FrameCadence, which caps it and lets
      // it fall to a heartbeat when the visitor is standing still. On the full
      // tier the browser keeps driving it as before.
      frameloop={touch ? "never" : "always"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: touch ? fovFor(1) : 62, near: 0.05, far: 140 }}
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
      {/* Only the far end softens. The hall is 40 m long and the
          bake already darkens with distance, so fog starting at
          16 m used to sit on top of that and grey out the middle
          of the room as well. */}
      <fog attach="fog" args={["#070a10", 30, 96]} />

      {/*
        There is no room lighting here any more, and that is the
        point: every bounce, every shadow and the whole cove wash
        are in the lightmap. An ambient light and a row of ceiling
        sources on top of that do not add to it, they flatten it —
        the bake's darks get a floor under them and the hall turns
        into the grey box it was.

        What is left is the environment below, which does the one
        job a diffuse lightmap cannot: the specular sheen on the
        marble, and a soft fill for everything that is not baked —
        the benches, the plinth, the planting, the doors.
      */}
      {/*
        Everything that loads a file sits inside this boundary, and
        it has to be inside the Canvas.

        It used to hold only <Exhibits>, because the room was built
        out of primitives and nothing else suspended. The hall comes
        out of a glTF now, so RoomShell suspends too — and a
        component that suspends with no boundary under the Canvas
        takes the Canvas down with it. React unmounts the subtree,
        R3F's teardown calls forceContextLoss() on the way out, and
        the canvas element never gets a second context: a black
        screen, no error in the console, and a WebGL context that
        reports itself lost about a second after it was created.

        Player stays outside so pointer lock and the look controls
        survive the load.
      */}
      <Suspense fallback={null}>
        <RoomShell />
        <HallMotion />
        <EntryGate progress={introProgress} />
        <HiddenWall />
        <MarkPlinth />
        <TeamExhibits aim={aim} />
        <Exhibits />
        <HallEnvironment />
        <RoomProbe />
        <HallEnvironmentBinding />

        {/*
          The tour's two pieces belong inside the boundary, unlike Player
          outside it, and for the same reason Player is outside: both read the
          hall, and reading the hall is what suspends.

          Player does not — it only moves a camera — so it can sit outside and
          keep pointer lock alive across the load. The tour has no lock to keep
          alive, and it needs the hanging anchors to know where its picture
          stations are, so it waits with everything else. A component that
          suspends with no boundary above it takes the whole Canvas down.
        */}
        {touch && (
          <>
            <StationMarkers index={station} visible={arrived} />
            <TourPlayer
              index={station}
              started={locked}
              progress={introProgress}
              status={tourStatus}
              onStation={setStation}
              onPick={handlePick}
              onArrived={() => setArrived(true)}
            />
          </>
        )}
      </Suspense>

      {quality.tier === "lite" && <LiteFill />}

      {/*
        Outside, and it has to be: with frameloop="never" this is the only
        thing that draws a frame, including the frames during the load and the
        one right after the boundary resolves. Inside, it would be suspended
        along with everything else and the room would never appear.
      */}
      {touch && (
        <FrameCadence status={tourStatus} onRate={showFps ? setFps : undefined} />
      )}

      {!touch && (
        <>
          <GazePicker onAim={setAim} />
          <Player
            controls={controls}
            progress={introProgress}
            started={locked}
            onLockChange={handleLockChange}
            onArrived={() => setArrived(true)}
          />
        </>
      )}
    </Canvas>
  );

  const current = STATIONS[station];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE_BRAND }}
          className={[
            "fixed inset-0 z-[90] bg-ink-900",
            // Under pointer lock the browser hides the cursor itself, and the
            // HUD is built on that assumption: +/- work the volume, the slider
            // only serves the entry gate. Some browsers keep drawing the arrow
            // anyway — a Chromium started with automation flags does — and an
            // arrow parked over a dark hall reads as a broken page. Unlocked,
            // the cursor has to come back: that is when the gate's buttons are
            // the only way out.
            locked && !touch ? "cursor-none" : "",
            // A drag across the canvas is the look control, so the browser must
            // not also read it as a scroll or a pull-to-refresh.
            touch ? "touch-none select-none overscroll-none" : "",
          ].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label="Begehbarer 3D-Raum"
        >
          {/* The keyboard provider only where there is a keyboard. Player
              reads its state through useKeyboardControls and is not mounted on
              a touch device at all, so wrapping the tour in it would add a
              window listener for keys nobody can press. */}
          {touch ? canvas : <KeyboardControls map={KEY_MAP}>{canvas}</KeyboardControls>}

          {/* HUD */}
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute left-6 top-6 flex items-center gap-3">
              <span className="tag text-frost">MAGNARIS / SPACE</span>
              <span className="hidden h-px w-8 bg-line sm:block" />
              <span className="tag hidden sm:inline">
                {touch ? "TOUR · BUILD 0.4" : "WALKABLE ROOM · BUILD 0.4"}
              </span>
            </div>

            {ambience.available && (
              <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-3 rounded-full border border-line bg-ink-900/70 px-4 py-2 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={ambience.toggle}
                  className="tag flex items-center gap-2 transition-colors hover:text-frost"
                  aria-pressed={ambience.enabled}
                  aria-label={ambience.enabled ? "Ton aus" : "Ton an"}
                >
                  {/* Three bars that collapse to one when the loop is off —
                      a level meter reads faster than a speaker glyph. */}
                  <span className="flex h-3 items-end gap-[3px]" aria-hidden>
                    <span
                      className={[
                        "w-[2px] bg-current transition-all duration-300",
                        ambience.enabled ? "h-1.5" : "h-[2px]",
                      ].join(" ")}
                    />
                    <span
                      className={[
                        "w-[2px] bg-current transition-all duration-300",
                        ambience.enabled ? "h-3" : "h-[2px]",
                      ].join(" ")}
                    />
                    <span
                      className={[
                        "w-[2px] bg-current transition-all duration-300",
                        ambience.enabled ? "h-2" : "h-[2px]",
                      ].join(" ")}
                    />
                  </span>
                  <span className={touch ? "sr-only" : undefined}>
                    {ambience.enabled ? "Ton an" : "Ton aus"}
                  </span>
                </button>

                {/* The slider is a pointer control: under pointer lock the
                    cursor is gone and +/- does the same job, and on a phone it
                    would sit in the corner a thumb reaches for when it means to
                    drag the view. */}
                {!touch && (
                  <>
                    <span className="h-4 w-px bg-line" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(ambience.level * 100)}
                      onChange={(event) =>
                        ambience.setLevel(Number(event.target.value) / 100)
                      }
                      aria-label="Lautstärke"
                      className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-line accent-teal"
                    />
                    <span className="tag w-9 text-right tabular-nums text-frost">
                      {ambience.enabled ? Math.round(ambience.level * 100) : 0}%
                    </span>
                  </>
                )}
              </div>
            )}

            {locked && !arrived && (
              <span className="absolute left-1/2 top-[58%] -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.3em] text-frost/70">
                Anflug
              </span>
            )}

            {showFps && touch && (
              <span className="absolute left-6 top-14 rounded-full border border-line bg-ink-900/80 px-3 py-1 font-mono text-[11px] tabular-nums text-frost backdrop-blur-sm">
                {fps} fps · {quality.tier} · dpr {quality.dprMax}
              </span>
            )}

            {/* ---- The crosshair, which only a pointer device has. A tap
                    aims itself, so a mark in the middle of a phone screen
                    would name something the thumb is not pointing at. */}
            {locked && arrived && !touch && (
              <>
                <span
                  className={[
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all duration-300",
                    aim
                      ? "h-5 w-5 border-frost shadow-[0_0_0_1px_rgba(11,15,24,0.55)]"
                      : "h-3 w-3 border-teal/70 shadow-[0_0_0_1px_rgba(11,15,24,0.55)]",
                  ].join(" ")}
                />

                {aim && (
                  <span className="absolute left-1/2 top-1/2 mt-8 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-ink-900/80 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-frost backdrop-blur-sm">
                    {aim.action === "contact"
                      ? "Linksklick — Kontakt aufnehmen"
                      : aim.skill
                        ? aim.label
                        : `Linksklick — ${aim.label} öffnen ↗`}
                  </span>
                )}
              </>
            )}

            {/* ---- What the tour shows instead: where you are, what you last
                    tapped, and the two buttons that move you. */}
            {touch && locked && arrived && current && (
              <>
                {aim && (
                  <span className="absolute left-1/2 top-[14%] -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-ink-900/80 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-frost backdrop-blur-sm">
                    {aim.skill ? aim.label : `${aim.label} — nochmal tippen ↗`}
                  </span>
                )}

                {cramped && (
                  <span className="absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-nowrap rounded-full border border-line/60 bg-ink-900/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-steel backdrop-blur-sm">
                    Quer halten zeigt mehr
                  </span>
                )}

                <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 pb-7">
                  <button
                    type="button"
                    onClick={() =>
                      setStation((i) => (i - 1 + STATIONS.length) % STATIONS.length)
                    }
                    aria-label="Vorherige Station"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-ink-900/80 text-lg text-frost backdrop-blur-sm active:bg-ink-900"
                  >
                    ‹
                  </button>

                  <div className="min-w-0 flex-1 rounded-2xl border border-line bg-ink-900/80 px-4 py-3 text-center backdrop-blur-sm">
                    <p className="tag text-[9px] text-steel">
                      {String(station + 1).padStart(2, "0")} / {STATIONS.length}
                    </p>
                    <p className="truncate text-[13px] text-frost">
                      {current.label}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStation((i) => (i + 1) % STATIONS.length)}
                    aria-label="Nächste Station"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-ink-900/80 text-lg text-frost backdrop-blur-sm active:bg-ink-900"
                  >
                    ›
                  </button>
                </div>

                {/* No Escape key on a phone, so the way out has to be visible.
                    Top right under the sound control, where a close button is. */}
                <button
                  type="button"
                  onClick={close}
                  className="pointer-events-auto absolute right-6 top-[4.5rem] rounded-full border border-line bg-ink-900/80 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-frost backdrop-blur-sm"
                >
                  Verlassen
                </button>
              </>
            )}

            {/* ---- The key legend, which is only true with a keyboard. */}
            {!touch && (
              <div className="absolute bottom-6 left-6 flex flex-wrap gap-x-6 gap-y-2">
                {[
                  ["W A S D", "Bewegen"],
                  ["MAUS", "Umsehen"],
                  ["SHIFT", "Sprint"],
                  ["KLICK", "Case öffnen"],
                  ["M", "Ton an/aus"],
                  ["+ / −", "Lautstärke"],
                  ["ESC", "Verlassen"],
                ].map(([key, label]) => (
                  <span key={key} className="tag flex items-center gap-2">
                    <kbd className="rounded border border-line px-2 py-1 text-frost">
                      {key}
                    </kbd>
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Entry gate — pointer lock must start from a user gesture, and the
              tour needs one too for the audio and the arrival. */}
          <AnimatePresence>
            {!locked && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-ink-900/70 px-6 backdrop-blur-sm"
              >
                <div className="text-center">
                  <p className="tag">02 / SPACE</p>
                  <h2 className="mt-4 text-headline font-semibold uppercase">
                    Betritt den Raum
                  </h2>
                  <p className="mx-auto mt-4 max-w-[42ch] text-sm text-steel">
                    {touch
                      ? "Ziehen sieht sich um, Tippen auf einen Ring am Boden stellt dich woanders hin. Die Pfeile unten führen durch die Halle."
                      : "Klicken sperrt den Mauszeiger. Mit W A S D bewegst du dich, Escape bringt dich zurück auf die Seite."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={requestLock}
                  disabled={!touch && !lockReady}
                  className="rounded-full bg-frost px-8 py-4 text-[13px] font-medium text-ink transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-45 disabled:hover:translate-y-0"
                >
                  {touch
                    ? "Tour starten"
                    : lockReady
                      ? "Mauszeiger sperren"
                      : "Einen Moment …"}
                </button>

                <button
                  type="button"
                  onClick={close}
                  className="tag transition-colors hover:text-frost"
                >
                  Abbrechen
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default WalkableRoom;
