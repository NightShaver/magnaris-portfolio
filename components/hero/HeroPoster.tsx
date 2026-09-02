"use client";

import { Logo } from "@/components/ui/Logo";

/**
 * The hero on a phone.
 *
 * The realtime mark costs about 840 kB of three.js and drei before a single
 * frame is drawn, then holds the GPU for as long as the hero is on screen —
 * on a device that cannot even use the parallax, because there is no cursor
 * to steer it with. So phones get the mark as vector art instead: the same
 * polygons the hero extrudes (lib/logo.ts), drawn once, sharp at any pixel
 * density, and a couple of hundred bytes of markup.
 *
 * Everything around it — the frame, the corner ticks, the brand glow — is
 * kept, so the composition of the section does not change between devices.
 * The glow is a pair of gradients rather than a blurred layer: same softness,
 * no offscreen buffer to rasterise.
 */
export function HeroPoster() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-line/80 bg-ink-900">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 58% at 32% 36%, rgba(15,142,145,0.38) 0%, transparent 68%), radial-gradient(54% 54% at 70% 64%, rgba(111,99,199,0.34) 0%, transparent 70%)",
        }}
      />
      <div aria-hidden className="grid-lines absolute inset-0 opacity-20" />

      <Logo
        title="Magnaris"
        className="absolute left-1/2 top-1/2 w-[56%] -translate-x-1/2 -translate-y-1/2 text-frost"
      />

      {/* Technical framing: corner ticks only — nothing competes with the mark. */}
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        <span className="absolute left-4 top-4 h-4 w-4 border-l border-t border-teal/70" />
        <span className="absolute right-4 top-4 h-4 w-4 border-r border-t border-teal/70" />
        <span className="absolute bottom-4 left-4 h-4 w-4 border-b border-l border-teal/70" />
        <span className="absolute bottom-4 right-4 h-4 w-4 border-b border-r border-teal/70" />
      </div>

      <span className="tag pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-[10px] text-steel/80">
        MAGNARIS / MARK
      </span>
    </div>
  );
}

export default HeroPoster;
