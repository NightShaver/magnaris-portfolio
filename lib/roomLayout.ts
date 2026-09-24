/* ==========================================================================
   GALLERY LAYOUT — the single source of the hall's geometry
   --------------------------------------------------------------------------
   Both renderers read these numbers:

     - the runtime room  (components/walkable/WalkableRoom.tsx)
     - the Blender build (blender/export_layout.mjs -> blender/room_layout.py)

   A measurement that exists twice drifts the first time somebody nudges one
   of them, and a baked lightmap that no longer matches the geometry it was
   baked for is worse than no lightmap at all. So it exists once, here.

   This module deliberately has no imports. That is what lets the export
   script read it with plain `node` — no bundler, no path aliases, no build
   step between the code and Blender.
   ========================================================================== */

/** Metres between two hanging bays. */
export const ROW_SPACING = 8.5;

/** Depth kept clear at both ends of the hall, for the two lobbies. */
export const LOBBY = 7.5;

/**
 * How many rows of cases the hall is built for — two hangings per row.
 *
 * This used to be `ceil(CASES.length / 2)`, so the hall grew whenever a
 * project was added. That was the right call while the room was generated at
 * runtime, and it is the wrong call now: a baked hall has a baked length, and
 * its lightmap is only valid for the walls it was baked against.
 *
 * Frozen at 3, the value it had with six published cases. That yields the
 * 40.5 m hall currently on screen, four bays, eight hanging slots. Six are
 * filled; the rest read as reserved hangings rather than as bare wall.
 *
 * Going past eight cases means raising this number and re-baking — a
 * deliberate act, not a side effect of editing a content file.
 */
export const ROW_COUNT = 3;

/* --------------------------------------------------------------------------
   SECTION — the hall is a basilica, not a box.
   --------------------------------------------------------------------------
   A single 26 m volume with a 6.4 m ceiling reads as a sports hall: four
   metres of width for every metre of height, and twenty metres of empty floor
   between two rows of pictures that have nothing to do with each other.

   So the width is divided the way exhibition halls have been divided for a
   very long time: low side aisles where the pictures hang and are viewed from
   close up, an arcade of piers, and a tall nave in the middle. The piers were
   already spaced to fall *between* the bays, so every picture ends up centred
   in its own arcade opening and stays visible from the nave.

   Clear dimensions that come out of this:
     aisle   5.0 wide x 4.4 high   -> 1.14 : 1, intimate
     nave   14.2 wide x 8.0 high   -> 1.78 : 1, a hall
   -------------------------------------------------------------------------- */
export const SECTION = {
  /** Clear width of a side aisle, outer wall face to pier face. */
  aisleWidth: 5.0,
  /** Pier thickness across the hall. */
  pierWidth: 0.9,
  /** Pier length along the hall. */
  pierDepth: 1.2,
  /** Ceiling height over the aisles, where the pictures are. */
  aisleHeight: 4.4,
  /** Ceiling height over the nave. */
  naveHeight: 8.0,
  /** Height of the hidden cove that washes the nave ceiling. */
  coveHeight: 0.35,
} as const;

export const ROOM = {
  width: 26,
  depth: ROW_COUNT * ROW_SPACING + 15,
  /** Overall clear height — the nave sets it. */
  height: SECTION.naveHeight,
  eyeHeight: 1.68,
  /** Radius the visitor is kept away from the central plinth. */
  plinthRadius: 1.6,
  /** How far the barrier keeps the visitor off the exhibition walls. */
  wallClearance: 2.1,
} as const;

/** Inner face of a pier, i.e. half the clear nave width. */
export const NAVE_HALF_WIDTH =
  ROOM.width / 2 - SECTION.aisleWidth - SECTION.pierWidth;

/** Outer face of a pier, i.e. where the aisle ends. */
export const PIER_OUTER_X = ROOM.width / 2 - SECTION.aisleWidth;

