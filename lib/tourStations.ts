import {
  BAY_Z,
  EXHIBIT,
  EXHIBIT_X,
  FRAME,
  HIDDEN_WALL,
  NAVE_HALF_WIDTH,
  ROOM,
  SECTION,
  SLOTS,
} from "@/lib/roomLayout";
import { CASES } from "@/lib/site";

/* ==========================================================================
   THE STATIONS
   --------------------------------------------------------------------------
   Where a visitor stands who is not walking.

   On a phone there is no pointer lock, so there is no mouse look, and an
   on-screen stick pushed down a forty metre hall is a minute of thumb work to
   reach the far wall. What a gallery visit actually consists of is standing in
   front of one thing at a time, so that is what the phone gets: thirteen
   places to stand, a tap to go to the next one, and a drag to look around once
   there.

   This is not a cut-down version of walking. It is the same room with the
   walking replaced by the thing the walking was for, and it is also why the
   phone version can be fast: parked at a station nothing moves, so nothing has
   to be drawn.

   HOW A STATION IS DEFINED

   Not as a camera position. A position is only correct for one field of view,
   and this room is looked at on a screen that is 390 points wide one moment
   and 844 the next. So a station says what is being looked at, how wide that
   thing is, and from which side — and the player works out how far back to
   stand from the live aspect ratio. A 5.14 m painting then fills the same
   fraction of the frame in portrait and in landscape.

   The order is the order of the hall. Bay by bay down the nave, the mark where
   it actually stands, then the two founder exhibits and the contact wall at the
   far end. A visitor tapping "weiter" thirteen times has walked the building.
   ========================================================================== */

export type StationKind = "vista" | "wall" | "mark" | "exhibit" | "contact";

export type Station = {
  /** Stable id, also what a floor marker carries in its userData. */
  id: string;
  /** What the HUD calls it. */
  label: string;
  kind: StationKind;
  /** The point the camera looks at. */
  target: [number, number, number];
  /**
   * How wide and how tall the thing at the target is, in metres, including the
   * margin it wants around it. The standing distance is derived from both.
   *
   * Both, because which one binds depends on how the phone is being held. A
   * 5.14 by 3.34 metre painting seen through a 55 degree lens needs 2.9 m of
   * room to fit across a landscape screen and 4.0 m to fit down it — so a
   * distance worked out from the width alone put the visitor close enough to
   * frame the picture perfectly and cut the top and bottom off it.
   */
  framing: number;
  framingHeight: number;
  /**
   * Unit direction on the floor from the target towards the visitor. The
   * standing point is the target plus this times the derived distance.
   */
  approach: [number, number];
  /** How far back the visitor may be pushed, in metres from the target. */
  range: [number, number];
  /** Eye height, where it is not the standard one. */
  eye?: number;
  /** The case this station is about, for the HUD's caption. */
  caseIndex?: number;
};

/** Standing eye height. The same as the walking one, so the room reads alike. */
const EYE = ROOM.eyeHeight;

/**
 * The picture stations.
 *
 * The near limit is the barrier the walking visitor is held at; the far limit
 * reaches just past the pier line into the arcade opening, which is exactly
 * how far back a picture in this hall stays unobstructed — the bays were
 * spaced to fall between the piers so that each work is centred in its own
 * opening. Any further and a column stands in front of it.
 */
const WALL_RANGE: [number, number] = [ROOM.wallClearance + 0.3, 6.2];

/** A picture wants about a quarter of its own size as air around it. */
const WALL_FRAMING = FRAME.width * 1.26;
const WALL_FRAMING_HEIGHT = FRAME.height * 1.26;

/**
 * The eight picture stations, in hanging order.
 *
 * The coordinates here are a placeholder and are overwritten at runtime, which
 * is deliberate rather than lazy. `SLOTS` says slot 01 is on the left wall;
 * slot.01 arrives in the loaded scene on the right one, because 08_export.py
 * negates depth and BakedHall turns the room back by a half turn, and a half
 * turn about Y mirrors x as well as z. The building is symmetric so nothing
 * looks wrong — but which wall a given project hangs on is not symmetric, and a
 * station built from the layout stands in front of the neighbouring case.
 *
 * So the order is authored here and the positions come from the anchors the
 * glTF actually carries, the same ones the frames are hung on. Station i and
 * frame i are then the same slot by construction, whatever any transform in
 * between does to the room.
 */
const wallStations: Station[] = SLOTS.map(({ index, side, z, slot }) => {
  const entry = CASES[index] ?? null;
  return {
    id: `slot-${slot}`,
    label: entry ? entry.client : `Freie Wand ${slot}`,
    kind: "wall" as const,
    target: [side * (ROOM.width / 2), FRAME.centreY, z] as [
      number,
      number,
      number,
    ],
    framing: WALL_FRAMING,
    framingHeight: WALL_FRAMING_HEIGHT,
    // Straight out from the wall it hangs on, into the aisle.
    approach: [-side, 0] as [number, number],
    range: WALL_RANGE,
    caseIndex: entry ? index : undefined,
  };
});

