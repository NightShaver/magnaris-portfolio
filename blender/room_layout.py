# =============================================================================
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

ROW_SPACING = 8.5
LOBBY = 7.5
ROW_COUNT = 3
BAY_COUNT = 4
SLOT_COUNT = 8

ROOM = {
    "width": 26.0,
    "depth": 40.5,
    "height": 8.0,
    "eyeHeight": 1.68,
    "plinthRadius": 1.6,
    "wallClearance": 2.1,
}

# Thickness of the perimeter walls.
WALL_THICKNESS = 0.5

PORTAL = {
    "width": 5.2,
    "height": 3.8,
    "tunnel": 9.0,
}

# Basilica section: low aisles, an arcade of piers, a tall nave.
SECTION = {
    "aisleWidth": 5.0,
    "pierWidth": 0.9,
    "pierDepth": 1.2,
    "aisleHeight": 4.4,
    "naveHeight": 8.0,
    "coveHeight": 0.35,
}

# Inner face of a pier = half the clear nave width.
NAVE_HALF_WIDTH = 7.1
# Outer face of a pier = where the aisle ends.
PIER_OUTER_X = 8.0

# The arcade columns: centre line and the radius of the flared foot.
COLUMN_X = 7.55
COLUMN_RADIUS = 0.43

FRAME = {
    "width": 5.14,
    "height": 3.34,
    "centreY": 2.4,
}

# Picture lights: a linear wall washer per hanging slot.
WASH = {
    "setback": 1.25,
    "drop": 0.16,
    "span": 0.92,
    "depth": 0.22,
}
WASH_HEIGHT = 4.24
WASH_LENGTH = 4.7288

# Hanging bays, front of the hall to the back.
BAY_Z = [12.75, 4.25, -4.25, -12.75]

# Piers, in the gaps between the bays plus one at each end wall.
PILASTER_Z = [18.65, 8.5, 0.0, -8.5, -18.65]

# One bench per gap between two bays.
BENCH_Z = [8.5, 0.0, -8.5]

# Ceiling sources and track drop rods, evenly spread along the hall.
CEILING_LIGHT_Z = [-15.75, -7.875, 0.0, 7.875, 15.75]
TRACK_ROD_Z = [-16.75, -8.375, 0.0, 8.375, 16.75]

# One empty per hanging position. The frontend looks these up by name in the
# exported glTF and hangs the case plates on them.
SLOTS = [
    {"name": "slot.01", "index": 0, "side": -1, "position": (-13.0, 2.4, 12.75)},
    {"name": "slot.02", "index": 1, "side": 1, "position": (13.0, 2.4, 12.75)},
    {"name": "slot.03", "index": 2, "side": -1, "position": (-13.0, 2.4, 4.25)},
    {"name": "slot.04", "index": 3, "side": 1, "position": (13.0, 2.4, 4.25)},
    {"name": "slot.05", "index": 4, "side": -1, "position": (-13.0, 2.4, -4.25)},
    {"name": "slot.06", "index": 5, "side": 1, "position": (13.0, 2.4, -4.25)},
    {"name": "slot.07", "index": 6, "side": -1, "position": (-13.0, 2.4, -12.75)},
    {"name": "slot.08", "index": 7, "side": 1, "position": (13.0, 2.4, -12.75)},
]

# --- Furniture ---------------------------------------------------------------
# Where the fittings stand. Modelled in 02_furniture.py, baked into the hall's
# lightmap, and therefore fixed: these coordinates and the frontend's have to
# agree or a bench ends up standing next to its own shadow.

BENCH_X = 3.4
PROP_X = 4.5
BARRIER_HALF_SPAN = 1.75

