"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { CASES } from "@/lib/site";
import { createCasePlate, type CasePlate } from "@/lib/caseTexture";

/* ==========================================================================
   CASE PLATE — WebGL hover distortion
   --------------------------------------------------------------------------
   One plane, two texture slots. Hovering a row pushes the new plate into slot
   B and animates a mix; the mix itself is displaced by a cheap noise field
   and skewed by the pointer velocity, so the image behaves like something
   physical being dragged rather than a CSS cross-fade.

   The DOM list stays the source of truth for links, focus and screen readers —
   this canvas is decoration and is marked aria-hidden.
   ========================================================================== */

// 1.6:1 — the aspect the captures in /public/cases are taken at.
const PLATE = { width: 560, height: 350 };

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform vec2  uVelocity;
  varying vec2  vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Trailing wobble: the plate lags behind the cursor, then settles.
    float wave = sin(uv.x * 3.14159) * sin(uv.y * 3.14159);
    pos.z += wave * (uVelocity.x * 0.35 + sin(uTime * 1.6) * 4.0) * uHover;
    pos.x += wave * uVelocity.x * 0.18;
    pos.y += wave * uVelocity.y * 0.18;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uTextureA;
  uniform sampler2D uTextureB;
  uniform float uProgress;
  uniform float uTime;
  uniform float uHover;
  uniform vec2  uVelocity;
  varying vec2  vUv;

  // Cheap value noise — enough character without a texture lookup.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = vUv;

    float n = noise(uv * 6.0 + uTime * 0.12);
    float mask = smoothstep(uProgress - 0.35, uProgress + 0.35, uv.x + n * 0.3);

    // Displacement peaks mid-transition, so the swap tears rather than fades.
    float push = (1.0 - abs(uProgress * 2.0 - 1.0)) * 0.09;
    vec2 uvA = uv + vec2(n - 0.5, 0.0) * push + uVelocity * 0.0006;
    vec2 uvB = uv - vec2(n - 0.5, 0.0) * push + uVelocity * 0.0006;

    // Chromatic split, scaled by pointer speed.
    float split = (0.002 + abs(uVelocity.x) * 0.00004) * uHover;

    vec4 a = vec4(
      texture2D(uTextureA, uvA + vec2(split, 0.0)).r,
      texture2D(uTextureA, uvA).g,
      texture2D(uTextureA, uvA - vec2(split, 0.0)).b,
      1.0
    );
    vec4 b = vec4(
      texture2D(uTextureB, uvB + vec2(split, 0.0)).r,
      texture2D(uTextureB, uvB).g,
      texture2D(uTextureB, uvB - vec2(split, 0.0)).b,
      1.0
    );

    vec4 color = mix(a, b, 1.0 - mask);

    // Rounded corners + edge falloff, done in the shader to avoid a mask mesh.
    vec2 d = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.94, 1.0, max(d.x, d.y));

    gl_FragColor = vec4(color.rgb, color.a * uHover * edge);
  }
