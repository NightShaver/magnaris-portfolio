"use client";

import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

/**
 * The hero's postprocessing pass, in its own module so that the
 * `postprocessing` library is a separate chunk.
 *
 * Phones never render this — a mipmap bloom is a chain of downsamples and
 * blurs over the full frame, every frame — and because the import lives here
 * rather than in the scene, they do not download or parse it either.
 *
 * Only the emissive shards clear the threshold, so the metal stays crisp
 * instead of turning into fog.
 */
export function HeroPost() {
  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom
        intensity={0.85}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.25}
        mipmapBlur
      />
      <Vignette offset={0.32} darkness={0.55} eskil={false} />
    </EffectComposer>
  );
}

export default HeroPost;
