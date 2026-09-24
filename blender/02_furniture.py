# =============================================================================
# 02 — FURNITURE
#
# The fittings: benches, bins, planters and the barriers in front of the work.
#
# These were built in the browser out of rounded boxes, which is what you do
# when the room is generated per frame. It is the wrong tool here. A bench is
# not moving, so it can have a chamfer on every edge, a scanned walnut top, and
# a shadow baked under it — none of which costs a frame.
#
# Run from Blender, after 01_shell.py:
#     exec(open(r"<repo>/blender/02_furniture.py").read())
#
# WHERE THINGS STAND
#
# Every position comes from room_layout, which is generated from
# lib/roomLayout.ts. Nothing is placed by hand here: the fittings end up baked
# into a lightmap, so a coordinate that exists twice means a bench standing
# next to its own shadow.
#
# ON THE MIRROR
#
# to_blender() maps the frontend's (x, up, depth) onto Blender's (x, depth, up),
# which swaps two axes and is therefore a reflection, not a rotation. The glTF
# export then negates depth again and the frontend turns the hall around on
# load, and what comes out the far end is the authored layout mirrored in x.
#
# That is harmless and deliberate: the hall is bilaterally symmetric, and so is
# every set of fittings except the bins, whose left-right alternation simply
# starts on the other side. It does mean an angle is mirrored too, so the small
# rotations the planters carry are negated on the way in — otherwise the jitter
# would come out leaning the wrong way.
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

COLLECTION = "15_Furniture"

# --- Bench -------------------------------------------------------------------
# A solid timber slab on two folded steel plates. The proportions are a gallery
# bench rather than a park bench: low, long, no back, so it does not block the
# view down the hall from anywhere.
BENCH = {
    "length": 2.20,      # along the hall
    "depth": 0.62,
    "slab": 0.10,        # thickness of the timber
    "seat": 0.45,        # height of the top face
    "plate": 0.014,      # steel plate thickness
    "plate_width": 0.50,
    "leg_inset": 0.38,   # from each end of the slab
}

# --- Waste bin ---------------------------------------------------------------
BIN = {
    "top_r": 0.190,
    "bottom_r": 0.165,
    "height": 0.600,
    "foot_r": 0.152,
    "foot_h": 0.040,
    "band_r": 0.197,
    "band_h": 0.075,
    "throat_r": 0.146,   # the opening
    "liner_depth": 0.34,
}

# --- Planters ----------------------------------------------------------------
# Square, tapered, cast concrete. Two sizes: the tall one holds the corners of
# the hall, the low one sits beside a bench.
PLANTER = {
    "corner": {
        "top": 0.36, "bottom": 0.29, "height": 0.72,
        "blades": 14, "blade_height": 1.72, "blade_width": 0.105,
    },
    "bench": {
        "top": 0.215, "bottom": 0.175, "height": 0.46,
        "blades": 9, "blade_height": 0.96, "blade_width": 0.078,
    },
}
PLANTER_RIM = 0.035      # depth of the chamfered rim band
PLANTER_PLINTH = 0.055   # recessed foot, same shadow gap the walls get
SOIL_DROP = 0.09         # how far the soil sits below the rim

# --- Barrier -----------------------------------------------------------------
BARRIER = {
    "base_r": 0.190,
    "base_top_r": 0.170,
    "base_h": 0.035,
    "post_bottom_r": 0.038,
    "post_top_r": 0.032,
    "post_h": 0.865,
    "ball_r": 0.050,
    "rope_r": 0.026,
    "rope_sag": 0.26,
    "rope_segments": 18,
}

SIDE_SEGMENTS = 28       # around a bin or a post
BALL_SEGMENTS = (14, 7)  # around, and pole to pole


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
    coll = bpy.data.collections.get(name)
    if coll is None:
        return
    for obj in list(coll.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)


