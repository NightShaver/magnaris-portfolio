"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import * as THREE from "three";

import { HeroScene } from "./HeroScene";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useLowPower } from "@/lib/useLowPower";

/**
 * Hero canvas shell.
 *
 * Owns everything that is *not* scene content: pointer normalisation, the
 * WebGL capability check, pausing the render loop while the hero is off
 * screen, and the fallback for machines that cannot render it.
 */
export function HeroCanvas() {
  const wrapper = useRef<HTMLDivElement>(null);
  const pointer = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const reducedMotion = usePrefersReducedMotion();
  const lowPower = useLowPower();

  const [supported, setSupported] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  // WebGL capability probe. Cheap, runs once, avoids a black box on old GPUs.
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const context =
        canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      setSupported(Boolean(context));
    } catch {
      setSupported(false);
    }
  }, []);

  // Stop rendering entirely once the hero has scrolled away — the GPU budget
  // belongs to whichever section the user is actually looking at.
  useEffect(() => {
    const node = wrapper.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointer.current.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
    );
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointer.current.set(0, 0);
  }, []);

  const glSettings = useMemo(
    () => ({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance" as const,
    }),
    [],
  );

  if (supported === false) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-line bg-ink-900">
        <div className="grid-lines absolute inset-0 opacity-30" aria-hidden />
        <p className="tag relative max-w-[22ch] text-center leading-relaxed">
          WebGL nicht verfügbar — Inhalte bleiben vollständig zugänglich.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={wrapper}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-line/80 bg-ink-900"
    >
      {/* Technical framing: corner ticks only — nothing competes with the mark. */}
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        <span className="absolute left-4 top-4 h-4 w-4 border-l border-t border-teal/70" />
        <span className="absolute right-4 top-4 h-4 w-4 border-r border-t border-teal/70" />
        <span className="absolute bottom-4 left-4 h-4 w-4 border-b border-l border-teal/70" />
        <span className="absolute bottom-4 right-4 h-4 w-4 border-b border-r border-teal/70" />
      </div>

      <span className="tag pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-[10px] text-steel/80">
        {reducedMotion ? "STATIC MODE" : "REALTIME · WEBGL"}
      </span>

      {supported && (
        <Canvas
          className="!absolute inset-0"
          // A phone's device pixel ratio is 3: rendering at 1.75 means
          // shading three times the fragments a desktop does, for a canvas
          // nobody inspects that closely.
          dpr={lowPower ? [1, 1.25] : [1, 1.75]}
          gl={glSettings}
          frameloop={visible && !reducedMotion ? "always" : "demand"}
          camera={{ position: [0, 0.1, 5.6], fov: 34, near: 0.1, far: 40 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            setReady(true);
          }}
        >
          <Suspense fallback={null}>
            <HeroScene
              pointer={pointer}
              reducedMotion={reducedMotion}
              lowPower={lowPower}
            />
            <Preload all />
          </Suspense>
        </Canvas>
      )}

      {/* Held until the first frame is on screen, then fades out. */}
      <div
        aria-hidden
        className={[
          "pointer-events-none absolute inset-0 z-20 bg-ink-900 transition-opacity duration-700",
          ready ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </div>
  );
}

export default HeroCanvas;
