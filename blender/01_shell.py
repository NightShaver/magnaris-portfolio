# =============================================================================
# 01 — SHELL
#
# Builds the hall as a basilica: low side aisles where the pictures hang, an
# arcade of piers, a tall nave down the middle, and a hidden cove above the
# arcade that washes the nave ceiling.
#
# Run from Blender:
#     exec(open(r"<repo>/blender/01_shell.py").read())
#
# Idempotent. It wipes the collections it owns before rebuilding, so it can be
# re-run after any change to lib/roomLayout.ts without leaving orphans behind.
#
# AXES. The layout module speaks the frontend's language (Three.js): x = width,
# y = height, z = depth. Blender is Z-up: x = width, y = depth, z = height. The
# conversion happens exactly once, in `to_blender()`, and nowhere else. The
# glTF exporter converts back to Y-up on the way out.
#
# SECTION, looking down the hall:
#
#     |<-5.0->|<0.9>|<------- 14.2 nave -------->|<0.9>|<-5.0->|
#     |       |#####|                            |#####|       |   8.0
#     |       |#####|  <- spandrel + cove        |#####|       |
#     |=======|=====|============================|=====|=======|   4.4
#     | aisle | pier|            nave            |pier | aisle |
#     |  pic  |     |                            |     |  pic  |
#     +-------+-----+----------------------------+-----+-------+   0.0
#   x=-13   -8.0  -7.1                          7.1   8.0     13
# =============================================================================

import bpy
import bmesh
import sys
import math
import pathlib
import importlib
from math import cos, sin, pi, radians

ROOT = pathlib.Path(r"C:\Users\Felix\Desktop\DemoWebseiten\Portfolio")
if str(ROOT / "blender") not in sys.path:
    sys.path.insert(0, str(ROOT / "blender"))

import room_layout  # noqa: E402

importlib.reload(room_layout)
L = room_layout
S = L.SECTION

HALF_W = L.ROOM["width"] / 2.0
HALF_D = L.ROOM["depth"] / 2.0

AISLE_H = S["aisleHeight"]
NAVE_H = S["naveHeight"]
PIER_OUT = L.PIER_OUTER_X       # 8.0  — aisle ends here
PIER_IN = L.NAVE_HALF_WIDTH     # 7.1  — nave starts here
PIER_D = S["pierDepth"]         # along the hall

SLAB = 0.45           # ceiling slabs
WALL = L.WALL_THICKNESS  # perimeter walls; the frontend needs it too
REVEAL_DEPTH = 0.055  # how far a shadow gap sits back from the face
REVEAL_HEIGHT = 0.14  # gap at the wall base
CORNICE_HEIGHT = 0.12  # gap where wall meets the aisle ceiling
COVE_H = S["coveHeight"]
COVE_SETBACK = 0.55   # how deep the cove is cut into the spandrel
# Deep enough to stand the fixture back from the band it washes. At 0.28
# the lamp sat 20 cm from the clerestory, which by inverse square meant
# the band blew out to pure white and the ceiling 3.2 m above it got
# nothing at all. A cove that does not reach the ceiling is a strip light
# in a slot.

# --- Column ------------------------------------------------------------------
# The arcade is carried on round columns, not square piers.
#
# A basilica arcade is a colonnade. The rectangular pier is the medieval answer
# and the round shaft the classical one, and for a Kunsthalle the shaft wins for
# a second reason: the grazing uplights wash a cylinder as one continuous
# gradient and a box as four flat facets, and the gradient is what reads as
# stone rather than as a painted panel.
#
# It also removes a problem instead of moving it. A box textured from world
# space shows the projection flipping axis at every vertical corner, and the
# stone mirrors across the edge — the single most obviously computer-generated
# thing in the room at close range. A column has no edge to mirror across.
#
# The swell is entasis: a little over a third of the way up, the shaft is
# fractionally wider than at its foot. Three millimetres over four metres. It
# is invisible as a measurement and unmistakable as a silhouette, because a
# shaft that tapers straight from bottom to top looks pinched.
COLUMN = {
    "foot_r": 0.430,        # flare where the shaft meets the floor
    "shaft_bottom_r": 0.375,
    "shaft_swell_r": 0.378,
    "shaft_top_r": 0.334,
    "neck_r": 0.430,        # flare back out under the abacus
    "abacus": 0.90,         # square, as wide as the spandrel it carries
    "abacus_h": 0.14,
    "segments": 36,
}

# Chamfer on the built edges. The fittings got theirs in 02_furniture and gained
# enormously for it; a perfect 90-degree corner has no highlight and disappears
# into whatever is behind it, while two and a half millimetres of chamfer catch
# the cove light and draw the edge.
CHAMFER = 0.0025

