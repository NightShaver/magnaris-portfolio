import * as THREE from "three";

const SIZE = 512;

export type BrushedMetalMaps = {
  /** Per-texel roughness: the hairline brushing that breaks a highlight up. */
  roughnessMap: THREE.CanvasTexture;
  /** The same field as a normal map, so the grain also catches grazing light. */
  normalMap: THREE.CanvasTexture;
};

/**
 * Brushed stainless steel, generated rather than downloaded.
 *
 * A door leaf reads as a box for one reason: a single roughness value gives a
 * single specular blob. Real lift doors are brushed, so the highlight is torn
 * into hundreds of vertical hairlines and smeared along the grain. That is the
 * whole illusion — the geometry matters far less than this map.
 *
 * The grain runs along V (vertically on an upright leaf) and tiles in U.
 *
 * The caller owns both textures and must dispose them, like every other
 * canvas texture in this project.
 */
export function createBrushedMetalMaps(): BrushedMetalMaps {
  const height = buildGrainField();

  return {
    roughnessMap: buildRoughnessMap(height),
    normalMap: buildNormalMap(height),
  };
}

/**
 * The shared height field. Three octaves of column noise give the hairlines,
 * a slow vertical modulation keeps the brushing from looking machine-perfect,
 * and a per-texel grain stops the columns from banding.
 */
function buildGrainField(): Float32Array {
  const fine = periodicColumns(1);
  const medium = periodicColumns(6);
  const broad = periodicColumns(24);

  const field = new Float32Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y += 1) {
    // Brushing fades in and out along the length of the stroke. Kept gentle:
    // any more and the modulation reads as a horizontal band, not as grain.
    const stroke = 0.5 + 0.5 * Math.sin((y / SIZE) * Math.PI * 6 + 1.3);

    for (let x = 0; x < SIZE; x += 1) {
      const value =
        0.62 * fine[x] * (0.82 + 0.18 * stroke) +
        0.26 * medium[x] +
        0.12 * broad[x] +
        0.04 * (Math.random() - 0.5);

      field[y * SIZE + x] = clamp01(value);
    }
  }

  return field;
}

/** Smooth noise over one row of columns, wrapping so the texture tiles in U. */
function periodicColumns(wavelength: number): Float32Array {
  const out = new Float32Array(SIZE);

  if (wavelength <= 1) {
    for (let x = 0; x < SIZE; x += 1) out[x] = Math.random();
    return out;
  }

  const stops = Math.max(2, Math.round(SIZE / wavelength));
  const anchors = new Float32Array(stops);
  for (let i = 0; i < stops; i += 1) anchors[i] = Math.random();

  for (let x = 0; x < SIZE; x += 1) {
    const position = (x / SIZE) * stops;
    const index = Math.floor(position);
    const t = position - index;
    const a = anchors[index % stops];
    const b = anchors[(index + 1) % stops];
    // Smoothstep between anchors — cheap, and continuous across the seam.
    out[x] = a + (b - a) * (t * t * (3 - 2 * t));
  }

  return out;
}

/**
 * Roughness sits in a narrow band around 0.3: below that the leaf turns into a
 * mirror, above it the metal goes to felt. The bottom of the leaf is left a
 * little rougher, where a real door collects shoe marks.
 */
function buildRoughnessMap(field: Float32Array): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas();
  const image = ctx.createImageData(SIZE, SIZE);

  for (let y = 0; y < SIZE; y += 1) {
    const wear = 0.06 * Math.pow(y / SIZE, 3);

    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;
      const roughness = clamp01(0.35 + 0.13 * field[index] + wear);
      const byte = Math.round(roughness * 255);

      const offset = index * 4;
      image.data[offset] = byte;
      image.data[offset + 1] = byte;
      image.data[offset + 2] = byte;
      image.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return finishTexture(canvas, THREE.NoColorSpace);
}

/** Sobel over the same field. The grain is almost entirely a U-derivative. */
function buildNormalMap(field: Float32Array): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas();
  const image = ctx.createImageData(SIZE, SIZE);
  const strength = 2.4;

  for (let y = 0; y < SIZE; y += 1) {
    const up = ((y - 1 + SIZE) % SIZE) * SIZE;
    const down = ((y + 1) % SIZE) * SIZE;
    const row = y * SIZE;

    for (let x = 0; x < SIZE; x += 1) {
      const left = (x - 1 + SIZE) % SIZE;
      const right = (x + 1) % SIZE;

      const dx = (field[row + right] - field[row + left]) * strength;
      const dy = (field[down + x] - field[up + x]) * strength;

      const length = Math.hypot(dx, dy, 1);
      const offset = (row + x) * 4;
      image.data[offset] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round((1 / length) * 0.5 * 255 + 127.5);
      image.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return finishTexture(canvas, THREE.NoColorSpace);
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  return { canvas, ctx: canvas.getContext("2d")! };
}

function finishTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