/**
 * The arcade's columns.
 *
 * Round, not square. A basilica arcade is a colonnade, the grazing uplights
 * wash a cylinder as one continuous gradient instead of four flat facets, and
 * a shaft has no vertical corner for a world-space texture projection to
 * mirror across — which was the most obviously computer-generated thing in the
 * room at close range.
 *
 * The radius is the flared foot, which is the widest point and therefore the
 * one the mover has to keep clear of.
 */
export const COLUMN_X = (NAVE_HALF_WIDTH + PIER_OUTER_X) / 2;
export const COLUMN_RADIUS = 0.43;

/**
 * Thickness of the perimeter walls.
 *
 * Lived in 01_shell.py alone until the frontend needed it too: the approach
 * tunnel has to begin where the wall ends, and it used to begin where the wall
 * starts. For the first half metre its side planes sat in exactly the same
 * plane as the portal reveal, which is a coplanar pair the depth buffer cannot
 * order — the whole left edge of the entrance flickered, and only that one,
 * because it is the only opening with a tunnel behind it.
 */
export const WALL_THICKNESS = 0.5;

/** The gate at the near end, and the approach the visitor flies in through. */
export const PORTAL = {
  width: 5.2,
  height: 3.8,
  tunnel: 9,
} as const;

/** Frame size in metres — everything else on the wall is laid out around it. */
export const FRAME = { width: 5.14, height: 3.34, centreY: 2.4 } as const;

/**
 * The picture lights.
 *
 * A gallery washes a large work with a linear source running parallel to the
 * wall. The first version used one 38-degree spot per picture, which at this
 * throw lights a pool about 1.8 m across on a 5.14 m painting: a bright ellipse
 * with dark corners, and the single clearest tell that a room was rendered
 * rather than built.
 *
 * Blender bakes the light from these numbers and the frontend puts the
 * housings at the same place. A fixture standing beside its own light instead
 * of inside it is what makes a room read as a set.
 */
export const WASH = {
  /** Distance from the wall face to the centre of the source. */
  setback: 1.25,
  /** How far the source hangs below the aisle ceiling. */
  drop: 0.16,
  /** Length of the source as a fraction of the frame width. */
  span: 0.92,
  /** The thin dimension, across the hall. */
  depth: 0.22,
} as const;

/** Height of the picture lights above the floor. */
export const WASH_HEIGHT = SECTION.aisleHeight - WASH.drop;

/** Length of one picture light in metres. */
export const WASH_LENGTH = FRAME.width * WASH.span;

/**
 * A bay every ROW_SPACING metres, from the entrance lobby back to the far one.
 * Derived from the built depth rather than counted out by hand: the hall is
 * hung to its own architecture.
 */
