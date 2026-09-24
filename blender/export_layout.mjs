/* ==========================================================================
   LAYOUT EXPORT — TypeScript measurements -> Blender Python
   --------------------------------------------------------------------------
   Reads lib/roomLayout.ts and writes blender/room_layout.py. Run it whenever
   a measurement changes; the Blender build scripts import the generated module
   and never carry a number of their own.

       node blender/export_layout.mjs

   Node 23+ strips the TypeScript types on the fly, so this needs no bundler
   and no build step. That only holds as long as roomLayout.ts stays free of
   imports and of non-erasable syntax (enums, namespaces, parameter
   properties) — which is why that file says so at the top.
   ========================================================================== */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as L from "../lib/roomLayout.ts";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "room_layout.py");

/** Python literal for a number, trimmed so 12.75 does not arrive as 12.750001. */
const num = (value) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
};

const list = (values) => `[${values.map(num).join(", ")}]`;

const dict = (source, indent = "    ") =>
  Object.entries(source)
    .map(([key, value]) => `${indent}"${key}": ${num(value)},`)
    .join("\n");

const slots = L.SLOTS.map(
  (s) =>
    `    {"name": "slot.${s.slot}", "index": ${s.index}, "side": ${s.side}, ` +
    `"position": (${s.position.map(num).join(", ")})},`,
).join("\n");

/**
 * One furniture placement per line. `extra` picks up whatever a list carries
 * beyond name/position/rotation — the planters' `variant`, for instance.
 */
const placements = (list, extra = []) =>
  list
    .map((p) => {
      const tail = extra
        .map((key) => `, "${key}": "${p[key]}"`)
        .join("");
      return (
        `    {"name": "${p.name}", ` +
        `"position": (${p.position.map(num).join(", ")}), ` +
        `"rotation": ${num(p.rotationY)}${tail}},`
      );
    })
    .join("\n");

const py = `# =============================================================================
# GENERATED FILE - DO NOT EDIT
#
# Written by blender/export_layout.mjs from lib/roomLayout.ts.
# Change a measurement there and run:
#
#     node blender/export_layout.mjs
#
# Every Blender build script imports this module, so the model, the runtime
# room and the baked lightmap all describe the same hall.
# =============================================================================

ROW_SPACING = ${num(L.ROW_SPACING)}
LOBBY = ${num(L.LOBBY)}
ROW_COUNT = ${L.ROW_COUNT}
BAY_COUNT = ${L.BAY_Z.length}
SLOT_COUNT = ${L.SLOT_COUNT}

ROOM = {
${dict(L.ROOM)}
}

# Thickness of the perimeter walls.
WALL_THICKNESS = ${num(L.WALL_THICKNESS)}

PORTAL = {
${dict(L.PORTAL)}
}

# Basilica section: low aisles, an arcade of piers, a tall nave.
SECTION = {
${dict(L.SECTION)}
}

# Inner face of a pier = half the clear nave width.
NAVE_HALF_WIDTH = ${num(L.NAVE_HALF_WIDTH)}
# Outer face of a pier = where the aisle ends.
PIER_OUTER_X = ${num(L.PIER_OUTER_X)}

# The arcade columns: centre line and the radius of the flared foot.
COLUMN_X = ${num(L.COLUMN_X)}
COLUMN_RADIUS = ${num(L.COLUMN_RADIUS)}

FRAME = {
${dict(L.FRAME)}
}

# Picture lights: a linear wall washer per hanging slot.
WASH = {
${dict(L.WASH)}
}
WASH_HEIGHT = ${num(L.WASH_HEIGHT)}
WASH_LENGTH = ${num(L.WASH_LENGTH)}

# Hanging bays, front of the hall to the back.
BAY_Z = ${list(L.BAY_Z)}

# Piers, in the gaps between the bays plus one at each end wall.
PILASTER_Z = ${list(L.PILASTER_Z)}

# One bench per gap between two bays.
BENCH_Z = ${list(L.BENCH_Z)}

# Ceiling sources and track drop rods, evenly spread along the hall.
CEILING_LIGHT_Z = ${list(L.CEILING_LIGHT_Z)}
TRACK_ROD_Z = ${list(L.TRACK_ROD_Z)}

# One empty per hanging position. The frontend looks these up by name in the
# exported glTF and hangs the case plates on them.
SLOTS = [
${slots}
]

# --- Furniture ---------------------------------------------------------------
# Where the fittings stand. Modelled in 02_furniture.py, baked into the hall's
# lightmap, and therefore fixed: these coordinates and the frontend's have to
# agree or a bench ends up standing next to its own shadow.

BENCH_X = ${num(L.BENCH_X)}
PROP_X = ${num(L.PROP_X)}
BARRIER_HALF_SPAN = ${num(L.BARRIER_HALF_SPAN)}

BENCHES = [
${placements(L.BENCHES)}
]

BINS = [
${placements(L.BINS)}
]

PLANTERS = [
${placements(L.PLANTERS, ["variant"])}
]

BARRIERS = [
${placements(L.BARRIERS)}
]

# --- The end wall -------------------------------------------------------------
# The hidden wall and the two exhibit podiums that replaced the printed panels.

HIDDEN_WALL = {
${dict(L.HIDDEN_WALL)}
}

EXHIBIT_X = ${num(L.EXHIBIT_X)}

EXHIBIT = {
${dict(L.EXHIBIT)}
}

# Convenience: half extents, used constantly when placing walls.
HALF_W = ROOM["width"] / 2.0
HALF_D = ROOM["depth"] / 2.0
`;

mkdirSync(here, { recursive: true });
writeFileSync(target, py, "utf8");

console.log(`geschrieben: ${target}`);
console.log(
  `  Halle ${L.ROOM.width} x ${L.ROOM.depth} x ${L.ROOM.height} m, ` +
    `${L.BAY_Z.length} Buchten, ${L.SLOT_COUNT} Hängeplätze`,
);