/** The two founder exhibits, looked at across their lecterns. */
const EXHIBIT_Z = -ROOM.depth / 2 + EXHIBIT.standoff;
const SCULPT_Y = EXHIBIT.podiumHeight + EXHIBIT.hoverHeight;

const exhibitStations: Station[] = (
  [
    [-1, "exhibit-art", "Technical Art"],
    [1, "exhibit-dev", "Anwendungsentwicklung"],
  ] as const
).map(([side, id, label]) => ({
  id,
  label,
  kind: "exhibit" as const,
  target: [side * EXHIBIT_X, SCULPT_Y, EXHIBIT_Z] as [number, number, number],
  // The sculpture is about 1.3 m across and the podium under it is another
  // metre tall, so what has to fit is the whole exhibit and not just the
  // moving part.
  framing: 3.2,
  framingHeight: 2.9,
  // Out along the hall, not across it: the lectern stands in front of the
  // podium and the plate on it is half of what there is to read.
  approach: [0, 1] as [number, number],
  // Never closer than the lectern, which reaches 1.12 m out and has a 0.95 m
  // collision radius on top of that.
  range: [2.6, 4.8],
}));

export const STATIONS: Station[] = [
  {
    id: "vista",
    label: "Mittelschiff",
    kind: "vista",
    // The middle of the hall, seen from the entrance lobby. Aimed at the
    // plinth rather than at the far wall, and the difference matters: the
    // standing distance is measured from the target, so a target forty metres
    // away put the visitor nine metres from the mark with it filling half the
    // screen. This is the one station whose subject is the length of the
    // building, and it has to stand far enough back to have any.
    target: [0, 2.6, 0],
    framing: NAVE_HALF_WIDTH * 2,
    // The nave is eight metres to the ceiling, and at this distance that is
    // never the binding measure — but it is what the station is of, so it is
    // what it says.
    framingHeight: SECTION.naveHeight,
    approach: [0, 1],
    range: [14, 18],
    eye: EYE,
  },
  // Bay by bay down the hall, with the mark where it stands.
  ...BAY_Z.flatMap((z, row) => {
    const pair = wallStations.filter((station) => station.target[2] === z);
    // The plinth sits at the origin, which falls between the second and third
    // bay of four. Inserted rather than appended, so the tour passes it where a
    // walking visitor would.
    const mark: Station[] =
      row === Math.floor(BAY_Z.length / 2)
        ? [
            {
              id: "mark",
              label: "Das Zeichen",
              kind: "mark",
              target: [0, 2.3, 0],
              framing: 3.0,
              framingHeight: 2.6,
              approach: [0, 1],
              range: [ROOM.plinthRadius + 0.6, 4.4],
            },
          ]
        : [];
    return [...pair, ...mark];
  }),
  ...exhibitStations,
  {
    id: "contact",
    label: "Kontakt",
    kind: "contact",
    target: [0, HIDDEN_WALL.height / 2, -ROOM.depth / 2],
    framing: HIDDEN_WALL.width * 1.3,
    framingHeight: HIDDEN_WALL.height * 1.3,
    approach: [0, 1],
    // Inside the wall's own trigger distance at the near end, so standing here
    // is what opens it — the mechanism is driven by proximity and the phone
    // must not need a separate rule for that.
    range: [3.2, HIDDEN_WALL.trigger - 1.0],
  },
];

export const STATION_COUNT = STATIONS.length;

/** Look a station up by id. Returns null rather than throwing on a stale id. */
export function stationById(id: string): Station | null {
  return STATIONS.find((station) => station.id === id) ?? null;
}

/**
 * How far back to stand, given what the camera can actually see.
 *
 * The horizontal field of view is the vertical one widened by the aspect
 * ratio, which is why this cannot be a constant: the same station is 2.9 m
 * back on a phone held sideways and pinned to its far limit held upright.
 *
 * Clamped to the station's own range, because the room is in the way. Where
 * the clamp bites — a wide picture in portrait — the visitor sees less of the
 * work and gets a hint to turn the phone, which is the honest outcome: a
 * 5.14 m painting does not fit across a 390 point screen from inside a 5 m
 * aisle, and no amount of arithmetic makes it.
 */
function needed(station: Station, fovDegrees: number, aspect: number): number {
  const halfVertical = (fovDegrees * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  // Whichever of the two runs out of room first. Held sideways that is almost
  // always the height, held upright almost always the width.
  return Math.max(
    station.framing / 2 / Math.tan(halfHorizontal),
    station.framingHeight / 2 / Math.tan(halfVertical),
  );
}

export function standingDistance(
  station: Station,
  fovDegrees: number,
  aspect: number,
): number {
  const want = needed(station, fovDegrees, aspect);
  return Math.min(Math.max(want, station.range[0]), station.range[1]);
}

/** Whether this station shows the visitor less than it wants to at this aspect. */
export function isCramped(
  station: Station,
  fovDegrees: number,
  aspect: number,
): boolean {
  return needed(station, fovDegrees, aspect) > station.range[1] + 0.05;
}