def mesh_object(name, collection, verts, faces, smooth=False):
    """
    Build an object straight from vertex data.

    Same reasoning as 01_shell: operators depend on the active collection and
    the current mode, and this script is driven from outside the UI.

    Winding is counter-clockwise seen from outside the solid, everywhere. A
    face wound the other way looks perfectly fine in the viewport and bakes to
    black, which is a mistake this project has already made once.
    """
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def bevel(obj, width, segments=2, angle=radians(25)):
    """
    Chamfer every hard edge.

    This is the whole difference between a modelled object and a box. A 3 mm
    chamfer is invisible as a shape and unmistakable as a highlight: it catches
    the cove light and draws the edge, where a perfect 90-degree corner just
    disappears into whatever is behind it.

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
            # duller object, not a broken build.
            pass
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def box(name, collection, centre, size):
    """Axis-aligned box, already in Blender axes."""
    sx, sy, sz = (s / 2.0 for s in size)
    cx, cy, cz = centre
    verts = [
        (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
    ]
    faces = [
        (3, 2, 1, 0), (5, 6, 7, 4),
        (1, 5, 4, 0), (2, 6, 5, 1),
        (3, 7, 6, 2), (0, 4, 7, 3),
    ]
    return mesh_object(name, collection, verts, faces)


def tube(name, collection, centre, r_bottom, r_top, height,
         segments=SIDE_SEGMENTS, cap_bottom=True, cap_top=True, smooth=True):
    """A cone frustum. Radii are measured to the vertices, not to the flats."""
    cx, cy, cz = centre
    bottom_z = cz - height / 2.0
    top_z = cz + height / 2.0

    verts = []
    for ring_r, ring_z in ((r_bottom, bottom_z), (r_top, top_z)):
        for i in range(segments):
            a = 2.0 * pi * i / segments
            verts.append((cx + ring_r * cos(a), cy + ring_r * sin(a), ring_z))

    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        # Anticlockwise from above, so tangent x up points outwards.
        faces.append((i, j, segments + j, segments + i))
    if cap_bottom:
        faces.append(tuple(range(segments - 1, -1, -1)))
    if cap_top:
        faces.append(tuple(range(segments, segments * 2)))

    obj = mesh_object(name, collection, verts, faces, smooth=smooth)
    if smooth and (cap_bottom or cap_top):
        # The caps are flat; only the wall should round off.
        for polygon in obj.data.polygons:
            if len(polygon.vertices) > 4:
                polygon.use_smooth = False
    return obj


def ring(name, collection, centre, r_inner, r_outer, segments=SIDE_SEGMENTS,
         facing_up=True):
    """A flat annulus — the top of a bin, the mouth of a planter."""
    cx, cy, cz = centre
    verts = []
    for r in (r_inner, r_outer):
        for i in range(segments):
            a = 2.0 * pi * i / segments
            verts.append((cx + r * cos(a), cy + r * sin(a), cz))
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        quad = (i, j, segments + j, segments + i)
        faces.append(quad if facing_up else tuple(reversed(quad)))
    return mesh_object(name, collection, verts, faces)


def sphere(name, collection, centre, radius, segments=BALL_SEGMENTS):
    """Closed UV sphere, smooth shaded. Used once, for a barrier finial."""
    around, stacks = segments
    cx, cy, cz = centre
    verts = [(cx, cy, cz + radius)]
    for s in range(1, stacks):
        phi = pi * s / stacks
        z = cos(phi) * radius
        r = sin(phi) * radius
        for i in range(around):
            a = 2.0 * pi * i / around
            verts.append((cx + r * cos(a), cy + r * sin(a), cz + z))
    verts.append((cx, cy, cz - radius))
    bottom = len(verts) - 1

    faces = []
    for i in range(around):
        j = (i + 1) % around
        faces.append((0, 1 + i, 1 + j))
    for s in range(stacks - 2):
        base = 1 + s * around
        for i in range(around):
            j = (i + 1) % around
            faces.append((base + i, base + around + i, base + around + j, base + j))
    base = 1 + (stacks - 2) * around
    for i in range(around):
        j = (i + 1) % around
        faces.append((bottom, base + j, base + i))
    return mesh_object(name, collection, verts, faces, smooth=True)


def tube_along(name, collection, points, radius, segments=10):
    """
    Sweep a circle along a polyline. The barrier rope, and nothing else.

    The frame is built from the segment direction and world up rather than
    carried along the curve, which would be the right thing for a loop and is
    needless for a rope that sags less than a third of a metre.
    """
    verts = []
    for index, point in enumerate(points):
        nxt = points[min(index + 1, len(points) - 1)]
        prv = points[max(index - 1, 0)]
        dx, dy, dz = (nxt[0] - prv[0], nxt[1] - prv[1], nxt[2] - prv[2])
        length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
        tx, ty, tz = dx / length, dy / length, dz / length
        # side = tangent x up, normalised
        sx, sy, sz = ty * 1.0 - tz * 0.0, tz * 0.0 - tx * 1.0, 0.0
        slen = math.sqrt(sx * sx + sy * sy + sz * sz) or 1.0
        sx, sy, sz = sx / slen, sy / slen, sz / slen
        # up = side x tangent
        ux = sy * tz - sz * ty
        uy = sz * tx - sx * tz
        uz = sx * ty - sy * tx
        for i in range(segments):
            a = 2.0 * pi * i / segments
            c, s = cos(a), sin(a)
            verts.append((
                point[0] + radius * (c * sx + s * ux),
                point[1] + radius * (c * sy + s * uy),
                point[2] + radius * (c * sz + s * uz),
            ))

    faces = []
    for ringidx in range(len(points) - 1):
        base = ringidx * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((base + i, base + j, base + segments + j, base + segments + i))
    return mesh_object(name, collection, verts, faces, smooth=True)


def place(obj, position, rotation):
    """
    Move a piece modelled at the origin to where the layout says it stands.

    `position` arrives in frontend coordinates and `rotation` as the angle the
    piece faces there. The angle is negated because to_blender is a reflection
    (see the header): a mirror turns a left turn into a right one.
    """
    x, y_height, z_depth = position
    obj.location = to_blender(x, y_height, z_depth)
    obj.rotation_euler = (0.0, 0.0, -rotation)
    return obj


def join(name, collection, parts):
    """
    Fold one piece of furniture into a single object.

    Not for the draw call — everything is joined again in 06_unwrap — but so the
    outliner holds sixteen benches and bins rather than a hundred and forty
    boxes, and so a piece can be moved and rotated as one thing.
    """
    if len(parts) == 1:
        parts[0].name = name
        return parts[0]

    bm = bmesh.new()
    for part in parts:
        bm.from_mesh(part.data)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    for part in parts:
        data = part.data
        bpy.data.objects.remove(part, do_unlink=True)
        if data.users == 0:
            bpy.data.meshes.remove(data)

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


# ------------------------------------------------------------------- pieces
def build_bench(coll, name):
    """Timber slab, two plate legs. Modelled around the origin, facing +y."""
    b = BENCH
    slab_centre_z = b["seat"] - b["slab"] / 2.0

    parts = []
    slab = box(f"Bench_Seat_{name}", coll,
               centre=(0.0, 0.0, slab_centre_z),
               size=(b["depth"], b["length"], b["slab"]))
    bevel(slab, 0.006, segments=2)
    parts.append(slab)

    leg_height = b["seat"] - b["slab"]
    leg_y = b["length"] / 2.0 - b["leg_inset"]
    for end in (-1, 1):
        leg = box(f"Bench_Leg_{name}_{'A' if end < 0 else 'B'}", coll,
                  centre=(0.0, end * leg_y, leg_height / 2.0),
                  size=(b["plate_width"], b["plate"], leg_height))
        bevel(leg, 0.003, segments=1)
        parts.append(leg)

    return join(f"Bench_{name}", coll, parts)


def build_bin(coll, name):
    """Powder-coated body, brushed band at the mouth, a dark hole inside."""
    b = BIN
    parts = []

    foot = tube(f"Bin_Foot_{name}", coll,
                centre=(0.0, 0.0, b["foot_h"] / 2.0),
                r_bottom=b["foot_r"] - 0.004, r_top=b["foot_r"],
                height=b["foot_h"])
    bevel(foot, 0.004, segments=1)
    parts.append(foot)

    body_centre = b["foot_h"] + b["height"] / 2.0
    body = tube(f"Bin_Body_{name}", coll,
                centre=(0.0, 0.0, body_centre),
                r_bottom=b["bottom_r"], r_top=b["top_r"],
                height=b["height"], cap_bottom=False)
    parts.append(body)

    band_centre = b["foot_h"] + b["height"] + b["band_h"] / 2.0 - 0.01
    band = tube(f"Bin_Band_{name}", coll,
                centre=(0.0, 0.0, band_centre),
                r_bottom=b["band_r"], r_top=b["band_r"],
                height=b["band_h"], cap_bottom=False, cap_top=False)
    parts.append(band)

    mouth_z = band_centre + b["band_h"] / 2.0
    parts.append(ring(f"Bin_Rim_{name}", coll,
                      centre=(0.0, 0.0, mouth_z),
                      r_inner=b["throat_r"], r_outer=b["band_r"]))

    # The liner faces inwards: a bin is a hole, and a hole seen from outside is
    # the back of its own wall.
    liner = tube(f"Bin_Liner_{name}", coll,
                 centre=(0.0, 0.0, mouth_z - b["liner_depth"] / 2.0),
                 r_bottom=b["throat_r"] - 0.012, r_top=b["throat_r"],
                 height=b["liner_depth"], cap_top=False, cap_bottom=False)
    flip_normals(liner)
    parts.append(liner)

    parts.append(ring(f"Bin_Bottom_{name}", coll,
                      centre=(0.0, 0.0, mouth_z - b["liner_depth"]),
                      r_inner=0.0001, r_outer=b["throat_r"] - 0.012))

    return join(f"Bin_{name}", coll, parts)


def flip_normals(obj):
    """Turn a shell inside out — used once, for the inside of a bin."""
    mesh = obj.data
    for polygon in mesh.polygons:
        verts = list(polygon.vertices)
        polygon.vertices = tuple(reversed(verts))
    mesh.update()
    return obj


def blade(coll, name, height, width, lean, twist):
    """
    One leaf of a sansevieria: straight-ish, tapered, slightly curved.

    Built with thickness rather than as a flat card. A single plane bakes on
    one side and goes black on the other, and alpha-cut leaf textures would
    need a whole second material path through the bake for very little.
    """
    sections = 7
    thickness = 0.009
    verts = []
    for s in range(sections + 1):
        t = s / sections
        # Widest at a quarter of the way up, then a long taper to a point.
        # The first attempt peaked in the middle and ended in a needle, which
        # read as a sea urchin rather than as a plant.
        taper = (1.0 - t ** 1.7) * (0.62 + 1.28 * min(t * 4.0, 1.0))
        half = max(width * taper * 0.5, 0.0015)
        bend = lean * t * t
        z = height * t
        a = twist * t
        ca, sa = cos(a), sin(a)
        for sx, sy in ((-half, -thickness / 2.0), (half, -thickness / 2.0),
                       (half, thickness / 2.0), (-half, thickness / 2.0)):
            verts.append((
                bend + sx * ca - sy * sa,
                sx * sa + sy * ca,
                z,
            ))

    faces = []
    for s in range(sections):
        base = s * 4
        for i in range(4):
            j = (i + 1) % 4
            faces.append((base + i, base + j, base + 4 + j, base + 4 + i))
    faces.append((3, 2, 1, 0))
    top = sections * 4
    faces.append((top, top + 1, top + 2, top + 3))
    return mesh_object(name, coll, verts, faces, smooth=True)


def build_planter(coll, name, variant):
    """Square tapered pot, chamfered rim, recessed foot, and a plant in it."""
    p = PLANTER[variant]
    parts = []

    # A four-sided tube is a square pot; the radius is to the corner, so the
    # half-width the layout thinks in has to be scaled up to reach it.
    corner = math.sqrt(2.0)
    plinth_top = PLANTER_PLINTH
    plinth = tube(f"Planter_Plinth_{name}", coll,
                  centre=(0.0, 0.0, plinth_top / 2.0),
                  r_bottom=(p["bottom"] - 0.03) * corner,
                  r_top=(p["bottom"] - 0.02) * corner,
                  height=plinth_top, segments=4, smooth=False)
    parts.append(plinth)

    body_h = p["height"] - plinth_top - PLANTER_RIM
    body = tube(f"Planter_Pot_{name}", coll,
                centre=(0.0, 0.0, plinth_top + body_h / 2.0),
                r_bottom=p["bottom"] * corner, r_top=p["top"] * corner,
                height=body_h, segments=4, cap_bottom=False, smooth=False)
    bevel(body, 0.008, segments=1)
    parts.append(body)

    rim = tube(f"Planter_Rim_{name}", coll,
               centre=(0.0, 0.0, p["height"] - PLANTER_RIM / 2.0),
               r_bottom=p["top"] * corner, r_top=(p["top"] + 0.012) * corner,
               height=PLANTER_RIM, segments=4, cap_bottom=False, cap_top=False,
               smooth=False)
    bevel(rim, 0.006, segments=1)
    parts.append(rim)

    soil_z = p["height"] - SOIL_DROP
    parts.append(tube(f"Planter_Soil_{name}", coll,
                      centre=(0.0, 0.0, soil_z - 0.02),
                      r_bottom=(p["top"] - 0.03) * corner,
                      r_top=(p["top"] - 0.01) * corner,
                      height=0.04, segments=4, cap_bottom=False, smooth=False))

    # The golden angle keeps successive blades from lining up, which is what
    # a plant does and what an even fan of them very obviously does not.
    blades = []
    golden = pi * (3.0 - math.sqrt(5.0))
    clump = 0.10 * p["top"] / 0.36
    for i in range(p["blades"]):
        a = i * golden
        leaf = blade(coll, f"Plant_Blade_{name}_{i:02d}",
                     height=p["blade_height"] * (0.72 + 0.38 * ((i * 3) % 5) / 4.0),
                     width=p["blade_width"] * (0.85 + 0.3 * ((i * 5) % 3) / 2.0),
                     lean=0.07 + 0.07 * ((i * 7) % 5) / 4.0,
                     twist=0.3 * (1 if i % 2 else -1))
        leaf.rotation_euler = (0.0, 0.0, a)
        leaf.location = (clump * cos(a), clump * sin(a), soil_z)
        blades.append(leaf)

    bpy.context.view_layer.update()
    for leaf in blades:
        leaf.data.transform(leaf.matrix_basis)
        leaf.location = (0.0, 0.0, 0.0)
        leaf.rotation_euler = (0.0, 0.0, 0.0)

    plant = join(f"Plant_{name}", coll, blades)
    return join(f"Planter_{name}", coll, parts), plant


def build_barrier(coll, name):
    """Two posts and a rope that hangs between them."""
    b = BARRIER
    parts = []
    tops = []

    for end in (-1, 1):
        y = end * L.BARRIER_HALF_SPAN
        tag = "A" if end < 0 else "B"

        base = tube(f"Barrier_Base_{name}_{tag}", coll,
                    centre=(0.0, y, b["base_h"] / 2.0),
                    r_bottom=b["base_r"], r_top=b["base_top_r"],
                    height=b["base_h"])
        bevel(base, 0.004, segments=1)
        parts.append(base)

        post_centre = b["base_h"] + b["post_h"] / 2.0
        parts.append(tube(f"Barrier_Post_{name}_{tag}", coll,
                          centre=(0.0, y, post_centre),
                          r_bottom=b["post_bottom_r"], r_top=b["post_top_r"],
                          height=b["post_h"], cap_bottom=False))

        ball_z = b["base_h"] + b["post_h"] + b["ball_r"] * 0.55
        parts.append(sphere(f"Barrier_Ball_{name}_{tag}", coll,
                            centre=(0.0, y, ball_z), radius=b["ball_r"]))
        tops.append((0.0, y, ball_z - b["ball_r"] * 0.35))

    # A hanging rope is a catenary, and over this short a span a parabola is
    # indistinguishable from one and far less trouble.
    (x0, y0, z0), (x1, y1, z1) = tops
    points = []
    for i in range(b["rope_segments"] + 1):
        t = i / b["rope_segments"]
        points.append((
            x0 + (x1 - x0) * t,
            y0 + (y1 - y0) * t,
            z0 + (z1 - z0) * t - b["rope_sag"] * 4.0 * t * (1.0 - t),
        ))
    rope = tube_along(f"Barrier_Rope_{name}", coll, points, b["rope_r"])

    return join(f"Barrier_{name}", coll, parts), rope


# -------------------------------------------------------------------- build
def build():
    coll = get_collection(COLLECTION)
    clear_collection(COLLECTION)
    made = {"benches": 0, "bins": 0, "planters": 0, "barriers": 0}

    for entry in L.BENCHES:
        tag = entry["name"].split(".")[-1]
        place(build_bench(coll, tag), entry["position"], entry["rotation"])
        made["benches"] += 1

    for entry in L.BINS:
        tag = entry["name"].split(".")[-1]
        place(build_bin(coll, tag), entry["position"], entry["rotation"])
        made["bins"] += 1

    for entry in L.PLANTERS:
        tag = entry["name"].replace("planter.", "").replace(".", "_")
        pot, plant = build_planter(coll, tag, entry["variant"])
        place(pot, entry["position"], entry["rotation"])
        place(plant, entry["position"], entry["rotation"])
        made["planters"] += 1

    for entry in L.BARRIERS:
        tag = entry["name"].split(".")[-1]
        posts, rope = build_barrier(coll, tag)
        place(posts, entry["position"], entry["rotation"])
        place(rope, entry["position"], entry["rotation"])
        made["barriers"] += 1

    bpy.context.view_layer.update()
    return coll, made


if __name__ == "__main__":
    coll, made = build()
    faces = sum(len(o.data.polygons) for o in coll.objects if o.type == "MESH")
    print(f"Moeblierung gebaut: {len(coll.objects)} Objekte, {faces} Faces")
    print(f"  {made['benches']} Baenke, {made['bins']} Muelleimer, "
          f"{made['planters']} Pflanzkuebel, {made['barriers']} Absperrungen")