BENCHES = [
    {"name": "bench.L1", "position": (-3.4, 0.0, 8.5), "rotation": 0.0},
    {"name": "bench.R1", "position": (3.4, 0.0, 8.5), "rotation": 3.141593},
    {"name": "bench.L2", "position": (-3.4, 0.0, 0.0), "rotation": 0.0},
    {"name": "bench.R2", "position": (3.4, 0.0, 0.0), "rotation": 3.141593},
    {"name": "bench.L3", "position": (-3.4, 0.0, -8.5), "rotation": 0.0},
    {"name": "bench.R3", "position": (3.4, 0.0, -8.5), "rotation": 3.141593},
]

BINS = [
    {"name": "bin.1", "position": (-4.5, 0.0, 7.0), "rotation": 0.0},
    {"name": "bin.2", "position": (4.5, 0.0, -1.5), "rotation": 0.0},
    {"name": "bin.3", "position": (-4.5, 0.0, -10.0), "rotation": 0.0},
]

PLANTERS = [
    {"name": "planter.corner.LB", "position": (-11.1, 0.0, -17.55), "rotation": -0.18, "variant": "corner"},
    {"name": "planter.corner.LF", "position": (-11.1, 0.0, 17.55), "rotation": -0.18, "variant": "corner"},
    {"name": "planter.corner.RB", "position": (11.1, 0.0, -17.55), "rotation": 0.18, "variant": "corner"},
    {"name": "planter.corner.RF", "position": (11.1, 0.0, 17.55), "rotation": 0.18, "variant": "corner"},
    {"name": "planter.bench.L1", "position": (-4.5, 0.0, 9.85), "rotation": -0.12, "variant": "bench"},
    {"name": "planter.bench.R1", "position": (4.5, 0.0, 9.85), "rotation": 0.12, "variant": "bench"},
    {"name": "planter.bench.L2", "position": (-4.5, 0.0, 1.35), "rotation": -0.12, "variant": "bench"},
    {"name": "planter.bench.R2", "position": (4.5, 0.0, 1.35), "rotation": 0.12, "variant": "bench"},
    {"name": "planter.bench.L3", "position": (-4.5, 0.0, -7.15), "rotation": -0.12, "variant": "bench"},
    {"name": "planter.bench.R3", "position": (4.5, 0.0, -7.15), "rotation": 0.12, "variant": "bench"},
]

BARRIERS = [
    {"name": "barrier.01", "position": (-11.25, 0.0, 12.75), "rotation": 0.0},
    {"name": "barrier.02", "position": (11.25, 0.0, 12.75), "rotation": 0.0},
    {"name": "barrier.03", "position": (-11.25, 0.0, 4.25), "rotation": 0.0},
    {"name": "barrier.04", "position": (11.25, 0.0, 4.25), "rotation": 0.0},
    {"name": "barrier.05", "position": (-11.25, 0.0, -4.25), "rotation": 0.0},
    {"name": "barrier.06", "position": (11.25, 0.0, -4.25), "rotation": 0.0},
    {"name": "barrier.07", "position": (-11.25, 0.0, -12.75), "rotation": 0.0},
    {"name": "barrier.08", "position": (11.25, 0.0, -12.75), "rotation": 0.0},
]

# --- The end wall -------------------------------------------------------------
# The hidden wall and the two exhibit podiums that replaced the printed panels.

HIDDEN_WALL = {
    "width": 5.2,
    "height": 3.8,
    "blockDepth": 0.42,
    "retract": 0.48,
    "joint": 0.006,
    "niche": 1.35,
    "trigger": 7.5,
    "duration": 3.4,
}

EXHIBIT_X = 4.85

EXHIBIT = {
    "standoff": 1.7,
    "podiumWidth": 1.02,
    "podiumHeight": 1.08,
    "hoverHeight": 0.62,
    "lecternOffset": 1.12,
    "lecternHeight": 0.94,
    "lecternTilt": 0.558505,
    "plateWidth": 0.72,
    "plateHeight": 0.4,
}

# Convenience: half extents, used constantly when placing walls.
HALF_W = ROOM["width"] / 2.0
HALF_D = ROOM["depth"] / 2.0
