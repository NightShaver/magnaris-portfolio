import * as THREE from "three";

export type PlantOptions = {
  /** Number of blades in the rosette. */
  blades: number;
  /** Height of the tallest blade, in metres. */
  height: number;
  /** Width of a blade at its base. */
  width: number;
  /** How far the outer blades lean away from vertical, in radians. */
  spread: number;
  /** Any integer — the same seed always builds the same plant. */
  seed: number;
};

/** Deep green at the base, a little lighter towards the tip. */
const BASE_COLOR = new THREE.Color("#132019");
const TIP_COLOR = new THREE.Color("#2a4c40");

const SEGMENTS = 7;

/**
 * A snake-plant rosette as a single geometry.
 *
 * Every blade is written into one buffer rather than mounted as its own mesh:
 * a planter is then four draw calls instead of a dozen, which matters because
 * the hall carries several of them. Blades are tapered, cupped along their
 * centre line and leaned outwards, so they catch the ceiling wash on one edge
 * and fall away on the other — the thing that keeps them from reading as
 * cardboard cutouts in a dark room.
 *
 * The caller owns the geometry and disposes it.
 */
export function createPlantGeometry(options: PlantOptions): THREE.BufferGeometry {
  const random = mulberry32(options.seed);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let blade = 0; blade < options.blades; blade += 1) {
    // Even spacing with a little jitter, so the rosette is not a fan.
    const angle =
      (blade / options.blades) * Math.PI * 2 + (random() - 0.5) * 0.5;
    const lean = options.spread * (0.3 + 0.7 * random());
    const height = options.height * (0.58 + 0.52 * random());
    const width = options.width * (0.8 + 0.4 * random());
    // Blades curve away from the pot, the taller ones a touch more.
    const bend = 0.18 + 0.22 * random();

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cosLean = Math.cos(lean);
    const sinLean = Math.sin(lean);

    const first = positions.length / 3;

    for (let step = 0; step <= SEGMENTS; step += 1) {
      const t = step / SEGMENTS;
      const halfWidth = (width / 2) * bladeProfile(t);
      // Cup flattens out towards the tip, the way a real blade does.
      const cup = halfWidth * 0.42 * (1 - t * 0.7);

      const along = height * t;
      const out = bend * height * t * t;

      const shade = BASE_COLOR.clone().lerp(TIP_COLOR, Math.pow(t, 0.8));

      for (const column of [-1, 0, 1] as const) {
        // Blade space: grows up +Y, curves towards +X, cupped towards +Z.
        const localX = out + column * halfWidth;
        const localY = along;
        const localZ = column === 0 ? cup : 0;

        // Lean away from the pot, then swing the whole blade into place.
        const leanedX = localX * cosLean - localY * sinLean;
        const leanedY = localX * sinLean + localY * cosLean;

        positions.push(
          leanedX * cos - localZ * sin,
          leanedY,
          leanedX * sin + localZ * cos,
        );

        // The centre line reads a shade brighter, which is where the light
        // actually catches on a cupped leaf.
        const lift = column === 0 ? 1.12 : 0.86;
        colors.push(shade.r * lift, shade.g * lift, shade.b * lift);
      }
    }

    for (let step = 0; step < SEGMENTS; step += 1) {
      const row = first + step * 3;
      const next = row + 3;

      for (const side of [0, 1]) {
        const a = row + side;
        const b = row + side + 1;
        const c = next + side;
        const d = next + side + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return geometry;
}

/** Widest just above the soil, drawn to a point at the tip. */
function bladeProfile(t: number) {
  return (1 - t * t) * (0.62 + 0.38 * Math.sin(Math.PI * t));
}

/** Small deterministic PRNG — the plants must not reshuffle on every mount. */
function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