`;

type PlateProps = {
  activeIndex: React.RefObject<number>;
  pointer: React.RefObject<{ x: number; y: number }>;
};

function Plate({ activeIndex, pointer }: PlateProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const { size } = useThree();

  /**
   * One plate per case, built on first use and never swapped afterwards.
   *
   * The plate owns a canvas: it is drawn with the branded furniture (ghost
   * index, client, discipline line, frame) straight away, and repainted with
   * the real capture behind that furniture once the file decodes. Because the
   * texture object stays the same, the uniforms never have to be patched, and
   * a list of thirty cases costs the handful somebody actually hovers.
   */
  const plates = useRef<(CasePlate | null)[]>(CASES.map(() => null));
  const requested = useRef<boolean[]>(CASES.map(() => false));

  const material = useMemo(() => {
    const first = createCasePlate(CASES[0], 0);
    plates.current[0] = first;

    /**
     * The material is constructed once and mutated directly every frame.
     * Passing `uniforms` as a JSX prop looks tidier but hands React a value it
     * is free to re-apply, and per-frame writes to it never reach the program.
     */
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      uniforms: {
        uTextureA: { value: first.texture },
        uTextureB: { value: first.texture },
        uProgress: { value: 1 },
        uTime: { value: 0 },
        uHover: { value: 0 },
        uVelocity: { value: new THREE.Vector2() },
      },
    });
  }, []);

  const plateFor = useCallback((index: number) => {
    let plate = plates.current[index];

    if (!plate) {
      plate = createCasePlate(CASES[index], index);
      plates.current[index] = plate;
    }

    const entry = CASES[index];
    if (entry.image && !requested.current[index]) {
      requested.current[index] = true;

      const image = new Image();
      image.decoding = "async";
      // A failed load simply leaves the branded placeholder in place.
      image.onload = () => plate?.paint(image);
      image.src = entry.image;
    }

    return plate.texture;
  }, []);

  useEffect(() => {
    const built = plates.current;
    return () => {
      material.dispose();
      built.forEach((plate) => plate?.texture.dispose());
    };
  }, [material]);

  const store = useRef({
    current: -1,
    position: new THREE.Vector2(),
    previous: new THREE.Vector2(),
    velocity: new THREE.Vector2(),
    target: new THREE.Vector2(),
    progress: 1,
  });

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const uniforms = material.uniforms;
    const self = store.current;
    const index = activeIndex.current ?? -1;
    const hovering = index >= 0;

    // Texture handoff: the new plate moves into slot B, progress wipes A out.
    if (hovering && index !== self.current) {
      uniforms.uTextureA.value = uniforms.uTextureB.value;
      uniforms.uTextureB.value = plateFor(index);
      self.progress = 0;
      self.current = index;
    }
    if (!hovering) self.current = -1;

    self.progress = THREE.MathUtils.lerp(
      self.progress,
      1,
      1 - Math.exp(-7 * delta),
    );
    uniforms.uProgress.value = self.progress;
    uniforms.uTime.value += delta;
    uniforms.uHover.value = THREE.MathUtils.lerp(
      uniforms.uHover.value,
      hovering ? 1 : 0,
      1 - Math.exp(-9 * delta),
    );

    // Screen pixels -> world units (the camera is set up 1:1 with the DOM).
    self.target.set(
      (pointer.current?.x ?? 0) - size.width / 2,
      -((pointer.current?.y ?? 0) - size.height / 2),
    );

    // Keep the whole plate inside the canvas, so it never gets clipped in
    // half at the first or last row.
    const marginX = (PLATE.width / 2) * 1.05;
    const marginY = (PLATE.height / 2) * 1.05;
    self.target.x = THREE.MathUtils.clamp(
      self.target.x,
      -size.width / 2 + marginX,
      size.width / 2 - marginX,
    );
    self.target.y = THREE.MathUtils.clamp(
      self.target.y,
      -size.height / 2 + marginY,
      size.height / 2 - marginY,
    );

    self.previous.copy(self.position);
    self.position.lerp(self.target, 1 - Math.exp(-8 * delta));
    self.velocity.subVectors(self.position, self.previous);
    uniforms.uVelocity.value.lerp(self.velocity, 0.25);

    if (mesh.current) {
      mesh.current.position.set(self.position.x, self.position.y, 0);
      mesh.current.scale.setScalar(0.86 + uniforms.uHover.value * 0.14);
      mesh.current.rotation.z = -uniforms.uVelocity.value.x * 0.0009;
    }
  });

  return (
    <mesh ref={mesh} material={material} frustumCulled={false}>
      <planeGeometry args={[PLATE.width, PLATE.height, 32, 24]} />
    </mesh>
  );
}

export function CaseCanvas({ activeIndex, pointer }: PlateProps) {
  return (
    <Canvas
      aria-hidden
      className="!absolute inset-0"
      // R3F sets pointer-events on its own canvas element; the plate must
      // never swallow a click meant for the link underneath it.
      style={{ pointerEvents: "none" }}
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      orthographic
      camera={{ position: [0, 0, 100], near: 0.1, far: 1000, zoom: 1 }}
    >
      <Plate activeIndex={activeIndex} pointer={pointer} />
    </Canvas>
  );
}

export default CaseCanvas;