export const BAY_Z: number[] = (() => {
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
 * Pilasters sit in the gaps *between* the bays. Picking round numbers by hand
 * is how the first version ended up with a pier running straight across a
 * case — these are derived from the bay positions instead.
 */
export const PILASTER_Z: number[] = [
  ROOM.depth / 2 - 1.6,
  ...BAY_Z.slice(0, -1).map((z) => z - ROW_SPACING / 2),
  -ROOM.depth / 2 + 1.6,
];

/** A bench in every gap between two bays. */
export const BENCH_Z: number[] = BAY_Z.slice(0, -1).map(
  (z) => z - ROW_SPACING / 2,
);

/** Evenly spread positions along the hall, inset from both ends. */
export const spread = (count: number, inset: number): number[] =>
  Array.from({ length: count }, (_, index) =>
    count === 1
      ? 0
      : -ROOM.depth / 2 +
        inset +
        (index * (ROOM.depth - inset * 2)) / (count - 1),
  );

/** Hanging slots in the hall: two per bay, one on each side. Derived. */
export const SLOT_COUNT = BAY_Z.length * 2;

export const CEILING_LIGHT_Z = spread(Math.max(3, BAY_Z.length + 1), 4.5);
export const TRACK_ROD_Z = spread(Math.max(3, BAY_Z.length + 1), 3.5);

/**
 * Every hanging position in walking order: two per bay, alternating sides.
 * `side` is -1 for the left wall and +1 for the right one.
 *
 * Blender writes one empty per slot, named `slot.01` … `slot.08`, at exactly
 * these coordinates. The frontend looks those empties up in the imported glTF
 * and hangs the case plates on them, so adding or swapping a project never
 * requires opening Blender.
 */
export type Slot = {
  /** 1-based, zero-padded: "01" … "08". Matches the empty's name in Blender. */
  slot: string;
  index: number;
  side: -1 | 1;
  z: number;
  /** Centre of the frame in world space. */
  position: [number, number, number];
};

export const SLOTS: Slot[] = BAY_Z.flatMap((z, row) =>
  ([-1, 1] as const).map((side) => {
    const index = row * 2 + (side === -1 ? 0 : 1);
    return {
      slot: String(index + 1).padStart(2, "0"),
      index,
      side,
      z,
      position: [side * (ROOM.width / 2), FRAME.centreY, z] as [
        number,
        number,
        number,
      ],
    };
  }),
);

/* --------------------------------------------------------------------------
   FURNITURE — where the fittings stand.
   --------------------------------------------------------------------------
   These used to be literals scattered through WalkableRoom.tsx, which was fine
   while the fittings were built out of RoundedBoxes at runtime. They are
   modelled in Blender now and baked into the hall's lightmap, so the two sides
   have to agree on every coordinate or a bench ends up standing next to its
   own shadow.

   `rotationY` is in radians, and it is the angle the piece faces — a bench on
   the left of the nave is turned to look across it, same as one on the right.
   -------------------------------------------------------------------------- */

export type Placement = {
  name: string;
  /** World position of the piece's base, in frontend coordinates. */
  position: [number, number, number];
  rotationY: number;
};

/** Distance of a bench from the centre line. Clear of the plinth, clear of the walkway. */
export const BENCH_X = 3.4;

/** Bins and the smaller planters share a line further out than the benches. */
export const PROP_X = 4.5;

/** How far a corner planter sits in from the wall and from the end wall. */
export const PLANTER_CORNER_INSET = { x: 1.9, z: 2.7 } as const;

/** A barrier stands this far in front of the line the visitor is held at. */
export const BARRIER_OFFSET = 0.35;

/** Half the distance between the two posts of one barrier. */
export const BARRIER_HALF_SPAN = 1.75;

export const BENCHES: Placement[] = BENCH_Z.flatMap((z, row) =>
  ([-1, 1] as const).map((side) => ({
    name: `bench.${side < 0 ? "L" : "R"}${row + 1}`,
    position: [side * BENCH_X, 0, z] as [number, number, number],
    // Seats face the nave, so the pair reads as a bench and not as a divider.
    rotationY: side < 0 ? 0 : Math.PI,
  })),
);

/**
 * One bin per bench row, alternating sides so the hall does not read as a
 * mirrored diagram, and set behind the seat rather than in the walkway.
 */
export const BINS: Placement[] = BENCH_Z.map((z, row) => ({
  name: `bin.${row + 1}`,
  position: [(row % 2 === 0 ? -1 : 1) * PROP_X, 0, z - 1.5] as [
    number,
    number,
    number,
  ],
  rotationY: 0,
}));

export type PlanterPlacement = Placement & { variant: "corner" | "bench" };

export const PLANTERS: PlanterPlacement[] = [
  ...([-1, 1] as const).flatMap((x) =>
    ([-1, 1] as const).map((z) => ({
      name: `planter.corner.${x < 0 ? "L" : "R"}${z < 0 ? "B" : "F"}`,
      variant: "corner" as const,
      position: [
        x * (ROOM.width / 2 - PLANTER_CORNER_INSET.x),
        0,
        z * (ROOM.depth / 2 - PLANTER_CORNER_INSET.z),
      ] as [number, number, number],
      rotationY: x * 0.18,
    })),
  ),
  ...BENCH_Z.flatMap((z, row) =>
    ([-1, 1] as const).map((side) => ({
      name: `planter.bench.${side < 0 ? "L" : "R"}${row + 1}`,
      variant: "bench" as const,
      position: [side * PROP_X, 0, z + 1.35] as [number, number, number],
      rotationY: side * 0.12,
    })),
  ),
];

/**
 * One barrier per hanging slot, two posts each. The same line is what holds
 * the visitor back in the movement code, so nobody can walk into a picture.
 */
export const BARRIERS: Placement[] = SLOTS.map((slot) => ({
  name: `barrier.${slot.slot}`,
  position: [
    slot.side * (ROOM.width / 2 - ROOM.wallClearance + BARRIER_OFFSET),
    0,
    slot.z,
  ] as [number, number, number],
  rotationY: 0,
}));

/* --------------------------------------------------------------------------
   THE END WALL — the hidden wall and the two exhibits
   --------------------------------------------------------------------------
   The far end of the hall used to be a flat backdrop: a double door with a
   sign on it, and two printed panels beside it. All three read as posters,
   which is the one thing a room built out of real geometry should never do.

   What stands there now is a piece of architecture and two exhibits. The wall
   is a slab of concrete with nothing on it but four hairline joints; the
   founders are a podium each, with an object above it and a lit plate in
   front. Blender builds all of it and bakes what does not move.
   -------------------------------------------------------------------------- */

/**
 * The hidden wall.
 *
 * It is the way out of the hall and it is not visibly a door. Six blocks fill
 * the opening flush with the wall face, separated by joints thin enough to
 * read as cast lines rather than as a gap. Cyan light sits behind them, so the
 * joints are the only thing that gives the mechanism away.
 *
 * It opens in two moves. The whole slab pulls back into the reveal first,
 * which is what makes it read as heavy: a door swings, a metre of concrete has
 * to clear its own frame before it can go anywhere. Then the blocks part.
 */
export const HIDDEN_WALL = {
  /** The opening cut in the end wall. Portal-sized, so both ends match. */
  width: PORTAL.width,
  height: PORTAL.height,
  /** Thickness of a block. Deep enough to read as a wall, not as a panel. */
  blockDepth: 0.42,
  /** How far the slab pulls back before the blocks part. */
  retract: 0.48,
  /** The hairline. Six millimetres, which is a cast joint, not a door gap. */
  joint: 0.006,
  /** Depth of the alcove behind, from the wall face to its back plate. */
  niche: 1.35,
  /** How close the visitor has to get for it to open. */
  trigger: 7.5,
  /** Seconds for the full sequence. Blender keyframes to this. */
  duration: 3.4,
} as const;

/**
 * Where a podium stands, measured from the centre line.
 *
 * Bounded on both sides, so it is derived rather than picked. Inward it has to
 * stay clear of the hidden wall and of the walkway through it; outward the
 * clear nave ends at the arcade. Halfway between the two puts each podium in
 * the middle of the space it actually has.
 */
export const EXHIBIT_X = (HIDDEN_WALL.width / 2 + NAVE_HALF_WIDTH) / 2;

export const EXHIBIT = {
  /** End wall face to the centre of the podium. */
  standoff: 1.7,
  /** Footprint of the podium body at its base. */
  podiumWidth: 1.02,
  /** Top of the stone slab the sculpture hovers over. */
  podiumHeight: 1.08,
  /** Sculpture centre above that slab. */
  hoverHeight: 0.62,
  /** Podium centre to the lectern in front of it. */
  lecternOffset: 1.12,
  /** Height of the lectern at its high edge. */
  lecternHeight: 0.94,
  /** Tilt of the reading plate off horizontal. */
  lecternTilt: (32 * Math.PI) / 180,
  /** The lit plate itself, which the frontend draws the skills onto. */
  plateWidth: 0.72,
  plateHeight: 0.4,
} as const;
