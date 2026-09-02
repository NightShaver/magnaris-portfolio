"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Float, Lightformer } from "@react-three/drei";
import * as THREE from "three";

import { LOGO_PARTS, LOGO_SCALE, type LogoPart } from "@/lib/logo";
import { createLogoGeometry } from "@/lib/logoGeometry";

/**
 * The composer lives in its own chunk: a phone skips the pass, and this way
 * it skips the download too. See components/hero/HeroPost.tsx.
 */
const HeroPost = dynamic(() => import("./HeroPost").then((mod) => mod.HeroPost), {
  ssr: false,
});

/** Brandboard colours, mirrored for the WebGL side. */
export const BRAND_COLORS = {
  ink: "#111723",
  teal: "#0f8e91",
  violet: "#6f63c7",
  steel: "#8d98a6",
  frost: "#f3f6f8",
} as const;

type SceneProps = {
  /** Pointer position in normalised device coordinates, -1..1. */
  pointer: React.RefObject<THREE.Vector2>;
  reducedMotion?: boolean;
  /**
   * The cheap profile. A phone pays for every full-screen pass, so on one the
   * scene drops the composer, halves the environment map, thins the dust and
   * trades the clearcoat shader for a plain one. The composition, the colours
   * and the motion stay identical — only the trimmings that cost a frame go.
   */
  lowPower?: boolean;
};

/* -------------------------------------------------------------------------
   Camera rig — the scene leans toward the cursor, damped, never snapping.
   ------------------------------------------------------------------------- */
function Rig({ pointer, reducedMotion }: SceneProps) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const damp = 1 - Math.pow(0.0015, delta);

    camera.position.x += (pointer.current!.x * 0.75 - camera.position.x) * damp;
    camera.position.y += (pointer.current!.y * 0.45 - camera.position.y) * damp;
    camera.lookAt(target);
  });

  return null;
}

