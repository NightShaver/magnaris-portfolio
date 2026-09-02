"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  KeyboardControls,
  Lightformer,
  MeshReflectorMaterial,
  PointerLockControls,
  RoundedBox,
  useKeyboardControls,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";

import { BRAND_COLORS } from "@/components/hero/HeroScene";
import { CASES, MEMBERS } from "@/lib/site";
import { createPortraitPanel, type PortraitPanel } from "@/lib/portraitTexture";
import {
  createCaptionTexture,
  createPlaceholderCaption,
  createPlaceholderPlate,
} from "@/lib/caseTexture";
import { createSignTexture } from "@/lib/signTexture";
import { createBrushedMetalMaps } from "@/lib/metalTexture";
import { createPlantGeometry } from "@/lib/plantGeometry";
import { LOGO_PARTS, LOGO_SCALE } from "@/lib/logo";
import { createLogoGeometry } from "@/lib/logoGeometry";
import { EASE_BRAND } from "@/lib/motion";
import { useRoomAmbience } from "@/lib/useRoomAmbience";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useWalkableSupport } from "@/lib/useWalkableSupport";

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
 * The hall is sized from the case list, not the other way round: two cases per
 * bay, one bay every ROW_SPACING metres, plus a lobby at each end. Adding a
 * sixth or a sixteenth project makes the room longer — no coordinate in this
 * file has to be touched.
 */
const ROW_SPACING = 8.5;
const ROWS = Math.max(2, Math.ceil(CASES.length / 2));

const ROOM = {
  width: 26,
  depth: ROWS * ROW_SPACING + 15,
  height: 6.4,
  eyeHeight: 1.68,
  /** Radius the visitor is kept away from the central plinth. */
  plinthRadius: 1.6,
  /** How far the barrier keeps the visitor off the exhibition walls. */
  wallClearance: 2.1,
};

/** The gate at the near end, and the approach the visitor flies in through. */
const PORTAL = {
  width: 5.2,
  height: 3.8,
  tunnel: 9,
};

/** Where the intro flight starts and where it hands over control. */
const INTRO = {
  from: ROOM.depth / 2 + PORTAL.tunnel - 1.5,
  to: ROOM.depth / 2 - 5,
  duration: 2.8,
};

const SPEED = { walk: 3.1, sprint: 5.6, damping: 9 };

const SURFACE = {
  floor: "#101827",
  wall: "#202939",
  wallDeep: "#1a2230",
  ceiling: "#131a25",
  reveal: "#080c13",
  pilaster: "#212a3a",
} as const;

const KEY_MAP = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "sprint", keys: ["ShiftLeft", "ShiftRight"] },
];

/** Frame size in metres — everything else on the wall is laid out around it. */
const FRAME = { width: 5.14, height: 3.34, centreY: 2.4 };

/** Depth kept clear at both ends of the hall, for the two lobbies. */
const LOBBY = 7.5;

/**
 * A bay every ROW_SPACING metres, from the entrance lobby back to the far one.
 * Derived from the built depth rather than from the case count: the hall is
 * hung to its own architecture, and the last bay is a full bay or none.
 */
const BAY_Z = (() => {
  const list: number[] = [];

  for (
    let z = ROOM.depth / 2 - LOBBY;
    z >= -ROOM.depth / 2 + LOBBY;
    z -= ROW_SPACING
  ) {
    list.push(z);
  }

  return list;
})();

/**
 * Every wall slot in the hall, in walking order: two per bay, alternating
 * sides. The published cases fill the first ones, and whatever the list does
 * not reach stays a reserved hanging rather than a bare wall — otherwise the
 * gallery stops mid-sentence halfway down the room.
 */
const EXHIBITS = BAY_Z.flatMap((z, row) =>
  [-1, 1].map((side) => {
    const index = row * 2 + (side === -1 ? 0 : 1);
    const entry = CASES[index] ?? null;

    return {
      entry,
      index,
      side,
      z,
      key: entry ? entry.client : `slot-${index}`,
      /** Continues the case numbering: "06" is the first reserved slot. */
      slot: String(index + 1).padStart(2, "0"),
    };
  }),
);

/**
 * Pilasters sit in the gaps *between* the bays. Picking round numbers by hand
 * is how the first version ended up with a pier running straight across a
 * case — these are derived from the bay positions instead.
 */
const PILASTER_Z = [
  ROOM.depth / 2 - 1.6,
  ...BAY_Z.slice(0, -1).map((z) => z - ROW_SPACING / 2),
  -ROOM.depth / 2 + 1.6,
];

/** A bench in every gap between two bays. */
const BENCH_Z = BAY_Z.slice(0, -1).map((z) => z - ROW_SPACING / 2);

/** Evenly spread ceiling sources and track drop rods along the hall. */
const spread = (count: number, inset: number) =>
  Array.from({ length: count }, (_, index) =>
    count === 1
      ? 0
      : -ROOM.depth / 2 + inset +
        (index * (ROOM.depth - inset * 2)) / (count - 1),
  );

