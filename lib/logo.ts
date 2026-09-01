/**
 * The Magnaris mark, as raw geometry.
 *
 * Single source for both renderers: the DOM logo (components/ui/Logo.tsx)
 * draws these polygons as SVG, the hero scene extrudes the exact same point
 * lists into 3D. Change a coordinate here and both stay identical.
 *
 * Coordinates are the ones from the delivered SVG, i.e. inside the
 * `translate(56,150) scale(1.52)` group. Y grows downward (SVG convention);
 * the 3D side flips it once, centrally.
 */

export type LogoPart = {
  id: string;
  /** Closed polygon, [x, y] pairs in logo space. */
  points: [number, number][];
  /** Brand role, resolved to a HEX by each renderer. */
  role: "solid" | "violet" | "teal";
  /** Extrusion depth in logo units — the shards sit proud of the letters. */
  depth: number;
  /** Z offset in logo units, so the shards layer over the solid forms. */
  z: number;
};

export const LOGO_PARTS: LogoPart[] = [
  {
    id: "stem-left",
    points: [
      [75, 430],
      [75, 100],
      [165, 100],
      [260, 195],
      [205, 250],
      [165, 210],
      [165, 355],
    ],
    role: "solid",
    depth: 46,
    z: 0,
  },
  {
    id: "stem-right",
    points: [
      [435, 430],
      [435, 200],
      [525, 110],
      [525, 430],
    ],
    role: "solid",
    depth: 46,
    z: 0,
  },
  {
    id: "shard-violet",
    points: [
      [205, 390],
      [205, 282],
      [294, 202],
      [294, 314],
    ],
    role: "violet",
    depth: 28,
    z: 34,
  },
  {
    id: "shard-teal",
    points: [
      [230, 306],
      [465, 72],
      [300, 324],
      [205, 390],
    ],
    role: "teal",
    depth: 22,
    z: 58,
  },
];

/** Bounding box of the mark in logo space. */
export const LOGO_BOUNDS = {
  minX: 75,
  maxX: 525,
  minY: 72,
  maxY: 430,
} as const;

export const LOGO_CENTER = {
  x: (LOGO_BOUNDS.minX + LOGO_BOUNDS.maxX) / 2,
  y: (LOGO_BOUNDS.minY + LOGO_BOUNDS.maxY) / 2,
} as const;

/** Logo units per world unit — tuned so the mark reads at ~2 units wide. */
export const LOGO_SCALE = 1 / 230;

/** Tight viewBox for the DOM logo, in the original 1024 document space. */
export const LOGO_VIEWBOX = "160 250 704 564";

/** The `translate(56,150) scale(1.52)` group from the delivered file. */
export const LOGO_TRANSFORM = "translate(56,150) scale(1.52)";

export const toPolygonPoints = (points: [number, number][]) =>
  points.map(([x, y]) => `${x},${y}`).join(" ");
