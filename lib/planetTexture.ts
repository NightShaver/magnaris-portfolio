import * as THREE from "three";

/* ==========================================================================
   THE BODIES
   --------------------------------------------------------------------------
   Equirectangular maps for the world and the six planets orbiting it on the
   Technical Art podium.

   Drawn here rather than baked in Blender for the same reason the lectern
   plates are: seven different maps would be seven more images to ship and
   seven more things to re-export when a colour changes. Generated, they cost
   about a tenth of a second at load and nothing on the wire.

   NOISE ON A SPHERE, NOT ON A RECTANGLE

   Every feature is sampled in 3D, from the direction the pixel points in, not
   from its (u, v) position. That is the difference between continents and
   bunting: sampled in UV space, a landmass is stretched sideways near the
   poles and the left edge of the map does not meet the right. Sampled on the
   sphere, the map wraps because the sphere does, and the poles are a point
   rather than a smeared row.

   THE PALETTES

   Cold, and low in chroma. A bright toy solar system over a dark concrete
   podium in a basilica would read as a different project; these are graded
   into the hall's register with one cyan note each, which is the same accent
   the podium's light channel and the wall joints carry.
   ========================================================================== */

/** Deterministic hash on an integer lattice point. */
function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in three dimensions, trilinearly interpolated. */
function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) =>
    hash(xi + dx, yi + dy, zi + dz);

  const x00 = lerp(corner(0, 0, 0), corner(1, 0, 0), u);
  const x10 = lerp(corner(0, 1, 0), corner(1, 1, 0), u);
  const x01 = lerp(corner(0, 0, 1), corner(1, 0, 1), u);
  const x11 = lerp(corner(0, 1, 1), corner(1, 1, 1), u);

  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** Layered noise. Octaves are the difference between a blob and a coastline. */