const CEILING_LIGHT_Z = spread(Math.max(3, BAY_Z.length + 1), 4.5);
const TRACK_ROD_Z = spread(Math.max(3, BAY_Z.length + 1), 3.5);

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

  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const front = useRef(new THREE.Vector3());
  const side = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 2, INTRO.from);
  }, [camera]);

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

    camera.getWorldDirection(front.current);
    front.current.y = 0;
    front.current.normalize();
    side.current.crossVectors(front.current, camera.up).normalize();

    move.current
      .set(0, 0, 0)
      .addScaledVector(front.current, direction.current.z * speed)
      .addScaledVector(side.current, direction.current.x * speed);

    // Exponential damping: instant response, no ice-skating stop.
    velocity.current.lerp(move.current, 1 - Math.exp(-SPEED.damping * delta));
    camera.position.addScaledVector(velocity.current, delta);

    // TEMPORARY COLLISION: axis-aligned bounds plus one cylinder around the
    // plinth. Swap for BVH raycasts or a Rapier capsule once the authored
    // room lands — the rest of the movement code stays as it is.
    const halfW = ROOM.width / 2 - ROOM.wallClearance;
    const halfD = ROOM.depth / 2 - 1.2;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfW, halfW);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -halfD, halfD);

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
function RoomShell() {
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;

  return (
    <group>
      {/* Polished floor. The reflection is what sells "gallery" over "box". */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <MeshReflectorMaterial
          color={SURFACE.floor}
          resolution={384}
          blur={[300, 80]}
          mixBlur={1.4}
          mixStrength={4.5}
          mirror={0.35}
          depthScale={1.1}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.4}
          metalness={0.55}
          roughness={0.82}
        />
      </mesh>

      {/* Ceiling, kept darker than the walls so the eye stays at eye level. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.height, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color={SURFACE.ceiling} roughness={1} />
      </mesh>

      {/* Four walls, each facing inward. */}
      <mesh position={[-halfW, ROOM.height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshStandardMaterial color={SURFACE.wall} roughness={0.95} />
      </mesh>
      <mesh position={[halfW, ROOM.height / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshStandardMaterial color={SURFACE.wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, -halfD]}>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshStandardMaterial color={SURFACE.wallDeep} roughness={0.95} />
      </mesh>
      {/* Near wall, built around the gate opening. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`gatewall-${side}`}
          position={[
            (side * (ROOM.width / 2 + PORTAL.width / 2)) / 2,
            ROOM.height / 2,
            halfD,
          ]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={[(ROOM.width - PORTAL.width) / 2, ROOM.height]} />
          <meshStandardMaterial color={SURFACE.wallDeep} roughness={0.95} />
        </mesh>
      ))}
      <mesh
        position={[
          0,
          PORTAL.height + (ROOM.height - PORTAL.height) / 2,
          halfD,
        ]}
        rotation={[0, Math.PI, 0]}
      >
        <planeGeometry args={[PORTAL.width, ROOM.height - PORTAL.height]} />
        <meshStandardMaterial color={SURFACE.wallDeep} roughness={0.95} />
      </mesh>

      {/* Gate: jambs, lintel and a lit reveal, with a short approach tunnel
          behind it. The intro flight comes in through here. */}
      <group position={[0, 0, halfD]}>
        {[-1, 1].map((side) => (
          <RoundedBox
            key={`jamb-${side}`}
            args={[0.42, PORTAL.height + 0.42, 0.5]}
            radius={0.05}
            smoothness={3}
            position={[side * (PORTAL.width / 2 + 0.21), (PORTAL.height + 0.42) / 2, 0]}
          >
            <meshStandardMaterial color={SURFACE.pilaster} roughness={0.55} metalness={0.35} />
          </RoundedBox>
        ))}

        <RoundedBox
          args={[PORTAL.width + 0.84, 0.42, 0.5]}
          radius={0.05}
          smoothness={3}
          position={[0, PORTAL.height + 0.21, 0]}
        >
          <meshStandardMaterial color={SURFACE.pilaster} roughness={0.55} metalness={0.35} />
        </RoundedBox>

        {/* Accent reveal around the opening. */}
        {[-1, 1].map((side) => (
          <mesh
            key={`reveal-jamb-${side}`}
            position={[side * (PORTAL.width / 2 - 0.01), PORTAL.height / 2, 0.26]}
          >
            <boxGeometry args={[0.02, PORTAL.height, 0.02]} />
            <meshBasicMaterial color={BRAND_COLORS.teal} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, PORTAL.height - 0.01, 0.26]}>
          <boxGeometry args={[PORTAL.width, 0.02, 0.02]} />
          <meshBasicMaterial color={BRAND_COLORS.teal} toneMapped={false} />
        </mesh>

        {/* Approach tunnel outside the hall. The leaves themselves live in
            <EntryGate>, which drives them from the intro flight. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, PORTAL.tunnel / 2]}>
          <planeGeometry args={[PORTAL.width, PORTAL.tunnel]} />
          <meshStandardMaterial color="#0a0f18" roughness={1} />
        </mesh>
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
            position={[side * (PORTAL.width / 2), PORTAL.height / 2, PORTAL.tunnel / 2]}
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

      {/* Shadow gap at the wall base — the detail that reads as architecture
          rather than as a textured box. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`reveal-${side}`}
          position={[side * (halfW - 0.05), 0.07, 0]}
          rotation={[0, (side * -Math.PI) / 2, 0]}
        >
          <planeGeometry args={[ROOM.depth, 0.14]} />
          <meshBasicMaterial color={SURFACE.reveal} />
        </mesh>
      ))}

      {/* Pilasters give the long walls a rhythm and a sense of scale. They
          run floor to ceiling — a pier that stops in mid-air reads as a
          modelling mistake, not as architecture. */}
      {[-1, 1].map((side) =>
        PILASTER_Z.map((z) => (
          <RoundedBox
            key={`pilaster-${side}-${z}`}
            args={[0.5, ROOM.height, 0.5]}
            radius={0.05}
            smoothness={3}
            position={[side * (halfW - 0.25), ROOM.height / 2, z]}
          >
            <meshStandardMaterial
              color={SURFACE.pilaster}
              roughness={0.6}
              metalness={0.25}
            />
          </RoundedBox>
        )),
      )}

      {/* Ceiling luminaires, flush with the soffit. The earlier cove was a
          pair of bulky beams running the length of the hall; recessed panels
          give the same light without the carpentry. */}
      {CEILING_LIGHT_Z.map((z) => (
        <mesh
          key={`luminaire-${z}`}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, ROOM.height - 0.02, z]}
        >
          <planeGeometry args={[3.6, 0.42]} />
          <meshBasicMaterial color="#e8eef4" toneMapped={false} />
        </mesh>
      ))}

      {/* Track lighting: a rail over each wall with one head per case, hung
          from the ceiling on drop rods and closed with rounded end caps. */}
      {[-1, 1].map((side) => {
        const trackX = side * (halfW - 2.2);
        const trackY = ROOM.height - 0.7;
        const trackLength = ROOM.depth - 2.4;

        return (
          <group key={`track-${side}`}>
            <mesh position={[trackX, trackY, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, trackLength, 12]} />
              <meshStandardMaterial color="#2a3344" roughness={0.45} metalness={0.65} />
            </mesh>

            {[-1, 1].map((end) => (
              <mesh
                key={`cap-${side}-${end}`}
                position={[trackX, trackY, (end * trackLength) / 2]}
              >
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshStandardMaterial color="#2a3344" roughness={0.45} metalness={0.65} />
              </mesh>
            ))}

            {TRACK_ROD_Z.map((z) => (
              <mesh
                key={`rod-${side}-${z}`}
                position={[trackX, ROOM.height - 0.35, z]}
              >
                <cylinderGeometry args={[0.012, 0.012, 0.7, 8]} />
                <meshStandardMaterial color="#2a3344" roughness={0.5} metalness={0.6} />
              </mesh>
            ))}

            {EXHIBITS.filter((exhibit) => exhibit.side === side).map(({ z }) => (
              <group key={`head-${side}-${z}`} position={[trackX, trackY - 0.12, z]}>
                <mesh rotation={[0, 0, side * 0.55]}>
                  <cylinderGeometry args={[0.07, 0.085, 0.26, 14]} />
                  <meshStandardMaterial color="#222b3a" roughness={0.4} metalness={0.7} />
                </mesh>
                <mesh
                  position={[side * 0.07, -0.12, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <circleGeometry args={[0.062, 14]} />
                  <meshBasicMaterial color="#fff6e6" toneMapped={false} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}

      {/* Carpet runner down the middle. Soft, matte, and it stops the polished
          floor from turning the whole hall into a mirror. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <planeGeometry args={[6.6, ROOM.depth - 5]} />
        <meshStandardMaterial color="#0c121c" roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 0]}>
        <planeGeometry args={[6.3, ROOM.depth - 5.4]} />
        <meshStandardMaterial color="#111a27" roughness={1} metalness={0} />
      </mesh>

      {/* Benches, aligned with the bays between the exhibits and set off the
          centre line so the walkway stays clear. */}
      {BENCH_Z.map((z) =>
        [-1, 1].map((side) => (
          <group key={`bench-${z}-${side}`} position={[side * 3.4, 0, z]}>
            <RoundedBox
              args={[0.62, 0.11, 2.2]}
              radius={0.05}
              smoothness={3}
              position={[0, 0.44, 0]}
            >
              <meshStandardMaterial color="#1b2432" roughness={0.7} metalness={0.15} />
            </RoundedBox>
            {[-1, 1].map((end) => (
              <RoundedBox
                key={`leg-${z}-${side}-${end}`}
                args={[0.5, 0.38, 0.1]}
                radius={0.035}
                smoothness={3}
                position={[0, 0.19, end * 0.85]}
              >
                <meshStandardMaterial color="#141c28" roughness={0.7} metalness={0.25} />
              </RoundedBox>
            ))}
          </group>
        )),
      )}

      {/* Floor inlay: two brand-coloured guide lines running the length of the
          hall. Wayfinding, and the only place the accents touch the room. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-(halfW - 4.4), 0.012, 0]}
      >
        <planeGeometry args={[0.05, ROOM.depth - 6]} />
        <meshBasicMaterial color={BRAND_COLORS.teal} toneMapped={false} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[halfW - 4.4, 0.012, 0]}
      >
        <planeGeometry args={[0.05, ROOM.depth - 6]} />
        <meshBasicMaterial color={BRAND_COLORS.violet} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------
   Door hardware — shared by the entry gate and the contact door.

   A sliding leaf reads as a plain box for three reasons, all of them fixable:
   one roughness value gives one specular blob, a flush slab has no shadow gap,
   and a pair of leaves modelled in the same plane cannot pass each other. The
   parts below are the fix, and both doors are built from them.
   ------------------------------------------------------------------------- */
const LEAF = {
  depth: 0.11,
  /** Inset of the face plate — this gap is what draws the border shadow. */
  border: 0.055,
  kickHeight: 0.26,
  /** Depth offset per leaf, so the pair overlaps the way real ones do. */
  stagger: 0.024,
};

/**
 * One set of steel materials per door. Built once and disposed with the door,
 * like every other generated asset in this file.
 */
function useDoorMaterials(width: number, height: number) {
  const materials = useMemo(() => {
    const { roughnessMap, normalMap } = createBrushedMetalMaps();

    // Roughly one tile per 0.9 m across the leaf, stretched along the grain so
    // the hairlines stay hairlines instead of widening into stripes. Whole
    // tiles only — a fractional repeat leaves a visible seam across the leaf.
    roughnessMap.repeat.set(
      Math.max(1, Math.round(width / 0.9)),
      Math.max(1, Math.round(height / 2.6)),
    );
    normalMap.repeat.copy(roughnessMap.repeat);

    const face = new THREE.MeshPhysicalMaterial({
      color: "#333e4c",
      metalness: 0.94,
      // The map carries the absolute value, so the scalar stays at 1.
      roughness: 1,
      roughnessMap,
      normalMap,
      normalScale: new THREE.Vector2(0.4, 0.1),
      // Brushed steel smears its highlight along the grain, which runs up the
      // leaf. That stretched highlight is the strongest cue in the whole door.
      anisotropy: 0.7,
      anisotropyRotation: Math.PI / 2,
      clearcoat: 0.14,
      clearcoatRoughness: 0.45,
      envMapIntensity: 1.1,
    });

    const body = new THREE.MeshStandardMaterial({
      color: "#232c39",
      metalness: 0.85,
      roughness: 0.45,
      envMapIntensity: 1.1,
    });

    const kick = new THREE.MeshStandardMaterial({
      color: "#2c3644",
      metalness: 0.9,
      roughness: 0.62,
      envMapIntensity: 1.2,
    });

    // The rubber safety edge is the one matte part of the door, which is
    // precisely what makes the steel beside it read as steel.
    const seal = new THREE.MeshStandardMaterial({
      color: "#080b11",
      metalness: 0,
      roughness: 0.95,
    });

    return { face, body, kick, seal, maps: [roughnessMap, normalMap] };
  }, [width, height]);

  useEffect(
    () => () => {
      materials.maps.forEach((map) => map.dispose());
      materials.face.dispose();
      materials.body.dispose();
      materials.kick.dispose();
      materials.seal.dispose();
    },
    [materials],
  );

  return materials;
}

/** A single sliding leaf, built up from its floor line. */
function DoorLeaf({
  width,
  height,
  materials,
  meetingSide,
  accent,
}: {
  width: number;
  height: number;
  materials: ReturnType<typeof useDoorMaterials>;
  /** +1 when this leaf's leading edge points along +X. */
  meetingSide: 1 | -1;
  accent?: string;
}) {
  const faceZ = LEAF.depth / 2 + 0.002;
  const panelWidth = width - LEAF.border * 2;
  const panelHeight = height - LEAF.border * 2;

  /**
   * A leaf is finished on both sides. The visitor sees the back of this pair
   * from inside the hall for the whole visit, and a bare carcass there is the
   * single thing that made the door read as a box.
   */
  const skin = (facing: 1 | -1) => (
    <group
      key={`skin-${facing}`}
      rotation={[0, facing === 1 ? 0 : Math.PI, 0]}
    >
      {/* Brushed plate, inset so the border becomes a shadow gap. */}
      <mesh position={[0, height / 2, faceZ]} material={materials.face}>
        <planeGeometry args={[panelWidth, panelHeight]} />
      </mesh>

      {/* Kick plate: same steel, scuffed, standing proud of the plate. */}
      <mesh
        position={[0, LEAF.border + LEAF.kickHeight / 2, faceZ + 0.005]}
        material={materials.kick}
      >
        <planeGeometry args={[panelWidth, LEAF.kickHeight]} />
      </mesh>

      {/* Hairline joint a third of the way up, the way a tall leaf is built
          from two sheets. It also gives the eye a scale reference. */}
      <mesh
        position={[0, height * 0.62, faceZ + 0.004]}
        material={materials.seal}
      >
        <boxGeometry args={[panelWidth, 0.008, 0.008]} />
      </mesh>
    </group>
  );

  return (
    <group>
      {/* Carcass. The chamfer on the rounded edge is what picks up a line of
          light along the whole leaf border. */}
      <RoundedBox
        args={[width, height, LEAF.depth]}
        radius={0.012}
        smoothness={2}
        position={[0, height / 2, 0]}
        material={materials.body}
      />

      {[1 as const, -1 as const].map((facing) => skin(facing))}

      {/* Rubber safety edge on the leading stile. */}
      <mesh
        position={[meetingSide * (width / 2 - 0.012), height / 2, 0]}
        material={materials.seal}
      >
        <boxGeometry args={[0.024, height, LEAF.depth + 0.006]} />
      </mesh>

      {accent
        ? [1, -1].map((facing) => (
            <mesh
              key={`accent-${facing}`}
              position={[
                meetingSide * (width / 2 - 0.038),
                height / 2,
                facing * (faceZ + 0.006),
              ]}
            >
              <boxGeometry args={[0.012, height - 0.44, 0.012]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          ))
        : null}
    </group>
  );
}

/** Threshold: a recessed slot with two rails, so the leaves run on something. */
function DoorSill({ width }: { width: number }) {
  return (
    <group>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 0.34, 0.32]} />
        <meshStandardMaterial color="#05080d" roughness={1} />
      </mesh>
      {[-0.06, 0.06].map((z) => (
        <mesh key={`rail-${z}`} position={[0, 0.011, z]}>
          <boxGeometry args={[width + 0.34, 0.022, 0.05]} />
          <meshStandardMaterial color="#39434f" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------
   The gate leaves. They part while the visitor flies in and close again once
   the hall is reached, so the room is sealed behind you.
   ------------------------------------------------------------------------- */
function EntryGate({ progress }: { progress: React.RefObject<number> }) {
  const leaves = useRef<(THREE.Group | null)[]>([null, null]);
  const opening = useRef(0);
  const wash = useMemo(() => new THREE.Object3D(), []);

  const halfLeaf = PORTAL.width / 4;
  const materials = useDoorMaterials(PORTAL.width / 2, PORTAL.height - 0.06);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const flight = progress.current ?? 0;

    // Open early in the approach, shut again as the hall is entered.
    const target = flight > 0.03 && flight < 0.82 ? 1 : 0;
    opening.current = THREE.MathUtils.lerp(
      opening.current,
      target,
      1 - Math.exp(-5 * delta),
    );

    leaves.current.forEach((leaf, index) => {
      if (!leaf) return;
      const side = index === 0 ? -1 : 1;
      leaf.position.set(
        side * (halfLeaf + opening.current * (halfLeaf * 2 + 0.1)),
        0,
        side * LEAF.stagger,
      );
    });
  });

  return (
    <group position={[0, 0, ROOM.depth / 2 - 0.16]}>
      <DoorSill width={PORTAL.width} />

      {/* Wall washer above the gate, aimed straight down the leaves. The
          brushed grain only shows under raking light. */}
      <primitive object={wash} position={[0, 0.2, -0.1]} />
      <spotLight
        position={[0, PORTAL.height + 0.9, -1.5]}
        target={wash}
        angle={0.72}
        penumbra={0.92}
        intensity={11}
        distance={9}
        decay={1.8}
        color="#dfe7f2"
      />

      {[0, 1].map((index) => (
        <group
          key={`leaf-${index}`}
          ref={(node) => {
            leaves.current[index] = node;
          }}
        >
          <DoorLeaf
            width={PORTAL.width / 2}
            height={PORTAL.height - 0.06}
            materials={materials}
            meetingSide={index === 0 ? 1 : -1}
            accent={BRAND_COLORS.teal}
          />
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Contact door — set into the end wall between the two founder panels. It
   slides open as the visitor approaches and becomes clickable while open.
   ------------------------------------------------------------------------- */
const CONTACT_DOOR = { width: 3.4, height: 3.6, trigger: 7 };

function ContactDoor() {
  const leaves = useRef<(THREE.Group | null)[]>([null, null]);
  const sign = useRef<THREE.Mesh>(null);
  const opening = useRef(0);

  const halfD = ROOM.depth / 2;
  const doorZ = -halfD + 0.06;

  const signTexture = useMemo(() => createSignTexture(), []);
  const materials = useDoorMaterials(
    CONTACT_DOOR.width / 2,
    CONTACT_DOOR.height,
  );

  useEffect(() => () => signTexture.dispose(), [signTexture]);

  useFrame(({ camera }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);

    const distance = Math.hypot(
      camera.position.x,
      camera.position.z - doorZ,
    );
    const target = distance < CONTACT_DOOR.trigger ? 1 : 0;

    opening.current = THREE.MathUtils.lerp(
      opening.current,
      target,
      1 - Math.exp(-4.5 * delta),
    );

    leaves.current.forEach((leaf, index) => {
      if (!leaf) return;
      const side = index === 0 ? -1 : 1;
      leaf.position.set(
        side * (CONTACT_DOOR.width / 4 + opening.current * (CONTACT_DOOR.width / 2)),
        0,
        0.14 + side * LEAF.stagger,
      );
    });

    // Only clickable once the doorway is actually open.
    if (sign.current) {
      sign.current.name = opening.current > 0.55 ? "aim-target" : "";
    }
  });

  return (
    <group position={[0, 0, doorZ]}>
      {/* Backing plate and sign. Both sit *in front* of the end wall — the
          first version put them behind it, where the wall hid them. */}
      <mesh position={[0, CONTACT_DOOR.height / 2, 0.01]}>
        <planeGeometry args={[CONTACT_DOOR.width, CONTACT_DOOR.height]} />
        <meshStandardMaterial color="#0a0f18" roughness={1} />
      </mesh>

      <mesh
        ref={sign}
        position={[0, CONTACT_DOOR.height / 2, 0.03]}
        userData={{ label: "Kontakt", action: "contact" }}
      >
        <planeGeometry args={[2.9, 2.9]} />
        <meshBasicMaterial map={signTexture} transparent toneMapped={false} />
      </mesh>

      <pointLight
        position={[0, CONTACT_DOOR.height / 2, 1.1]}
        intensity={16}
        distance={7}
        decay={1.6}
        color={BRAND_COLORS.teal}
      />

      {/* Reveal around the opening. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`contact-reveal-${side}`}
          position={[side * (CONTACT_DOOR.width / 2 + 0.06), CONTACT_DOOR.height / 2, 0.14]}
        >
          <boxGeometry args={[0.12, CONTACT_DOOR.height + 0.24, 0.14]} />
          <meshStandardMaterial color={SURFACE.pilaster} roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, CONTACT_DOOR.height + 0.12, 0.14]}>
        <boxGeometry args={[CONTACT_DOOR.width + 0.24, 0.12, 0.14]} />
        <meshStandardMaterial color={SURFACE.pilaster} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, CONTACT_DOOR.height + 0.02, 0.22]}>
        <boxGeometry args={[CONTACT_DOOR.width, 0.02, 0.02]} />
        <meshBasicMaterial color={BRAND_COLORS.teal} toneMapped={false} />
      </mesh>

      {/* Threshold and the two sliding leaves. */}
      <DoorSill width={CONTACT_DOOR.width} />

      {[0, 1].map((index) => (
        <group
          key={`contact-leaf-${index}`}
          ref={(node) => {
            leaves.current[index] = node;
          }}
          position={[0, 0, 0.14]}
        >
          <DoorLeaf
            width={CONTACT_DOOR.width / 2}
            height={CONTACT_DOOR.height}
            materials={materials}
            meetingSide={index === 0 ? 1 : -1}
            accent={BRAND_COLORS.teal}
          />
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Planting — snake plants in the four corners and beside the benches.

   The corners are dead space: the movement clamp keeps the visitor two metres
   off the walls, so nothing there is ever walked into. Filling them is what
   every real gallery does, and it is the cheapest way to stop the hall from
   reading as an empty render.
   ------------------------------------------------------------------------- */
const PLANTER = {
  corner: {
    pot: 0.54,
    potHeight: 0.72,
    plant: { blades: 11, height: 1.8, width: 0.2, spread: 0.62, seed: 7 },
  },
  bench: {
    pot: 0.32,
    potHeight: 0.46,
    plant: { blades: 7, height: 1.0, width: 0.14, spread: 0.54, seed: 23 },
  },
} as const;

type PlanterVariant = keyof typeof PLANTER;

function Planting() {
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;

  const foliage = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const plants = useMemo(
    () => ({
      corner: createPlantGeometry(PLANTER.corner.plant),
      bench: createPlantGeometry(PLANTER.bench.plant),
    }),
    [],
  );

  useEffect(
    () => () => {
      plants.corner.dispose();
      plants.bench.dispose();
      foliage.dispose();
    },
    [plants, foliage],
  );

  /**
   * Corners first, then one pot per bench, set outboard of the seat so the
   * walkway stays clear. The accent ring picks up the floor guide line on
   * that side of the hall, teal to the left and violet to the right.
   */
  const spots = useMemo(() => {
    const list: {
      key: string;
      variant: PlanterVariant;
      position: [number, number, number];
      accent: string;
    }[] = [];

    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        list.push({
          key: `corner-${x}-${z}`,
          variant: "corner",
          position: [x * (halfW - 1.9), 0, z * (halfD - 2.7)],
          accent: x < 0 ? BRAND_COLORS.teal : BRAND_COLORS.violet,
        });
      }
    }

    for (const z of BENCH_Z) {
      for (const side of [-1, 1]) {
        list.push({
          key: `bench-${z}-${side}`,
          variant: "bench",
          position: [side * 4.5, 0, z + 1.35],
          accent: side < 0 ? BRAND_COLORS.teal : BRAND_COLORS.violet,
        });
      }
    }

    return list;
  }, [halfW, halfD]);

  /**
   * One bin per bench row, alternating sides so the hall does not read as a
   * mirrored diagram. Set behind the seat, out of the walkway.
   */
  const bins = useMemo(
    () =>
      BENCH_Z.map((z, row) => ({
        key: `bin-${z}`,
        position: [(row % 2 === 0 ? -1 : 1) * 4.5, 0, z - 1.5] as [
          number,
          number,
          number,
        ],
      })),
    [],
  );

  return (
    <group>
      {bins.map(({ key, position }) => (
        <WasteBin key={key} position={position} />
      ))}

      {spots.map(({ key, variant, position, accent }) => {
        const { pot, potHeight } = PLANTER[variant];

        return (
          <group key={key} position={position}>
            {/* A planter is an open box with a wall thickness: outer face,
                inner face, and a rim joining the two. The first version was a
                solid block with a round disc laid on the lid, which from a
                metre away is exactly what it looked like. Everything is turned
                45° so the hall keeps the plinth's geometric language. */}
            <group rotation={[0, Math.PI / 4, 0]}>
              <mesh position={[0, potHeight / 2, 0]}>
                <cylinderGeometry
                  args={[pot * 0.94, pot * 0.76, potHeight, 4, 1, true]}
                />
                <meshStandardMaterial color="#1b2432" roughness={0.62} metalness={0.2} />
              </mesh>

              {/* Inner face, seen from inside — hence BackSide. */}
              <mesh position={[0, potHeight / 2 + 0.04, 0]}>
                <cylinderGeometry
                  args={[pot * 0.86, pot * 0.7, potHeight - 0.08, 4, 1, true]}
                />
                <meshStandardMaterial
                  color="#0a0f16"
                  roughness={0.95}
                  side={THREE.BackSide}
                />
              </mesh>

              {/* Rim: the square annulus that gives the wall its thickness. */}
              <mesh
                position={[0, potHeight + 0.002, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[pot * 0.86, pot * 0.94, 4]} />
                <meshStandardMaterial
                  color="#2c3646"
                  roughness={0.32}
                  metalness={0.62}
                  side={THREE.DoubleSide}
                />
              </mesh>

              {/* Accent line below the rim. Open-ended: a capped cylinder is
                  a disc, and through the open planter that disc reads as a
                  glowing lid sitting where the soil should be. */}
              <mesh position={[0, potHeight - 0.06, 0]}>
                <cylinderGeometry
                  args={[pot * 0.945, pot * 0.945, 0.012, 4, 1, true]}
                />
                <meshBasicMaterial
                  color={accent}
                  toneMapped={false}
                  side={THREE.DoubleSide}
                />
              </mesh>

              {/* Soil, square like the pot and set well below the rim, so the
                  eye reads a filled planter rather than a lid. */}
              <mesh position={[0, potHeight - 0.13, 0]}>
                <cylinderGeometry args={[pot * 0.84, pot * 0.82, 0.09, 4, 1]} />
                <meshStandardMaterial color="#070a0f" roughness={1} />
              </mesh>
            </group>

            <mesh
              geometry={plants[variant]}
              material={foliage}
              position={[0, potHeight - 0.1, 0]}
            />
          </group>
        );
      })}
    </group>
  );
}

/**
 * Waste bin — a lidless drum with a steel band and a liner set deep enough
 * that the opening reads as a hole rather than a dark circle painted on top.
 */
function WasteBin({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Body, very slightly tapered. */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.19, 0.165, 0.64, 20, 1, true]} />
        <meshStandardMaterial
          color="#1b2432"
          roughness={0.55}
          metalness={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Steel band under the rim — the one bright edge on the whole thing.
          Open-ended, or its cap is a polished disc lying across the opening. */}
      <mesh position={[0, 0.585, 0]}>
        <cylinderGeometry args={[0.197, 0.197, 0.075, 20, 1, true]} />
        <meshStandardMaterial
          color="#2f3a4a"
          roughness={0.3}
          metalness={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Rim. */}
      <mesh position={[0, 0.624, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.148, 0.197, 24]} />
        <meshStandardMaterial
          color="#38434f"
          roughness={0.34}
          metalness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Liner and its floor, both matte: a bin is a hole, not a mirror. */}
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.148, 0.135, 0.36, 20, 1, true]} />
        <meshStandardMaterial color="#080b11" roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 0.262, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.135, 20]} />
        <meshStandardMaterial color="#0a0e14" roughness={1} />
      </mesh>

      {/* Recessed foot, the same shadow gap the walls get at their base. */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.152, 0.158, 0.04, 20, 1]} />
        <meshStandardMaterial color="#0c1219" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------
   Barriers — stanchions and a rope in front of every case, so nobody walks
   into the artwork. The movement clamp (ROOM.wallClearance) enforces the same
   line, this is what makes the rule visible.
   ------------------------------------------------------------------------- */
function Barriers() {
  const halfW = ROOM.width / 2;

  const ropeGeometry = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.86, -1.75),
      new THREE.Vector3(0, 0.62, 0),
      new THREE.Vector3(0, 0.86, 1.75),
    );
    return new THREE.TubeGeometry(curve, 24, 0.028, 8, false);
  }, []);

  return (
    <group>
      {EXHIBITS.map(({ key, side, z }) => (
        <group
          key={`barrier-${key}`}
          position={[side * (halfW - ROOM.wallClearance + 0.35), 0, z]}
        >
          {[-1, 1].map((end) => (
            <group key={`post-${end}`} position={[0, 0, end * 1.75]}>
              <mesh position={[0, 0.02, 0]}>
                <cylinderGeometry args={[0.17, 0.19, 0.04, 20]} />
                <meshStandardMaterial color="#1a2331" roughness={0.5} metalness={0.4} />
              </mesh>
              <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.032, 0.038, 0.86, 14]} />
                <meshStandardMaterial color="#33405a" roughness={0.3} metalness={0.75} />
              </mesh>
              <mesh position={[0, 0.9, 0]}>
                <sphereGeometry args={[0.05, 16, 16]} />
                <meshStandardMaterial color="#33405a" roughness={0.25} metalness={0.85} />
              </mesh>
            </group>
          ))}

          <mesh geometry={ropeGeometry}>
            <meshStandardMaterial
              color={BRAND_COLORS.violet}
              roughness={0.85}
              metalness={0}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Gaze picking — pointer lock hides the cursor, so the crosshair does the
   pointing. The centre ray is cast every few frames; a hit arms the click
   handler in the overlay, which opens the case in a new tab.
   ------------------------------------------------------------------------- */
export type AimTarget = {
  label: string;
  /** External case link, opened in a new tab. */
  url?: string;
  /** In-page action instead of a link. */
  action?: "contact";
};

function GazePicker({ onAim }: { onAim: (target: AimTarget | null) => void }) {
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
    const target = hit?.object.userData as AimTarget | undefined;
    const key = target ? (target.url ?? target.action ?? null) : null;

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
function Exhibits() {
  const maps = useTexture(CASES.map((entry) => entry.image));

  const captions = useMemo(
    () =>
      EXHIBITS.map(({ entry, index, slot }) =>
        entry
          ? createCaptionTexture(entry, index)
          : createPlaceholderCaption(slot),
      ),
    [],
  );

  /** Only the empty slots get a plate drawn for them; the rest use captures. */
  const reserved = useMemo(
    () =>
      EXHIBITS.map(({ entry, slot }) =>
        entry ? null : createPlaceholderPlate(slot),
      ),
    [],
  );

  useEffect(
    () => () => {
      captions.forEach((texture) => texture.dispose());
      reserved.forEach((texture) => texture?.dispose());
    },
    [captions, reserved],
  );

  useLayoutEffect(() => {
    maps.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    });
  }, [maps]);

  const halfW = ROOM.width / 2;

  return (
    <group>
      {EXHIBITS.map(({ entry, index, side, z, key }) => (
        <group
          key={key}
          position={[side * (halfW - 0.08), FRAME.centreY, z]}
          rotation={[0, (side * -Math.PI) / 2, 0]}
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
              <meshBasicMaterial map={maps[index]} toneMapped={false} />
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
   Picture lights — one spot per exhibit, hung on the track and aimed at the
   centre of its own frame, so the cone actually lands on the work.
   ------------------------------------------------------------------------- */
function ExhibitLights() {
  const halfW = ROOM.width / 2;

  const targets = useMemo(
    () =>
      EXHIBITS.map(({ side, z }) => {
        const target = new THREE.Object3D();
        target.position.set(side * (halfW - 0.3), FRAME.centreY, z);
        return target;
      }),
    [halfW],
  );

  return (
    <group>
      {EXHIBITS.map(({ entry, side, z, key }, index) => (
        <group key={`light-${key}`}>
          <primitive object={targets[index]} />
          <spotLight
            position={[side * (halfW - 2.2), ROOM.height - 0.85, z]}
            target={targets[index]}
            angle={0.5}
            penumbra={0.6}
            intensity={entry ? 110 : 44}
            distance={14}
            decay={1.55}
            color={entry ? "#fff4e4" : "#dce6f2"}
          />
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------
   The founders' wall at the far end: one panel each, lit like the cases.
   MEMBERS[0] hangs on the right as you walk in — swap the array to swap sides.
   ------------------------------------------------------------------------- */
function TeamWall() {
  const halfD = ROOM.depth / 2;

  const panels = useMemo<PortraitPanel[]>(
    () => MEMBERS.map((member) => createPortraitPanel(member)),
    [],
  );

  useEffect(() => {
    MEMBERS.forEach((member, index) => {
      if (!member.photo) return;

      const image = new Image();
      image.decoding = "async";
      // No photo yet? The drawn placeholder stays, which is a finished panel.
      image.onload = () => panels[index].paint(image);
      image.src = member.photo;
    });

    return () => panels.forEach((panel) => panel.texture.dispose());
  }, [panels]);

  // The targets are children of the panel group, so their positions are
  // local: dead centre of the panel they belong to.
  const targets = useMemo(
    () =>
      MEMBERS.map(() => {
        const target = new THREE.Object3D();
        target.position.set(0, 0, 0.1);
        return target;
      }),
    [],
  );

  return (
    <group>
      {/* Fill for the whole end wall, so the two panels sit in a lit bay
          instead of floating in the dark. */}
      <pointLight
        position={[0, 3.4, -halfD + 3.5]}
        intensity={30}
        distance={16}
        decay={1.6}
        color="#e8eef4"
      />

      {MEMBERS.map((member, index) => {
        const x = index === 0 ? 6 : -6;
        const accent =
          member.accent === "teal" ? BRAND_COLORS.teal : BRAND_COLORS.violet;

        return (
          <group key={member.slug} position={[x, 2.7, -halfD + 0.08]}>
            <RoundedBox
              args={[3.88, 5.08, 0.12]}
              radius={0.05}
              smoothness={3}
              position={[0, 0, -0.05]}
            >
              <meshStandardMaterial color="#0b1017" roughness={0.55} metalness={0.2} />
            </RoundedBox>

            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[3.6, 4.8]} />
              <meshBasicMaterial map={panels[index].texture} toneMapped={false} />
            </mesh>

            <mesh position={[0, -2.62, 0.03]}>
              <planeGeometry args={[3.88, 0.022]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>

            <primitive object={targets[index]} />
            <spotLight
              position={[0, 2.5, 3.6]}
              target={targets[index]}
              angle={0.5}
              penumbra={0.6}
              intensity={120}
              distance={14}
              decay={1.5}
              color="#fff4e4"
            />
          </group>
        );
      })}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Centrepiece — the extruded mark on a plinth, same geometry as the hero.
   ------------------------------------------------------------------------- */
function MarkPlinth() {
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

      {/* Gallery spot from directly above, aimed at the piece. */}
      <primitive object={spotTarget} position={[0, 2.3, 0]} />
      <spotLight
        position={[0, ROOM.height - 0.6, 0]}
        target={spotTarget}
        angle={0.38}
        penumbra={0.9}
        intensity={55}
        distance={11}
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
   * Last line of defence. The triggers already disappear on a touch device,
   * but the room must also refuse to open if the answer changes underneath
   * it — switching on the DevTools device toolbar does exactly that.
   */
  const walkable = useWalkableSupport();
  const [aim, setAim] = useState<AimTarget | null>(null);
  const [arrived, setArrived] = useState(false);

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

  const requestLock = useCallback(() => {
    try {
      controls.current?.lock();
    } catch {
      // Still inside the cool-down — keep the gate up and let the user retry.
      setLockReady(false);
      window.setTimeout(() => setLockReady(true), 1400);
    }
  }, []);

  // Any element with data-walkable-trigger opens the room — no prop drilling.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-walkable-trigger]")) {
        event.preventDefault();
        if (walkable === "unsupported") return;
        setOpen(true);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [walkable]);

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
    introProgress.current = 0;
  }, []);

  /**
   * Left click while the crosshair sits on a case opens the live site in a new
   * tab. Under pointer lock the cursor position is frozen, so the DOM click
   * target is meaningless — the aim comes from the centre ray instead.
   */
  useEffect(() => {
    if (!open || !locked || !aim) return;

    const onClick = () => {
      if (aim.action === "contact") {
        close();
        // Leave the room, then land on the contact block of the page.
        window.setTimeout(() => {
          const target = document.getElementById("kontakt");
          if (!target) return;
          const top = target.getBoundingClientRect().top + window.scrollY;
          if (window.__lenis) window.__lenis.scrollTo(top);
          else window.scrollTo({ top, behavior: "smooth" });
        }, 320);
        return;
      }

      if (aim.url) window.open(aim.url, "_blank", "noopener,noreferrer");
    };

    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [open, locked, aim, close]);

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE_BRAND }}
          className="fixed inset-0 z-[90] bg-ink-900"
          role="dialog"
          aria-modal="true"
          aria-label="Begehbarer 3D-Raum"
        >
          {walkable === "unsupported" ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
              <p className="tag">EXPERIMENTAL / DESKTOP</p>
              <p className="max-w-[34ch] text-lg leading-snug">
                Der begehbare Raum braucht Maus und Tastatur: das Umsehen
                läuft über die Pointer-Lock-API, die es auf dem Handy nicht
                gibt. Auf dem Desktop öffnet er sich in voller Auflösung.
              </p>
              <button
                type="button"
                onClick={close}
                className="rounded-full border border-line px-6 py-3 text-[13px]"
              >
                Zurück zur Seite
              </button>
            </div>
          ) : (
            <>
              <KeyboardControls map={KEY_MAP}>
                <Canvas
                  dpr={[1, 1.75]}
                  gl={{ antialias: true, powerPreference: "high-performance" }}
                  camera={{ fov: 62, near: 0.05, far: 140 }}
                  onCreated={({ gl }) => {
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.15;
                  }}
                >
                  <color attach="background" args={["#0b0f18"]} />
                  <fog attach="fog" args={["#0b0f18", 16, 62]} />

                  {/* Base illumination: a soft fill plus two broad sources
                      standing in for the cove strips overhead. */}
                  <ambientLight intensity={0.85} />
                  <hemisphereLight
                    args={["#cdd8e4", "#0b1018", 1]}
                    position={[0, ROOM.height, 0]}
                  />

                  {/* A row of ceiling sources instead of two hot spots — an
                      even wash is what makes a space read as architecture. */}
                  {CEILING_LIGHT_Z.map((z) => (
                    <pointLight
                      key={`ceiling-${z}`}
                      position={[0, ROOM.height - 1.1, z]}
                      intensity={26}
                      distance={24}
                      decay={1.5}
                      color="#e8eef4"
                    />
                  ))}

                  <RoomShell />
                  <EntryGate progress={introProgress} />
                  <ContactDoor />
                  <Barriers />
                  <Planting />
                  <MarkPlinth />
                  <ExhibitLights />
                  <GazePicker onAim={setAim} />

                  {/* Only the captures suspend; the room is up immediately. */}
                  <Suspense fallback={null}>
                    <Exhibits />
                  </Suspense>

                  <TeamWall />

                  <Environment resolution={128}>
                    <Lightformer
                      form="rect"
                      intensity={1.6}
                      color="#f3f6f8"
                      position={[0, ROOM.height - 0.4, 0]}
                      scale={[14, 26, 1]}
                      rotation={[Math.PI / 2, 0, 0]}
                    />
                    <Lightformer
                      form="rect"
                      intensity={0.9}
                      color={BRAND_COLORS.teal}
                      position={[-6, 3, 0]}
                      scale={[3, 10, 1]}
                      rotation={[0, Math.PI / 2, 0]}
                    />
                    <Lightformer
                      form="rect"
                      intensity={0.9}
                      color={BRAND_COLORS.violet}
                      position={[6, 3, 0]}
                      scale={[3, 10, 1]}
                      rotation={[0, -Math.PI / 2, 0]}
                    />
                  </Environment>

                  <Player
                    controls={controls}
                    progress={introProgress}
                    started={locked}
                    onLockChange={handleLockChange}
                    onArrived={() => setArrived(true)}
                  />
                </Canvas>
              </KeyboardControls>

              {/* HUD */}
              <div className="pointer-events-none absolute inset-0 z-10">
                <div className="absolute left-6 top-6 flex items-center gap-3">
                  <span className="tag text-frost">MAGNARIS / SPACE</span>
                  <span className="h-px w-8 bg-line" />
                  <span className="tag">WALKABLE ROOM · BUILD 0.2</span>
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
                      {ambience.enabled ? "Ton an" : "Ton aus"}
                    </button>

                    <span className="h-4 w-px bg-line" />

                    {/* Pointer lock hides the cursor, so this slider only
                        serves the entry gate; inside the room +/- does the
                        same job and the readout keeps both in sync. */}
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
                  </div>
                )}

                {locked && !arrived && (
                  <span className="absolute left-1/2 top-[58%] -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.3em] text-frost/70">
                    Anflug
                  </span>
                )}

                {locked && arrived && (
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
                          : `Linksklick — ${aim.label} öffnen ↗`}
                      </span>
                    )}
                  </>
                )}

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
              </div>

              {/* Entry gate — pointer lock must start from a user gesture. */}
              <AnimatePresence>
                {!locked && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-ink-900/70 backdrop-blur-sm"
                  >
                    <div className="text-center">
                      <p className="tag">02 / SPACE</p>
                      <h2 className="mt-4 text-headline font-semibold uppercase">
                        Betritt den Raum
                      </h2>
                      <p className="mx-auto mt-4 max-w-[42ch] text-sm text-steel">
                        Klicken sperrt den Mauszeiger. Mit W A S D bewegst du
                        dich, Escape bringt dich zurück auf die Seite.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={requestLock}
                      disabled={!lockReady}
                      className="rounded-full bg-frost px-8 py-4 text-[13px] font-medium text-ink transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-45 disabled:hover:translate-y-0"
                    >
                      {lockReady ? "Mauszeiger sperren" : "Einen Moment …"}
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
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default WalkableRoom;