# The arcade is its own collection because it is baked on its own: it is
# what a visitor stands closest to, and its marble is procedural and has to
# be baked to an image to reach the browser at all. See 06_unwrap.
COLLECTIONS = ("00_Shell", "10_Structure", "12_Arcade", "20_Fixtures",
               "90_Anchors")


# ----------------------------------------------------------------- utilities
def to_blender(x, y_height, z_depth):
    """Frontend coordinates -> Blender coordinates. The only place this flips."""
    return (x, z_depth, y_height)


def get_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def clear_collection(name):
    """Remove the objects this script owns, so a re-run replaces rather than piles up."""
    coll = bpy.data.collections.get(name)
    if coll is None:
        return
    for obj in list(coll.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)


def box(name, collection, centre, size):
    """
    An axis-aligned box built from vertex data rather than through bpy.ops.

    Operators depend on the active collection and the current mode, which makes
    them unreliable when the script is driven from outside the UI. from_pydata
    does not care where the mouse is.

    `centre` and `size` are already in Blender axes.
    """
    sx, sy, sz = (s / 2.0 for s in size)
    cx, cy, cz = centre

    verts = [
        (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
    ]
    # Winding matters. from_pydata takes the face normal from the vertex order,
    # and a renderer will happily shade a back-facing wall as if it faced you,
    # so an inverted box looks perfectly correct in the viewport. A bake does
    # not: with no viewing ray to flip against, the geometric normal is what
    # decides which hemisphere gets sampled, and a floor whose normal points
    # down into its own slab bakes to black.
    #
    # Each quad below is wound counter-clockwise seen from outside the solid.
    faces = [
        (3, 2, 1, 0), (5, 6, 7, 4),   # bottom (-Z), top (+Z)
        (1, 5, 4, 0), (2, 6, 5, 1),   # -Y, +X
        (3, 7, 6, 2), (0, 4, 7, 3),   # +Y, -X
    ]

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def bevel(obj, width=CHAMFER, segments=1, angle=radians(25)):
    """
    Chamfer every hard edge.

    bmesh rather than a modifier, because applying a modifier needs an active
    object and this script has no reliable context.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    edges = [e for e in bm.edges
             if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > angle]
    if edges:
        try:
            bmesh.ops.bevel(
                bm, geom=edges, offset=width, segments=segments,
                profile=0.5, affect="EDGES", clamp_overlap=True,
            )
        except TypeError:
            # The signature moves between releases. A missing chamfer is a
            # duller edge, not a broken build.
            pass
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def revolve(name, collection, centre, profile, segments=COLUMN["segments"]):
    """
    A surface of revolution around the vertical axis through `centre`.

    `profile` is a list of (radius, height) pairs from bottom to top, in metres
    and relative to `centre`. Both ends are capped, because a column stands on
    a floor and carries a slab and neither end is ever seen.

    Winding is counter-clockwise seen from outside, same rule as box(): the
    ring runs anticlockwise from above, so tangent x up points outwards.
    """
    cx, cy, cz = centre
    verts = []
    for radius, height in profile:
        for i in range(segments):
            a = 2.0 * pi * i / segments
            verts.append((cx + radius * cos(a), cy + radius * sin(a), cz + height))

    faces = []
    for ring in range(len(profile) - 1):
        base = ring * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((base + i, base + j, base + segments + j, base + segments + i))
    faces.append(tuple(range(segments - 1, -1, -1)))
    top = (len(profile) - 1) * segments
    faces.append(tuple(range(top, top + segments)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    # Smooth on the wall, flat on the two caps, so the shaft reads as turned
    # stone and the abacus joint stays a crisp line.
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def column(name, collection, centre_x, z_depth, height):
    """One shaft with its flared foot and its square abacus."""
    c = COLUMN
    shaft = height - c["abacus_h"]
    profile = [
        (c["foot_r"], 0.000),
        (c["foot_r"], 0.045),
        (c["shaft_bottom_r"], 0.115),
        (c["shaft_swell_r"], shaft * 0.36),
        (c["shaft_top_r"], shaft * 0.93),
        (c["shaft_top_r"], shaft - 0.075),
        (c["neck_r"], shaft - 0.010),
        (c["neck_r"], shaft),
    ]
    shaft_obj = revolve(f"Column_{name}", collection,
                        centre=(centre_x, z_depth, 0.0), profile=profile)

    abacus = box(f"Abacus_{name}", collection,
                 centre=(centre_x, z_depth, height - c["abacus_h"] / 2.0),
                 size=(c["abacus"], c["abacus"], c["abacus_h"]))
    bevel(abacus)
    return shaft_obj, abacus


def empty(name, collection, location, rotation_z=0.0):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.6
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, rotation_z)
    collection.objects.link(obj)
    return obj


def sided(prefix, index=None):
    """Names objects L/R consistently so the outliner stays readable."""
    return lambda side: (
        f"{prefix}_{'L' if side < 0 else 'R'}"
        + (f"_{index:02d}" if index is not None else "")
    )


# --------------------------------------------------------------------- build
def build():
    for name in COLLECTIONS:
        get_collection(name)
        clear_collection(name)

    shell = bpy.data.collections["00_Shell"]
    structure = bpy.data.collections["10_Structure"]
    arcade = bpy.data.collections["12_Arcade"]
    fixtures = bpy.data.collections["20_Fixtures"]
    anchors = bpy.data.collections["90_Anchors"]
    depth = L.ROOM["depth"]

    # ---- Floor. One slab under the whole footprint, top face at z = 0.
    box("Floor", shell,
        centre=(0.0, 0.0, -SLAB / 2.0),
        size=(L.ROOM["width"], depth, SLAB))

    # ---- Outer walls. Inner face at +/- HALF_W: the plane pictures hang on.
    #      They only rise to the aisle roof; the nave is carried by the arcade.
    for side in (-1, 1):
        box(sided("Wall")(side), shell,
            centre=(side * (HALF_W + WALL / 2.0), 0.0, (AISLE_H + SLAB) / 2.0),
            size=(WALL, depth, AISLE_H + SLAB))

    # ---- Aisle ceilings. From the pier line out to the wall.
    aisle_span = HALF_W - PIER_OUT
    for side in (-1, 1):
        box(sided("Ceiling_Aisle")(side), shell,
            centre=(side * (PIER_OUT + aisle_span / 2.0), 0.0, AISLE_H + SLAB / 2.0),
            size=(aisle_span, depth, SLAB))

    # ---- Arcade. Columns stand in the gaps between the bays, so each picture
    #      ends up centred in an opening and stays visible from the nave.
    column_x = (PIER_IN + PIER_OUT) / 2.0
    for i, z in enumerate(L.PILASTER_Z, start=1):
        for side in (-1, 1):
            column(f"{'L' if side < 0 else 'R'}_{i:02d}", arcade,
                   centre_x=side * column_x, z_depth=z, height=AISLE_H)

    # ---- Spandrel: the wall the arcade carries, from the aisle roof up to the
    #      nave ceiling. This is what makes the nave read as a separate volume.
    spandrel_h = NAVE_H - AISLE_H
    arcade_span = PIER_OUT - PIER_IN
    for side in (-1, 1):
        box(sided("Spandrel")(side), shell,
            centre=(side * (PIER_IN + arcade_span / 2.0), 0.0, AISLE_H + spandrel_h / 2.0),
            size=(arcade_span, depth, spandrel_h))

    # ---- Cove ledge. A shelf cantilevering out of the clerestory foot into
    #      the nave. The fixture sits on top of it, hidden from anyone below,
    #      and grazes the band above. Built pointing the other way at first,
    #      which put the light inside the wall it was meant to wash.
    for side in (-1, 1):
        box(sided("Cove")(side), structure,
            centre=(side * (PIER_IN - COVE_SETBACK / 2.0), 0.0, AISLE_H + COVE_H / 2.0),
            size=(COVE_SETBACK, depth, COVE_H))

    # ---- Nave ceiling, carried on the two spandrels.
    box("Ceiling_Nave", shell,
        centre=(0.0, 0.0, NAVE_H + SLAB / 2.0),
        size=(PIER_OUT * 2, depth, SLAB))

    # ---- Back wall, built around the hidden wall's opening.
    #
    #      Solid until now, with a frontend door drawn flat against it. That
    #      was the giveaway at the end of every walk: a door with no reveal,
    #      no depth and no thickness, on a wall a metre thick everywhere else.
    #      So the opening is cut for real, exactly as the portal is at the
    #      other end, and 05_exhibits fills it with the blocks that slide.
    outer_w = L.ROOM["width"] + WALL * 2
    hidden_w = L.HIDDEN_WALL["width"]
    hidden_h = L.HIDDEN_WALL["height"]
    back_jamb = (outer_w - hidden_w) / 2.0
    for side in (-1, 1):
        box(sided("Wall_Back")(side), shell,
            centre=(side * (hidden_w / 2.0 + back_jamb / 2.0),
                    -(HALF_D + WALL / 2.0), NAVE_H / 2.0),
            size=(back_jamb, WALL, NAVE_H))
    box("Wall_Back_Lintel", shell,
        centre=(0.0, -(HALF_D + WALL / 2.0),
                hidden_h + (NAVE_H - hidden_h) / 2.0),
        size=(hidden_w, WALL, NAVE_H - hidden_h))

    # ---- Front wall, built around the portal the visitor arrives through.
    #      Solid here would be geometry the intro flight passes straight
    #      through, and a lightmap with no spill from the opening: the one
    #      place in the hall where daylight logic says there must be some.
    #      Two jambs and a lintel, to the same opening the frontend's gate is
    #      built to, because both read PORTAL from the same layout module.
    portal_w = L.PORTAL["width"]
    portal_h = L.PORTAL["height"]
    jamb_w = (outer_w - portal_w) / 2.0
    for side in (-1, 1):
        box(sided("Wall_Front")(side), shell,
            centre=(side * (portal_w / 2.0 + jamb_w / 2.0),
                    HALF_D + WALL / 2.0, NAVE_H / 2.0),
            size=(jamb_w, WALL, NAVE_H))
    box("Wall_Front_Lintel", shell,
        centre=(0.0, HALF_D + WALL / 2.0, portal_h + (NAVE_H - portal_h) / 2.0),
        size=(portal_w, WALL, NAVE_H - portal_h))

    # ---- Shadow gaps. A recessed strip at the base and under the aisle
    #      ceiling is what separates architecture from box: it gives the bake a
    #      dark line to draw along every junction instead of a flat corner.
    for side in (-1, 1):
        box(sided("Reveal_Base")(side), structure,
            centre=(side * (HALF_W - REVEAL_DEPTH / 2.0), 0.0, REVEAL_HEIGHT / 2.0),
            size=(REVEAL_DEPTH, depth, REVEAL_HEIGHT))
        box(sided("Reveal_Cornice")(side), structure,
            centre=(side * (HALF_W - REVEAL_DEPTH / 2.0), 0.0, AISLE_H - CORNICE_HEIGHT / 2.0),
            size=(REVEAL_DEPTH, depth, CORNICE_HEIGHT))

    # ---- Frame blanks. The real plates come from the frontend, but the bake
    #      needs something on the wall: a picture occludes the wall behind it
    #      and catches the spot aimed at it. Without a blank here the baked
    #      lightmap shows a clean wall where a frame will later sit.
    for slot in L.SLOTS:
        x, y_height, z_depth = slot["position"]
        inward = -slot["side"]
        box(f"Blank_{slot['name'].replace('.', '_')}", fixtures,
            centre=(x + inward * 0.04, z_depth, y_height),
            size=(0.08, L.FRAME["width"], L.FRAME["height"]))

    # ---- One empty per hanging slot. The frontend resolves these by name out
    #      of the exported glTF and hangs the case plates on them, which is why
    #      a new project never means opening Blender.
    #
    #      The rotation is the part worth getting right. A plate should be able
    #      to take its facing from its anchor instead of the frontend guessing
    #      it from the sign of x — that guess only works while every picture
    #      hangs on a wall parallel to the axis.
    #
    #      glTF nodes face along their local +Z, and the Y-up conversion maps
    #      Blender's local axes as (+X, +Y, +Z) -> (+X, -Z, +Y). So glTF's local
    #      +Z is Blender's local -Y, and pointing a plate into the hall means
    #      turning the empty's local +Y towards the wall behind it.
    for slot in L.SLOTS:
        x, y_height, z_depth = slot["position"]
        rot = math.pi / 2 if slot["side"] < 0 else -math.pi / 2
        empty(slot["name"], anchors, to_blender(x, y_height, z_depth), rot)

    return {
        "objects": sum(len(bpy.data.collections[c].objects) for c in COLLECTIONS),
        "slots": len(L.SLOTS),
    }


def setup_scene():
    """Metric units at metre scale, so 1 Blender unit is 1 metre everywhere."""
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"


def wipe_default_scene():
    """The startup cube, light and camera are not part of the hall."""
    for name in ("Cube", "Light"):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)


if __name__ == "__main__":
    wipe_default_scene()
    setup_scene()
    report = build()
    print(f"Basilika gebaut: {report['objects']} Objekte, {report['slots']} Haengeplaetze")
    print(f"  Seitengang  {S['aisleWidth']} x {AISLE_H} m")
    print(f"  Mittelschiff {PIER_IN * 2:.1f} x {NAVE_H} m")
    print(f"  Halle       {L.ROOM['width']} x {L.ROOM['depth']} x {NAVE_H} m")