function fbm(
  x: number,
  y: number,
  z: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += noise(x * frequency + seed, y * frequency - seed, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum / total;
}

type Rgb = [number, number, number];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

export type PlanetKind = "world" | "rock" | "gas" | "ice" | "lava" | "dust" | "moon";

type Look = {
  kind: PlanetKind;
  /** Two ends of the surface's own range, plus the accent it carries. */
  low: Rgb;
  high: Rgb;
  accent: Rgb;
  seed: number;
  scale: number;
};

/**
 * The six bodies, in the order of MEMBERS[1].skills.
 *
 * Order matters and is the contract: the planet the crosshair names is the
 * skill at the same index on the lectern plate beside it. Reordering the
 * skills in lib/site.ts reorders these with them, which is correct — what must
 * not happen is a seventh skill, because there are six planets. displayTexture
 * cuts the list at six for the same reason.
 */
const LOOKS: Look[] = [
  { kind: "rock", low: [38, 44, 52], high: [122, 132, 143], accent: [63, 227, 224], seed: 11, scale: 3.4 },
  { kind: "gas", low: [58, 52, 44], high: [166, 142, 110], accent: [210, 196, 168], seed: 23, scale: 2.1 },
  { kind: "ice", low: [96, 122, 140], high: [226, 240, 248], accent: [120, 200, 214], seed: 37, scale: 4.2 },
  { kind: "lava", low: [24, 20, 22], high: [86, 70, 66], accent: [255, 138, 62], seed: 53, scale: 3.8 },
  { kind: "dust", low: [72, 58, 44], high: [178, 148, 112], accent: [214, 186, 142], seed: 67, scale: 3.1 },
  { kind: "moon", low: [30, 34, 40], high: [116, 122, 132], accent: [88, 96, 108], seed: 83, scale: 5.0 },
];

/** How the world itself is graded. Ocean, land, ice, and lit coastlines. */
const WORLD = {
  deep: [8, 26, 42] as Rgb,
  shallow: [18, 62, 84] as Rgb,
  shore: [58, 92, 76] as Rgb,
  land: [44, 74, 58] as Rgb,
  highland: [96, 104, 88] as Rgb,
  ice: [222, 236, 244] as Rgb,
  city: [63, 227, 224] as Rgb,
};

function surface(look: Look, nx: number, ny: number, nz: number): Rgb {
  const s = look.scale;
  const n = fbm(nx * s, ny * s, nz * s, 3, look.seed);

  if (look.kind === "gas") {
    // Bands run with latitude and wobble along it, which is what makes them
    // read as weather rather than as stripes.
    const wobble = fbm(nx * 1.4, ny * 1.4, nz * 1.4, 2, look.seed) * 0.16;
    const band = Math.sin((nz + wobble) * 9.0) * 0.5 + 0.5;
    const body = mix(look.low, look.high, band * 0.8 + n * 0.2);
    return band > 0.86 ? mix(body, look.accent, 0.35) : body;
  }

  if (look.kind === "lava") {
    // Cracks are the thin band where the noise crosses its own mid point, so
    // they form a connected network instead of scattered dots.
    const crack = 1 - Math.min(1, Math.abs(n - 0.5) * 11);
    return mix(mix(look.low, look.high, n * 0.7), look.accent, crack * 0.85);
  }

  if (look.kind === "ice") {
    const fracture = 1 - Math.min(1, Math.abs(n - 0.46) * 14);
    return mix(mix(look.low, look.high, n), look.accent, fracture * 0.4);
  }

  if (look.kind === "moon" || look.kind === "rock") {
    // Craters: a second, coarser field punched into the first.
    const pits = fbm(nx * s * 0.42, ny * s * 0.42, nz * s * 0.42, 2, look.seed + 5);
    const crater = pits < 0.42 ? (0.42 - pits) * 2.2 : 0;
    const body = mix(look.low, look.high, n);
    return mix(body, look.low, Math.min(0.85, crater));
  }

  return mix(look.low, look.high, n);
}

function worldSurface(nx: number, ny: number, nz: number): Rgb {
  const height = fbm(nx * 2.3, ny * 2.3, nz * 2.3, 5, 7);
  const polar = Math.abs(nz);

  // Ice grows from the poles and is pushed back by a little noise, so the cap
  // has a ragged edge rather than a drawn circle.
  const iceEdge = 0.78 - fbm(nx * 6, ny * 6, nz * 6, 2, 19) * 0.16;
  if (polar > iceEdge) {
    return mix(WORLD.highland, WORLD.ice, Math.min(1, (polar - iceEdge) * 6));
  }

  if (height < 0.46) {
    return mix(WORLD.deep, WORLD.shallow, height / 0.46);
  }
  if (height < 0.49) {
    return mix(WORLD.shallow, WORLD.shore, (height - 0.46) / 0.03);
  }

  const land = mix(WORLD.land, WORLD.highland, (height - 0.49) / 0.51);
  // Settlements: sparse, only on low land, and the one warm-cold accent on
  // the body. They are what make it read as inhabited rather than as terrain.
  const lights = fbm(nx * 14, ny * 14, nz * 14, 2, 31);
  if (height < 0.58 && lights > 0.74) {
    return mix(land, WORLD.city, (lights - 0.74) * 2.6);
  }
  return land;
}

function paint(
  width: number,
  height: number,
  shade: (nx: number, ny: number, nz: number) => Rgb,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(width, height);
    const data = image.data;
    for (let y = 0; y < height; y += 1) {
      // The row's latitude, and with it the radius of its circle of longitude.
      const polar = ((y + 0.5) / height) * Math.PI;
      const nz = Math.cos(polar);
      const ring = Math.sin(polar);
      for (let x = 0; x < width; x += 1) {
        const azimuth = ((x + 0.5) / width) * Math.PI * 2;
        const [r, g, b] = shade(
          Math.cos(azimuth) * ring,
          Math.sin(azimuth) * ring,
          nz,
        );
        const i = (y * width + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** The world at the centre of the Technical Art podium. */
export function createWorldTexture(): THREE.CanvasTexture {
  return paint(640, 320, worldSurface);
}

/**
 * The six orbiting bodies, in skill order.
 *
 * Small on purpose. The largest is 85 mm across and is seen from at least a
 * metre and a half, so 256 by 128 is already more map than the silhouette can
 * show — and six of these are generated on the same frame as the world.
 */
export function createPlanetTextures(): THREE.CanvasTexture[] {
  return LOOKS.map((look) =>
    paint(256, 128, (nx, ny, nz) => surface(look, nx, ny, nz)),
  );
}