function LogoPartMesh({ part, lowPower }: { part: LogoPart; lowPower?: boolean }) {
  const geometry = useMemo(() => createLogoGeometry(part), [part]);
  const edges = useMemo(
    () => new THREE.EdgesGeometry(geometry, 20),
    [geometry],
  );

  if (part.role === "solid") {
    return (
      <group>
        <mesh geometry={geometry} castShadow receiveShadow>
          {/* Machined dark metal: the "corporate trust" half of the brand.
              Clearcoat is a second specular lobe — worth it on a desktop GPU,
              not on a phone, where the standard material reads the same at
              this size. */}
          {lowPower ? (
            <meshStandardMaterial
              color="#1b2434"
              metalness={0.9}
              roughness={0.24}
              envMapIntensity={2.2}
            />
          ) : (
            <meshPhysicalMaterial
              color="#1b2434"
              metalness={0.92}
              roughness={0.2}
              clearcoat={0.8}
              clearcoatRoughness={0.2}
              envMapIntensity={2.2}
            />
          )}
        </mesh>
        {/* Hairline along every hard edge — reads as CAD, not as clay. */}
        <lineSegments geometry={edges}>
          <lineBasicMaterial
            color={BRAND_COLORS.frost}
            transparent
            opacity={0.22}
          />
        </lineSegments>
      </group>
    );
  }

  const accent =
    part.role === "teal" ? BRAND_COLORS.teal : BRAND_COLORS.violet;

  return (
    <mesh geometry={geometry} castShadow>
      {/* The shards carry the light — Bloom picks these up, nothing else. */}
      <meshStandardMaterial
        color={accent}
        emissive={accent}
        emissiveIntensity={part.role === "teal" ? 1.15 : 0.9}
        metalness={0.35}
        roughness={0.28}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * THE MARK — placeholder for an authored asset.
 *
 * This is generated from the logo polygons, so it is on-brand by construction
 * and needs no binary. To swap in a sculpted version, replace the body with:
 *
 *   const { scene } = useGLTF("/models/magnaris-mark.glb");
 *   return <primitive object={scene} ref={group} dispose={null} />;
 *
 * Keep the group transforms below; the motion is tuned to them.
 */
function MagnarisMark({ pointer, reducedMotion, lowPower }: SceneProps) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (reducedMotion) {
      group.current.rotation.set(-0.06, -0.35, 0);
      return;
    }

    const damp = 1 - Math.pow(0.002, delta);
    const drift = Math.sin(state.clock.elapsedTime * 0.32) * 0.22;

    // Cursor steers the yaw; a slow sine keeps it alive when nobody moves.
    const targetY = pointer.current!.x * 0.5 + drift - 0.42;
    const targetX = -pointer.current!.y * 0.28 - 0.08;

    group.current.rotation.y += (targetY - group.current.rotation.y) * damp;
    group.current.rotation.x += (targetX - group.current.rotation.x) * damp;
  });

  return (
    <group ref={group} scale={LOGO_SCALE * 1.15}>
      {LOGO_PARTS.map((part) => (
        <LogoPartMesh key={part.id} part={part} lowPower={lowPower} />
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Atmosphere. Dust only — the mark carries the frame on its own.
   ------------------------------------------------------------------------- */
function DustField({
  count = 380,
  reducedMotion,
}: {
  count?: number;
  reducedMotion?: boolean;
}) {
  const points = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 3.2 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      array[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      array[i * 3 + 1] = (Math.random() - 0.5) * 6;
      array[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return array;
  }, [count]);

  useFrame((_, delta) => {
    if (reducedMotion || !points.current) return;
    points.current.rotation.y += delta * 0.018;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.016}
        sizeAttenuation
        color={BRAND_COLORS.steel}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </points>
  );
}

export function HeroScene({ pointer, reducedMotion, lowPower }: SceneProps) {
  return (
    <>
      <color attach="background" args={[BRAND_COLORS.ink]} />
      <fog attach="fog" args={[BRAND_COLORS.ink, 7, 17]} />

      <Rig pointer={pointer} reducedMotion={reducedMotion} />

      <ambientLight intensity={0.28} />
      <directionalLight
        position={[4, 6, 4]}
        intensity={2.4}
        color={BRAND_COLORS.frost}
      />
      <pointLight
        position={[-4.5, -1.5, -2]}
        intensity={22}
        color={BRAND_COLORS.violet}
      />
      <pointLight
        position={[3.5, 1.5, 4]}
        intensity={14}
        color={BRAND_COLORS.teal}
      />

      <Float
        speed={reducedMotion ? 0 : 1}
        rotationIntensity={0}
        floatIntensity={reducedMotion ? 0 : 0.45}
        floatingRange={[-0.08, 0.08]}
      >
        <MagnarisMark
          pointer={pointer}
          reducedMotion={reducedMotion}
          lowPower={lowPower}
        />
      </Float>

      <DustField count={lowPower ? 160 : 380} reducedMotion={reducedMotion} />

      {/* Studio lighting built from lightformers — no external HDRI request,
          so the hero renders identically offline and on first paint. */}
      <Environment resolution={lowPower ? 128 : 256}>
        <Lightformer
          form="rect"
          intensity={3.2}
          color={BRAND_COLORS.frost}
          position={[0, 4, -6]}
          scale={[10, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2.4}
          color={BRAND_COLORS.frost}
          position={[0, -3, 4]}
          scale={[8, 3, 1]}
        />
        <Lightformer
          form="circle"
          intensity={4}
          color={BRAND_COLORS.teal}
          position={[-5, 1, 2]}
          scale={[4, 4, 1]}
        />
        <Lightformer
          form="circle"
          intensity={3}
          color={BRAND_COLORS.violet}
          position={[5, -2, 2]}
          scale={[4, 4, 1]}
        />
      </Environment>

      {/* The composer is the single most expensive thing in this scene, so a
          phone does without it. The shards are emissive and untone-mapped
          either way, so they still read as light sources — just without the
          halo around them. */}
      {!lowPower && <HeroPost />}

      <AdaptiveDpr pixelated />
    </>
  );
}
