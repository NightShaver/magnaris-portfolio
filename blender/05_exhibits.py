# =============================================================================
# 05 — EXHIBITS
#
# The far end of the hall: the hidden wall, and the two founder exhibits that
# replaced the printed panels beside it.
#
# Run from Blender, after 04_lighting.py:
#     exec(open(r"<repo>/blender/05_exhibits.py").read())
#
# WHY THIS IS ITS OWN CHAPTER
#
# Everything up to here builds one room out of one palette and bakes it flat.
# This does not. It brings its own materials, because raw concrete and glowing
# cyan are not in the hall's palette and should not be: they are the accent,
# and an accent folded into the base palette stops being one.
#
# WHAT MOVES AND WHAT DOES NOT
#
# Two collections, and the split is the whole design:
#
#   40_Exhibits  static. Joined into the Fittings bake mesh in 06_unwrap and
#                lit by the same lightmap as the benches, which is what gives a
#                podium a contact shadow instead of a float.
#
#   45_Runtime   driven by the browser. Six wall blocks that slide, eleven
#                sculpture parts that turn, two plates the frontend draws the
#                skill texts onto. Never baked: a lightmap is a photograph of
#                one moment, and none of these hold still.
#
# The runtime objects still take part in the bake as occluders. They are not
# hidden while the hall is traced, so the closed wall casts its shadow into the
# end bay and the cyan spills onto the floor around each podium. They are
# simply not bake targets.
#
# THE ANIMATION, AND HOW IT REACHES WEBGL
#
# Keyframes go into actions, actions get pushed onto NLA tracks, and 08_export
# runs the glTF exporter in NLA_TRACKS mode. That mode merges tracks sharing a
# name across objects into one glTF animation, which is the only way to get six
# blocks moving as one mechanism out of Blender without hand-writing the clip.
# Two tracks, therefore two clips:
#
#   HiddenWall   1 ..  86   played once, scrubbed by the visitor's distance
#   Idle         1 .. 241   looped forever
#
# Scrubbed, not triggered: the frontend sets the mixer's time from how close
# the visitor is, so walking away closes the wall again at the pace it opened.
# A triggered clip would have to be reversed by hand and would jump if the
# visitor turned around halfway through.
#
# ON WHICH SIDE IS WHICH
#
# Positions authored straight into Blender arrive in the frontend rotated, not
# mirrored: the export maps (x, y, z) to (x, z, -y) and the frontend turns the
# room around, and both of those are rotations. What that costs is one sign —
# Blender +x is frontend -x — and what it saves is the reflection that
# to_blender() carries in 02_furniture, so nothing here reads backwards.
#
# MEMBERS[1] is Technical Art and hangs on the left as you walk in, so Technical
# Art is built at Blender +x. MEMBERS[0], Anwendungsentwicklung, at -x.
# =============================================================================

import importlib
import math
import pathlib
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = pathlib.Path(r"C:\Users\Felix\Desktop\DemoWebseiten\Portfolio")
BLENDER_DIR = ROOT / "blender"
if str(BLENDER_DIR) not in sys.path:
    sys.path.insert(0, str(BLENDER_DIR))

import room_layout as L  # noqa: E402

importlib.reload(L)

STATIC_COLLECTION = "40_Exhibits"
RUNTIME_COLLECTION = "45_Runtime"


def load_module(filename):
    """Read another build script's helpers without running its build."""
    namespace = {"__name__": f"_{filename}", "__file__": str(BLENDER_DIR / filename)}
    source = (BLENDER_DIR / filename).read_text(encoding="utf-8")
    exec(compile(source, filename, "exec"), namespace)
    return namespace


F = load_module("02_furniture.py")    # box, bevel, mesh_object, collections
M = load_module("03_materials.py")    # srgb, fresh_material, scanned, tint_for

box = F["box"]
bevel = F["bevel"]
mesh_object = F["mesh_object"]
get_collection = F["get_collection"]
clear_collection = F["clear_collection"]
srgb = M["srgb"]
fresh_material = M["fresh_material"]

# -----------------------------------------------------------------------------
# PALETTE
#
# Two greys and one cyan, and that is the whole scheme. The greys are the same
# scanned concrete the planters use, so the new work reads as the same building
# rather than as an import. The cyan is the brand teal pushed up into a value
# that survives AgX without going white.
# -----------------------------------------------------------------------------
CYAN = srgb("#22dcd6")             # the light itself
CYAN_DEEP = srgb("#0f8e91")        # brand teal, for surfaces that only glint
CONCRETE_PODIUM = srgb("#353b45")  # darker, so the sculpture wins the contrast
GRAPHITE = srgb("#0a0d13")

# Scanned materials this script adds, as {name: (texture set, metres per repeat)}.
# 06_unwrap merges this into its own map and repoints both onto UV0, and
# 08_export merges it again when it describes the materials for the frontend.
# `Wall_Hidden` is the wall's own plaster, at the wall's own tile size, in the
# wall's own value — a copy of Wall_Aisle under a second name.
#
# It was cast concrete at first, which is what the brief asks the end of this
# hall to be made of, and it was wrong the moment it was lit: the blocks read
# as a dark speckled panel hung on a pale plaster wall, with an outline around
# them. An outline is the one thing a hidden wall cannot have. The brutalism is
# carried by the podiums, the alcove and the light; the wall's only job is to
# be indistinguishable from its neighbours until it moves.
#
# A second name rather than reusing Wall_Aisle, because the manifest keys
# materials by name and that one already belongs to a baked mesh — see the note
# on Sculpt_Glow.
TEXTURED = {
    "Wall_Hidden": ("plaster", 3.2),
    "Concrete_Podium": ("concrete", 1.3),
}
TILES = {name: tile for name, (_set, tile) in TEXTURED.items()}

# -----------------------------------------------------------------------------
# THE HIDDEN WALL
# -----------------------------------------------------------------------------
HW = L.HIDDEN_WALL
HALF_D = L.HALF_D
# Thickness of the perimeter wall, read from the script that built it rather
# than retyped: the blocks have to seat inside it, and a copy of this number
# that drifts is six blocks parked where the visitor can see them.
WALL = load_module("01_shell.py")["WALL"]
FACE_Y = -HALF_D                 # inner face of the back wall, where it sits flush
HALF_OPEN = HW["width"] / 2.0
JOINT = HW["joint"]
BLOCK_D = HW["blockDepth"]
RETRACT = HW["retract"]

# The front slab of a block, and the slot behind it.
#
# Every block is three parts: a thin face, an emissive plate immediately behind
# it, and the mass behind that, set back far enough not to cover the plate. Look
# straight at the wall and you see concrete with hairlines in it; stand off to
# one side and the hairlines light up, because you are now seeing down an
# eighteen millimetre slot at something that glows.
#
# Eighteen and not thirty-five, which is where this started. A deeper slot is a
# better-looking piece of casting and a worse-looking light: at 35 mm the glow
# was only visible within a few degrees of head-on, so the seams read as drawn
# grey lines from anywhere in the nave. The joint stays six millimetres, which
# is what makes it a cast line rather than a door gap; the slot behind it got
# shallow enough to actually see down.
FACE_SLAB = 0.018
GLOW_SLAB = 0.006
CORE_INSET = 0.024

# How the opening is cut up.
#
# Three bands of different heights, each split at a different x. The staggered
# splits are the point: line the vertical joints up and the wall reads as a grid
# of panels, offset them and it reads as one cast surface that happens to have
# cracks in it. Nothing here is symmetric, which is what keeps the eye from
# finding the mechanism before it moves.
BANDS = (
    (0.00, 1.34, 0.62),
    (1.34, 2.52, -0.78),
    (2.52, HW["height"], 0.24),
)

# Order the blocks leave in: bottom pair, top pair, middle pair last. The middle
# of a wall is where a door would be, so it is the last thing to admit there is
# one.
DEPARTURE = ((0, -1), (0, 1), (2, -1), (2, 1), (1, -1), (1, 1))

FPS = 24
WALL_START = 1
WALL_RETRACT_END = 26     # the slab has cleared its own frame
WALL_PART_START = 22      # blocks start parting before the retract finishes
WALL_SLIDE = 48           # frames one block takes to travel
WALL_STAGGER = 3          # frames between one block leaving and the next
WALL_END = WALL_PART_START + WALL_STAGGER * (len(DEPARTURE) - 1) + WALL_SLIDE
WALL_CLEARANCE = 0.90     # how far past the opening edge a block parks
WALL_SEAT = 0.04          # how deep it sits once it is inside the jamb
WALL_SEAT_START = 39      # frame of the slide at which it starts seating

IDLE_START = 1
# Twenty seconds at 24 fps, and the length is set by the slowest orbit rather
# than picked. Every spin in this clip has to be a whole number of turns or the
# loop point is a jump — see spin() — so the only way to have a body take its
# time is to give the clip more of it. At ten seconds the outermost planet
# would have had to run a full orbit in ten, which is a moon on a fairground
# ride, not an exhibit.
IDLE_END = 481

# -----------------------------------------------------------------------------
# THE EXHIBITS
# -----------------------------------------------------------------------------
EX = L.EXHIBIT
PODIUM_X = L.EXHIBIT_X
PODIUM_Y = -HALF_D + EX["standoff"]
LECTERN_Y = PODIUM_Y + EX["lecternOffset"]
TILT = EX["lecternTilt"]

SIDES = (
    # (key, Blender x, what it stands for)
    ("art", +1.0, "Technical Art"),
    ("dev", -1.0, "Anwendungsentwicklung"),
)


# ----------------------------------------------------------------- materials
def emissive(name, colour, strength, base=GRAPHITE, roughness=0.35):
    """
    A surface that is its own light source.

    The base colour still matters. These sit in a dark hall and are mostly seen
    at grazing angles, where what the eye reads is an unlit body with a hot line
    along it, not the emission on its own.
    """
    mat = fresh_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (300, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Emission Color"].default_value = colour
    bsdf.inputs["Emission Strength"].default_value = strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def solid(name, colour, roughness, metallic=0.0):
    mat = fresh_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (300, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def textured(name, set_name, target, tile, rough_min, rough_max,
             normal_strength=0.9):
    """One of the hall's scanned sets, graded to a colour, through 03's builder."""
    mat = fresh_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (300, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    M["scanned"](mat, nodes, links, bsdf, set_name,
                 M["tint_for"](target, set_name), tile=tile,
                 rough_min=rough_min, rough_max=rough_max,
                 normal_strength=normal_strength)
    return mat


def build_materials():
    return {
        # Every argument copied from Wall_Aisle in 03_materials.py. If that one
        # is re-graded, this one has to be re-graded with it or the seam the
        # whole design is hiding reappears as a change of value.
        "Wall_Hidden": textured("Wall_Hidden", "plaster",
                                M["PALETTE"]["wall_aisle"], 3.2, 0.80, 0.94,
                                normal_strength=0.35),
        "Concrete_Podium": textured("Concrete_Podium", "concrete",
                                    CONCRETE_PODIUM, 1.3, 0.48, 0.74),
        # The joints.
        #
        # Graded against the slot, not in the abstract. At nine watts behind a
        # 35 mm slot they were invisible from anywhere but head-on; at fourteen
        # behind an 18 mm one they clipped to white, which loses the colour and
        # turns a hairline into a strip light. Six is where the line stays cyan
        # along its whole length and still carries.
        "Seam_Glow": emissive("Seam_Glow", CYAN, 6.0),
        # The two coves in the alcove behind the wall, seen only once it is
        # open. Softer than the joints: these wash a surface a metre away
        # rather than escaping through a six millimetre slot.
        "Niche_Glow": emissive("Niche_Glow", CYAN, 2.4),
        # The podium's light channel, and the sculptures' own glow.
        #
        # Two materials for one colour, and the reason is the manifest: the
        # frontend keys materials by name, so a name that appears once under a
        # baked mesh and once under the runtime collection collapses into a
        # single material and one of the two loses its lightmap. The podium is
        # baked, the sculpture is not, so they cannot share a name.
        "Exhibit_Glow": emissive("Exhibit_Glow", CYAN, 4.0),
        "Sculpt_Glow": emissive("Sculpt_Glow", CYAN, 4.4),
        "Exhibit_Core": emissive("Exhibit_Core", CYAN, 2.2, base=srgb("#07222a")),
        "Exhibit_Edge": solid("Exhibit_Edge", srgb("#171d27"), 0.34, metallic=0.85),
        # The planets. White and matte, because each one is painted in the
        # browser from its own canvas map — a tint here would colour six
        # different worlds the same.
        "Planet_Body": solid("Planet_Body", srgb("#ffffff"), 0.82),
        # The reading plate. Near black and smooth: the frontend paints the
        # skills onto it, and a colour of its own would tint them.
        "Display_Plate": emissive("Display_Plate", CYAN_DEEP, 0.55,
                                  base=srgb("#070b11"), roughness=0.12),
    }


# ------------------------------------------------------------------ geometry
def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def taper(name, collection, centre_xy, z0, z1, width_bottom, width_top):
    """A box that narrows as it rises. The podium is three of these stacked."""
    cx, cy = centre_xy
    a, b = width_bottom / 2.0, width_top / 2.0
    verts = [
        (cx - a, cy - a, z0), (cx + a, cy - a, z0),
        (cx + a, cy + a, z0), (cx - a, cy + a, z0),
        (cx - b, cy - b, z1), (cx + b, cy - b, z1),
        (cx + b, cy + b, z1), (cx - b, cy + b, z1),
    ]
    faces = [
        (3, 2, 1, 0), (5, 6, 7, 4),
        (1, 5, 4, 0), (2, 6, 5, 1),
        (3, 7, 6, 2), (0, 4, 7, 3),
    ]
    return mesh_object(name, collection, verts, faces)


def torus(name, collection, radius, minor, major_segments=44, minor_segments=8):
    """Built by hand: primitive_torus_add needs a context this script has not."""
    verts, faces = [], []
    for i in range(major_segments):
        a = 2.0 * math.pi * i / major_segments
        cx, cy = math.cos(a), math.sin(a)
        for j in range(minor_segments):
            b = 2.0 * math.pi * j / minor_segments
            r = radius + minor * math.cos(b)
            verts.append((cx * r, cy * r, minor * math.sin(b)))
    for i in range(major_segments):
        for j in range(minor_segments):
            a0 = i * minor_segments + j
            a1 = i * minor_segments + (j + 1) % minor_segments
            b0 = ((i + 1) % major_segments) * minor_segments + j
            b1 = ((i + 1) % major_segments) * minor_segments + (j + 1) % minor_segments
            faces.append((a0, b0, b1, a1))
    return mesh_object(name, collection, verts, faces, smooth=True)


def icosphere(name, collection, radius, subdivisions=2, wire=0.0, smooth=True):
    """An icosphere, optionally turned into a lattice of its own edges."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    if wire > 0.0:
        bmesh.ops.wireframe(bm, faces=bm.faces[:], thickness=wire,
                            offset=wire * 0.5, use_replace=True,
                            use_boundary=True, use_even_offset=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth and wire == 0.0:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def transform(obj, rotate_x=0.0, translate=(0.0, 0.0, 0.0)):
    """Bake a rotation and an offset into the mesh, leaving the origin alone."""
    obj.data.transform(Matrix.Translation(Vector(translate))
                       @ Matrix.Rotation(rotate_x, 4, "X"))
    obj.data.update()
    return obj


def recentre(obj, pivot):
    """
    Move the mesh so `pivot` becomes the object's origin.

    Anything that turns needs this. A rotation keyframe spins a mesh about its
    object origin, and a sculpture modelled in world coordinates has its origin
    twenty metres away at the middle of the hall, which is a very impressive
    orbit and not the one that was wanted.
    """
    offset = Vector(pivot)
    for vertex in obj.data.vertices:
        vertex.co -= offset
    obj.data.update()
    obj.location = offset
    return obj


def cube_uv(obj, scale=1.0):
    """
    World-scale cube projection, the same convention 06_unwrap uses: one metre
    of surface is one UV unit, so a material's tiling factor stays readable as
    metres per repeat.

    Done here because the runtime objects never reach 06_unwrap — they are not
    joined into a bake mesh — and untextured concrete is the one thing this wall
    cannot be.
    """
    mesh = obj.data
    layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        for loop_index in poly.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis == 0:
                u, v = co.y, co.z
            elif axis == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            layer.data[loop_index].uv = (u / scale, v / scale)
    return obj


def plate_uv(obj):
    """
    0..1 across the plate, measured in the plane it was modelled in.

    Called before the plate is tilted, because after the tilt the reading
    direction is no longer an axis and the frontend's texture would arrive
    rotated by however many degrees the lectern leans.

    U runs the other way on purpose. Positions authored in Blender reach the
    frontend through a rotation, so a plate at +x arrives at -x — and with it,
    the plate's own +x direction. That is harmless for a slab of concrete and
    fatal for type: the first version put "Technical Art" on the lectern
    backwards. Flipping u here means the canvas is drawn left to right and read
    left to right, with the sign change absorbed where it happens.
    """
    mesh = obj.data
    layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    span_x = max(max(xs) - min(xs), 1e-6)
    span_y = max(max(ys) - min(ys), 1e-6)
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            layer.data[loop_index].uv = (1.0 - (co.x - min(xs)) / span_x,
                                         (co.y - min(ys)) / span_y)
    return obj


# ----------------------------------------------------------------- animation
def new_action(obj, name):
    action = bpy.data.actions.new(name)
    if obj.animation_data is None:
        obj.animation_data_create()
    obj.animation_data.action = action
    return action


def action_curves(action):
    """
    Every fcurve in an action, whichever Blender this is.

    Actions grew layers and slots in 4.4 and lost the flat `fcurves` list for
    good in 5.x, where the curves live one level further down in a channelbag
    per slot. Reaching for the new path first and falling back keeps this script
    running on both, which matters because the .blend is the only copy of the
    hall that is not reproducible from source in under a minute.
    """
    flat = getattr(action, "fcurves", None)
    if flat is not None:
        return list(flat)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                curves.extend(bag.fcurves)
    return curves


def shape(obj, interpolation, easing="EASE_IN_OUT"):
    action = obj.animation_data.action
    for curve in action_curves(action):
        for point in curve.keyframe_points:
            point.interpolation = interpolation
            if interpolation not in ("BEZIER", "LINEAR", "CONSTANT"):
                point.easing = easing
        curve.update()
    return action


def push(obj, track_name, start, end):
    """
    Move the object's action onto a named NLA track.

    The name is the contract with the exporter: NLA_TRACKS mode makes one glTF
    animation per track name and merges every object that has a track by that
    name into it. Six blocks on a track called HiddenWall come out as one clip.
    """
    data = obj.animation_data
    action = data.action
    slot = getattr(data, "action_slot", None)
    data.action = None

    track = data.nla_tracks.new()
    track.name = track_name
    strip = track.strips.new(action.name, int(start), action)
    strip.name = track_name
    if slot is not None and hasattr(strip, "action_slot"):
        try:
            strip.action_slot = slot
        except (AttributeError, TypeError):
            pass
    try:
        strip.frame_end_ui = float(end)
    except (AttributeError, TypeError, RuntimeError):
        pass
    return track


def spin(obj, axis, turns, start=IDLE_START, end=IDLE_END, phase=0.0):
    """
    Whole turns, linear, first frame equal to the last.

    Whole is not a stylistic preference, it is the loop. `Idle` repeats
    forever, so an object that has come 0.62 of the way round when the clip
    ends is snapped back through the remaining 137 degrees on the next frame —
    which is exactly what a stutter every twenty seconds looks like, and it
    took one to notice because the motion in between is perfectly smooth.

    Different speeds therefore come from different whole turn counts over the
    same clip, not from fractions of one.
    """
    if abs(turns - round(turns)) > 1e-6:
        raise ValueError(
            f"{obj.name}: {turns} Umdrehungen sind keine ganze Zahl — "
            "der Loop springt an der Nahtstelle."
        )
    rotation = list(obj.rotation_euler)
    for frame, value in ((start, phase), (end, phase + turns * 2.0 * math.pi)):
        rotation[axis] = value
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path="rotation_euler", index=axis, frame=frame)


def bob(obj, amplitude, start=IDLE_START, end=IDLE_END):
    """A full cosine of vertical drift. Ends where it began, so it loops."""
    base = obj.location.z
    span = end - start
    for step, factor in enumerate((0.0, 1.0, 0.0, -1.0, 0.0)):
        frame = start + span * step / 4.0
        obj.location.z = base + amplitude * factor
        obj.keyframe_insert(data_path="location", index=2, frame=frame)
    obj.location.z = base


def drift(obj, amplitude, phase=0.0, steps=8, start=IDLE_START, end=IDLE_END):
    """
    The same idea as bob(), but phased, so a group of objects does not rise and
    fall in unison.

    Eight steps rather than four: at four the curve through the keys is close
    enough to a triangle that the turn at the top reads as a bounce. The first
    and last key hold the same value, which is what lets it loop.
    """
    base = obj.location.z
    span = end - start
    for step in range(steps + 1):
        t = step / steps
        obj.location.z = base + amplitude * math.sin(2.0 * math.pi * (t + phase))
        obj.keyframe_insert(data_path="location", index=2,
                            frame=start + span * t)
    obj.location.z = base


def travel(obj, a, b, times, start=IDLE_START, end=IDLE_END):
    """
    Send an object down a line, over and over, and hide the return trip.

    A signal running an edge has to get back to the start somehow, and a dot
    that slides home again is a dot going the wrong way. So it is scaled out of
    existence at the far end and scaled back in at the near one: it arrives,
    it is absorbed, another one leaves. The loop closes because the last frame
    catches it at zero, exactly where the first frame starts it.
    """
    span = (end - start) / times
    for run in range(times):
        head = start + span * run
        for offset, point in ((0.0, a), (1.0, b)):
            obj.location = point
            obj.keyframe_insert(data_path="location",
                                frame=head + span * offset)
        for offset, size in ((0.0, 0.0), (0.16, 1.0), (0.78, 1.0), (1.0, 0.0)):
            obj.scale = (max(size, 1e-4),) * 3
            obj.keyframe_insert(data_path="scale", frame=head + span * offset)
    obj.location = a
    obj.scale = (1.0, 1.0, 1.0)


def pulse(obj, amount, start=IDLE_START, end=IDLE_END):
    """A breath. Scale, so it reads as the object swelling rather than moving."""
    span = end - start
    for step, factor in enumerate((0.0, 1.0, 0.0, -1.0, 0.0)):
        frame = start + span * step / 4.0
        obj.scale = (1.0 + amount * factor,) * 3
        obj.keyframe_insert(data_path="scale", frame=frame)
    obj.scale = (1.0, 1.0, 1.0)


# ------------------------------------------------------------- hidden wall
def build_block_wall(runtime, mats, *, prefix, track, face_y, inward,
                     mirror=False, alcove=False):
    """
    A wall of six sliding blocks in an opening, and the mechanism that parts it.

    Written once and built twice, because the hall has two openings and they
    want the same answer: the way out at the far end, and the portal the
    visitor flies in through. Nothing about either closed wall says door. It is
    flush with the wall face, it is the same plaster, and the only break in it
    is six millimetres wide. What gives it away is that the hairlines are lit —
    a seam with light behind it is the one detail that makes a visitor walk up
    to a blank wall instead of past it.

    `inward` is the sign that points from the face into the wall, away from the
    room: -1 at the back of the hall, +1 at the portal. Every depth below is
    written against it, so the two builds are the same code and not a copy with
    the signs flipped by hand.

    `mirror` negates the band splits. The two walls are twenty metres apart and
    will never be seen together, but they are seen one after the other, and an
    identical crack pattern at both ends is the kind of thing a visitor notices
    without being able to say what they noticed.
    """
    made, blocks = [], []

    if alcove:
        # A plate far wider than the opening, so that however far off-axis the
        # visitor stands, the open portal never shows its edge.
        #
        # Not baked, despite standing still. It is 190 m2 of flat surface, and
        # dropped into the fittings atlas it took that atlas from 44 texels per
        # metre to 32 — every bench in the hall paying resolution for the back
        # of a hole nobody can see into until the wall opens. It is unlit by
        # design anyway: what reads in there is the glowing frame, against
        # black.
        back_y = face_y + inward * HW["niche"]
        plate = box(f"{prefix}_niche_back", runtime,
                    centre=(0.0, back_y + inward * 0.09,
                            HW["height"] / 2.0 + 0.4),
                    size=(15.6, 0.18, HW["height"] + 2.2))
        # Concrete, not the near-black it used to be. With a frame drawn round
        # the opening the back was only ever a dark field behind it; with two
        # coves washing it, it is the surface the whole reveal is about.
        assign(plate, mats["Concrete_Podium"])
        made.append(plate)

        # Two coves, not a frame.
        #
        # This was a lit rectangle drawn round the whole alcove, and a lit
        # rectangle is a light box: it read as a sign hung in the opening
        # rather than as a room behind it. What the rest of this hall does
        # instead is hide the source and show the wash — the cove over the
        # nave, the channel in each podium — so the alcove does the same. One
        # slot near the floor and one under the head, both set into the reveal,
        # both washing concrete. The type then sits on a lit surface instead of
        # inside an outline.
        inset = 0.30
        frame_y = back_y - inward * 0.03
        reach_x = HALF_OPEN - inset
        strips = [
            ((0.0, frame_y, inset), (reach_x * 2.0, 0.05, 0.05)),
            ((0.0, frame_y, HW["height"] - inset), (reach_x * 2.0, 0.05, 0.05)),
        ]
        for index, (centre, size) in enumerate(strips):
            strip = box(f"{prefix}_niche_glow_{index}", runtime,
                        centre=centre, size=size)
            assign(strip, mats["Niche_Glow"])
            made.append(strip)

    for step, (band_index, side) in enumerate(DEPARTURE):
        z0, z1, split = BANDS[band_index]
        if mirror:
            split = -split
        if side < 0:
            x0, x1 = -HALF_OPEN, split
        else:
            x0, x1 = split, HALF_OPEN

        name = f"{prefix}_{band_index}{'L' if side < 0 else 'R'}"

        # The face: inset by half a joint on every edge, so two neighbours meet
        # with one full joint between them and the opening keeps one at its rim.
        face = box(name, runtime,
                   centre=((x0 + x1) / 2.0, face_y + inward * FACE_SLAB / 2.0,
                           (z0 + z1) / 2.0),
                   size=(x1 - x0 - JOINT, FACE_SLAB, z1 - z0 - JOINT))
        bevel(face, 0.002, segments=1)
        cube_uv(face)
        assign(face, mats["Wall_Hidden"])

        # The lit plate, immediately behind the face and wider than it, so it
        # fills the joint from both sides — but never wider than the opening.
        #
        # It used to overhang by half a joint on all four edges, which is right
        # between two blocks and wrong at the rim: three millimetres of it
        # ended up buried inside the jamb, inside the lintel and under the
        # floor slab, and two solids sharing the same space is what a z-buffer
        # cannot resolve. The portal's left reveal flickered along its whole
        # height because of it.
        gx0 = max(x0 - JOINT / 2.0, -HALF_OPEN)
        gx1 = min(x1 + JOINT / 2.0, HALF_OPEN)
        gz0 = max(z0 - JOINT / 2.0, 0.0)
        gz1 = min(z1 + JOINT / 2.0, HW["height"])

        glow = box(f"{name}_glow", runtime,
                   centre=((gx0 + gx1) / 2.0,
                           face_y + inward * (FACE_SLAB + GLOW_SLAB / 2.0),
                           (gz0 + gz1) / 2.0),
                   size=(gx1 - gx0, GLOW_SLAB, gz1 - gz0))
        assign(glow, mats["Seam_Glow"])

        # The mass. Set back from the edges so it does not cover the plate, and
        # carrying what is left of the block's depth once both faces are taken
        # off it.
        skin = FACE_SLAB + GLOW_SLAB
        core_depth = BLOCK_D - skin * 2.0
        core = box(f"{name}_core", runtime,
                   centre=((x0 + x1) / 2.0,
                           face_y + inward * (skin + core_depth / 2.0),
                           (z0 + z1) / 2.0),
                   size=(x1 - x0 - CORE_INSET * 2.0, core_depth,
                         z1 - z0 - CORE_INSET * 2.0))
        cube_uv(core)
        assign(core, mats["Wall_Hidden"])

        # ---- And the same again on the far end.
        #
        #      A block used to be a face, a light and a mass behind it, which
        #      is right for the wall at the back of the hall: its other side
        #      faces open ground outside the building and is never seen from
        #      anywhere. It is wrong for the portal, where the visitor arrives
        #      on one side and then spends the rest of the visit looking back
        #      at the other. Undecorated, that side showed the core's flat back
        #      set 24 mm behind the block edges — a stepped recess with gaps
        #      you could see the mechanism through.
        #
        #      So a block has two faces. It costs two boxes each and means
        #      neither opening has a back.
        far = face_y + inward * BLOCK_D
        back_glow = box(f"{name}_glow_far", runtime,
                        centre=((gx0 + gx1) / 2.0,
                                far - inward * (FACE_SLAB + GLOW_SLAB / 2.0),
                                (gz0 + gz1) / 2.0),
                        size=(gx1 - gx0, GLOW_SLAB, gz1 - gz0))
        assign(back_glow, mats["Seam_Glow"])

        back_face = box(f"{name}_far", runtime,
                        centre=((x0 + x1) / 2.0,
                                far - inward * FACE_SLAB / 2.0,
                                (z0 + z1) / 2.0),
                        size=(x1 - x0 - JOINT, FACE_SLAB, z1 - z0 - JOINT))
        bevel(back_face, 0.002, segments=1)
        cube_uv(back_face)
        assign(back_face, mats["Wall_Hidden"])

        for part in (glow, core, back_glow, back_face):
            part.parent = face

        # ---- The mechanism. Three moves on two channels, which is what lets
        #      them overlap: the slab is still settling back into the reveal
        #      when the first block starts to travel.
        #
        #      Back, across, and then forward again — and the third move is the
        #      one that took a rebuild to find. Retracting half a metre and
        #      sliding aside leaves the blocks parked in open space behind the
        #      wall, and a five metre opening is more than enough to see them
        #      sitting there from anywhere in the nave. So once a block is
        #      clear of the opening it comes back forward into the thickness of
        #      the jamb and stops there, fully inside a solid wall. Nothing
        #      hides it: it is enclosed, which is the difference between an
        #      illusion that holds from every angle and one that holds from the
        #      angle it was built at.
        #
        #      The move is invisible — by the time it happens the block is
        #      behind a metre of masonry — so it costs two keyframes and buys
        #      the whole thing.
        travel = side * (x1 - x0 + WALL_CLEARANCE)
        leaves = WALL_PART_START + WALL_STAGGER * step

        new_action(face, f"{track}_{name}")
        face.location = (0.0, 0.0, 0.0)
        face.keyframe_insert(data_path="location", index=1, frame=WALL_START)
        face.location.y = inward * RETRACT
        face.keyframe_insert(data_path="location", index=1, frame=WALL_RETRACT_END)

        face.keyframe_insert(data_path="location", index=1,
                             frame=leaves + WALL_SEAT_START)
        face.location.y = inward * WALL_SEAT
        face.keyframe_insert(data_path="location", index=1,
                             frame=leaves + WALL_SLIDE)

        face.location.x = 0.0
        face.keyframe_insert(data_path="location", index=0, frame=leaves)
        face.location.x = travel
        face.keyframe_insert(data_path="location", index=0,
                             frame=leaves + WALL_SLIDE)
        face.location = (0.0, 0.0, 0.0)

        shape(face, "CUBIC", "EASE_IN_OUT")
        push(face, track, WALL_START, WALL_END)

        blocks.append(face)
        made.extend((face, glow, core, back_glow, back_face))

    return made, blocks


# ------------------------------------------------------------------ podiums
def build_podium(static, runtime, mats, key, side):
    """
    A cast block with a light channel near its top and a stone slab on it.

    Three stacked tapers rather than one box. The taper is barely a degree, far
    too little to read as a shape and just enough to stop the silhouette from
    being a rectangle, which is what separates a podium from a crate.
    """
    x = side * PODIUM_X
    made = []
    centre = (x, PODIUM_Y)

    foot = box(f"podium_{key}_foot", static,
               centre=(x, PODIUM_Y, 0.025), size=(0.86, 0.86, 0.05))
    bevel(foot, 0.004)
    assign(foot, mats["Concrete_Podium"])

    lower = taper(f"podium_{key}_lower", static, centre, 0.05, 0.858, 1.02, 0.955)
    bevel(lower, 0.005)
    assign(lower, mats["Concrete_Podium"])

    # The channel. Recessed 27 mm behind the body above and below it, so the
    # light has somewhere to sit instead of being a painted stripe.
    channel = box(f"podium_{key}_channel", static,
                  centre=(x, PODIUM_Y, 0.884), size=(0.90, 0.90, 0.052))
    assign(channel, mats["Exhibit_Glow"])

    upper = taper(f"podium_{key}_upper", static, centre, 0.91, 1.03, 0.948, 0.94)
    bevel(upper, 0.005)
    assign(upper, mats["Concrete_Podium"])

    slab = box(f"podium_{key}_slab", static,
               centre=(x, PODIUM_Y, EX["podiumHeight"] - 0.025),
               size=(1.06, 1.06, 0.05))
    bevel(slab, 0.004)
    assign(slab, bpy.data.materials.get("Marble_Dark") or mats["Concrete_Podium"])

    made.extend((foot, lower, channel, upper, slab))

    # ---- The lectern: a concrete fin with a tilted head on it, and a lit
    #      plate floating a finger above the head for the frontend to draw on.
    fin = box(f"lectern_{key}_fin", static,
              centre=(x, LECTERN_Y, EX["lecternHeight"] / 2.0),
              size=(0.76, 0.20, EX["lecternHeight"]))
    bevel(fin, 0.004)
    assign(fin, mats["Concrete_Podium"])

    head = box(f"lectern_{key}_head", static, centre=(0.0, 0.0, 0.0),
               size=(0.84, 0.50, 0.08))
    bevel(head, 0.005)
    transform(head, rotate_x=-TILT,
              translate=(x, LECTERN_Y, EX["lecternHeight"] + 0.02))
    assign(head, mats["Concrete_Podium"])

    made.extend((fin, head))

    # The plate is a single quad. It is modelled flat, given its 0..1 UVs while
    # it still has an axis to measure them along, and only then tilted.
    w, h = EX["plateWidth"] / 2.0, EX["plateHeight"] / 2.0
    plate = mesh_object(f"display_{key}", runtime,
                        [(-w, -h, 0.0), (w, -h, 0.0), (w, h, 0.0), (-w, h, 0.0)],
                        [(0, 1, 2, 3)])
    plate_uv(plate)
    lift = 0.055
    transform(plate, rotate_x=-TILT,
              translate=(x, LECTERN_Y + lift * math.sin(TILT),
                         EX["lecternHeight"] + 0.02 + lift * math.cos(TILT)))
    assign(plate, mats["Display_Plate"])
    made.append(plate)

    return made


# --------------------------------------------------------------- sculptures
#
# Both exhibits are systems, and that is the whole idea. Technical Art gets a
# physical one: a world with six bodies in orbit around it. Anwendungs-
# entwicklung gets a logical one: a net of nodes with signal running between
# them. Six objects each, one per skill on that founder's plate, and every one
# can be aimed at — the crosshair puts the skill's name in the air beside it.
#
# Which means these are not decoration. The list on the lectern and the objects
# above the podium are the same six facts, indexed the same way, so an edit in
# lib/site.ts moves both.


def uv_sphere(name, collection, radius, segments=32, rings=16):
    """
    A sphere with an honest equirectangular unwrap.

    Not an icosphere, and the reason is the texture. These are painted in the
    browser from a canvas drawn as a world map, which needs u to run once round
    the equator and v to run pole to pole. An icosphere has no such parameter
    and no seam, so a map on one arrives smeared across a band of triangles.

    Built with the seam column duplicated, because a sphere that shares its
    first and last column has one vertex trying to hold u = 0 and u = 1 at the
    same time — which the interpolator resolves by running the whole texture
    backwards across that one strip.
    """
    verts, faces, uvs = [], [], []
    for ring in range(rings + 1):
        v = ring / rings
        polar = v * math.pi
        z = math.cos(polar) * radius
        r = math.sin(polar) * radius
        for seg in range(segments + 1):
            u = seg / segments
            a = u * 2.0 * math.pi
            verts.append((math.cos(a) * r, math.sin(a) * r, z))
            uvs.append((u, 1.0 - v))

    stride = segments + 1
    for ring in range(rings):
        for seg in range(segments):
            a = ring * stride + seg
            b = a + stride
            if ring == 0:
                faces.append((a, b, b + 1))
            elif ring == rings - 1:
                faces.append((a, b, a + 1))
            else:
                faces.append((a, b, b + 1, a + 1))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def rod(name, collection, start, end, radius, segments=6):
    """A thin cylinder between two points. The edges of the net are these."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    length = axis.length
    if length < 1e-6:
        return None
    quat = axis.to_track_quat("Z", "Y")
    verts, faces = [], []
    for step in (0.0, length):
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            local = Vector((math.cos(angle) * radius, math.sin(angle) * radius, step))
            verts.append(tuple(a + quat @ local))
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, j + segments, i + segments))
    return mesh_object(name, collection, verts, faces, smooth=True)


# How many bodies each system carries. Six, because that is how many skills fit
# on a lectern plate — see displayTexture.ts, which cuts the list at six.
SKILL_COUNT = 6

# One orbit per skill: radius, body radius, the two tilts that put its plane at
# an angle, and how many whole turns it takes in the twenty second clip.
#
# Three things are being balanced here, and the first version got all three
# wrong. The radii are close together (0.44 to 0.64 against a world of 0.30) so
# the system reads as one object rather than as a planet with debris flung a
# long way out. The tilts are real and no two are alike, because six coplanar
# orbits all pass through the same two points behind the world — which, seen
# from the floor, looks like the bodies are diving into it. And the turn counts
# fall with distance, which is the one thing about orbits everybody reads by
# eye without being able to say why.
#
# Closest approach is 0.44 minus 0.075, which leaves 65 mm between the largest
# body and the world's surface at the tightest point of the tightest orbit.
PLANETS = (
    (0.44, 0.048, 0.34, 0.12, 3),
    (0.52, 0.075, -0.22, -0.30, 2),
    (0.60, 0.040, 0.46, 0.26, 2),
    (0.47, 0.062, -0.38, 0.18, 3),
    (0.64, 0.054, 0.18, -0.44, 1),
    (0.56, 0.034, -0.52, 0.08, 2),
)

# How far a body rises and falls over one loop. Small: this is a body breathing
# on its orbit, not a lift.
PLANET_DRIFT = 0.055


def build_art_sculpture(runtime, mats, x):
    """
    Technical Art: a world, and six bodies going round it.

    The discipline is a system with a centre of gravity — a renderer, with
    shaders and effects and pipelines in orbit around it — so that is what this
    is, literally. The world is painted in the browser from a canvas map, which
    is why it is a UV sphere and not an icosphere.

    The cage that used to sit here is gone, and so are the three rings that
    briefly replaced it. Both read as structure around the planet, and the
    planet is the thing worth looking at: what tells the eye this is a system
    is six bodies on six different inclinations, not scaffolding drawn round
    them.
    """
    centre = Vector((x, PODIUM_Y, EX["podiumHeight"] + EX["hoverHeight"]))
    made = []

    world = uv_sphere("planet_world", runtime, 0.30, segments=48, rings=24)
    world.location = centre
    world.rotation_euler = (0.41, 0.0, 0.0)   # axial tilt, as a planet has
    assign(world, mats["Planet_Body"])
    new_action(world, "Idle_world")
    spin(world, 2, 1.0)
    shape(world, "LINEAR")
    push(world, "Idle", IDLE_START, IDLE_END)
    made.append(world)

    # No rings.
    #
    # There were three, on three inclinations, left over from the wireframe
    # cage this replaced — an armillary sphere, which is a handsome object and
    # the wrong one here. Six bodies on six inclined orbits already say
    # "system"; three more rings sweeping through them at three more angles
    # only made it harder to follow any single one of them, and they kept
    # cutting across the map on the world.

    # The six bodies. Each is its own object with its origin at the world's
    # centre and its mesh pushed out to the orbit radius, so a single rotation
    # keyframe carries it round — and the body turns with it, which is what a
    # tidally locked moon does anyway.
    for index, (orbit, size, tilt_x, tilt_y, turns) in enumerate(PLANETS):
        planet = uv_sphere(f"skill_art_{index + 1}", runtime, size,
                           segments=24, rings=12)
        planet.data.transform(Matrix.Translation(Vector((orbit, 0.0, 0.0))))
        planet.data.update()
        planet.location = centre

        # ZYX, and the whole inclination depends on it.
        #
        # Blender's default XYZ applies the X rotation first and the animated Z
        # last, so a tilt set on X is undone by the spin that follows it: the
        # body is carried round the flat XY plane and the tilt never reaches
        # the orbit at all. Six planets came out exactly coplanar and passed
        # through the same two points behind the world.
        #
        # ZYX reverses that. The spin runs first, in the flat plane, and the
        # two tilts are applied to the result — which tips the plane the body
        # is already travelling in, which is what an inclination is.
        planet.rotation_mode = "ZYX"
        planet.rotation_euler = (tilt_x, tilt_y,
                                 index * 2.0 * math.pi / SKILL_COUNT)
        assign(planet, mats["Planet_Body"])

        new_action(planet, f"Idle_planet_{index + 1}")
        spin(planet, 2, turns, phase=index * 2.0 * math.pi / SKILL_COUNT)
        drift(planet, PLANET_DRIFT, phase=index / SKILL_COUNT)
        shape(planet, "BEZIER")
        for curve in action_curves(planet.animation_data.action):
            if curve.data_path == "rotation_euler":
                for point in curve.keyframe_points:
                    point.interpolation = "LINEAR"
                curve.update()
        push(planet, "Idle", IDLE_START, IDLE_END)
        made.append(planet)

    return made


# The net: how many nodes on each layer, at what height, at what radius. The
# middle layer is the wide one and carries the six skills.
NET_LAYERS = (
    (4, -0.30, 0.30),
    (SKILL_COUNT, 0.0, 0.42),
    (3, 0.30, 0.24),
)

# How far the whole net rises and falls over one loop. The frame and the six
# skill nodes share it exactly, so the net breathes without coming apart.
NET_DRIFT = 0.042


def build_dev_sculpture(runtime, mats, x):
    """
    Anwendungsentwicklung: a net with signal in it.

    This replaced a stack of rotating slabs. The stack was a diagram of layers,
    which is accurate and completely inert: three rectangles turning at three
    rates, saying nothing a slide could not. Software is not the layers, it is
    what runs between them, and the shape that says so is a network — nodes,
    edges, and the fact that a change at one end arrives at the other.

    Thirteen nodes on three layers, every node wired to its two nearest
    neighbours on the layer above. The six in the middle are the skills and are
    separate objects, because each one can be aimed at; the edges and the small
    nodes are one mesh that turns with them.
    """
    centre = Vector((x, PODIUM_Y, EX["podiumHeight"] + EX["hoverHeight"]))
    made = []

    layers = []
    for count, height, radius in NET_LAYERS:
        layers.append([
            Vector((math.cos(2.0 * math.pi * i / count) * radius,
                    math.sin(2.0 * math.pi * i / count) * radius,
                    height))
            for i in range(count)
        ])

    # ---- The frame: the edges, and the nodes that are not skills.
    parts = []
    for lower, upper in zip(layers, layers[1:]):
        for a_index, a in enumerate(lower):
            nearest = sorted(range(len(upper)),
                             key=lambda i, point=a: (upper[i] - point).length)[:2]
            for b_index in nearest:
                edge = rod(f"_edge_{a_index}_{b_index}", runtime, a,
                           upper[b_index], 0.0035)
                if edge is not None:
                    parts.append(edge)

    for height_index, nodes in ((0, layers[0]), (2, layers[2])):
        for node_index, point in enumerate(nodes):
            blob = uv_sphere(f"_node_{height_index}_{node_index}", runtime, 0.026,
                             segments=14, rings=7)
            blob.data.transform(Matrix.Translation(point))
            blob.data.update()
            parts.append(blob)

    frame = mesh_object("net_frame", runtime, [], [])
    bm = bmesh.new()
    for part in parts:
        bm.from_mesh(part.data)
        data = part.data
        bpy.data.objects.remove(part, do_unlink=True)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    bm.to_mesh(frame.data)
    bm.free()
    frame.data.update()
    frame.location = centre
    assign(frame, mats["Exhibit_Edge"])
    new_action(frame, "Idle_net")
    spin(frame, 2, 1.0)
    drift(frame, NET_DRIFT)
    shape(frame, "BEZIER")
    for curve in action_curves(frame.animation_data.action):
        if curve.data_path == "rotation_euler":
            for point_key in curve.keyframe_points:
                point_key.interpolation = "LINEAR"
            curve.update()
    push(frame, "Idle", IDLE_START, IDLE_END)
    made.append(frame)

    # ---- Signal.
    #
    #      The net turned and that was all it did, which on a podium next to a
    #      planetary system reads as the still one. A network is not its nodes
    #      anyway — it is what passes between them — so six lights run the
    #      edges, three times each over the loop.
    #
    #      They are children of the frame. That is what keeps them on their
    #      edge while the whole thing rotates: the rotation is the parent's,
    #      the journey is the child's, and neither has to know about the other.
    runs = [
        (layers[0][0], layers[1][0]),
        (layers[0][1], layers[1][2]),
        (layers[0][2], layers[1][3]),
        (layers[1][1], layers[2][0]),
        (layers[1][4], layers[2][1]),
        (layers[1][5], layers[2][2]),
    ]
    for index, (a, b) in enumerate(runs):
        # Half the size of a skill node, which is the most it can be without
        # being mistaken for one arriving.
        spark = uv_sphere(f"net_pulse_{index + 1}", runtime, 0.027,
                          segments=12, rings=6)
        spark.parent = frame
        spark.matrix_parent_inverse = frame.matrix_world.inverted()
        assign(spark, mats["Sculpt_Glow"])
        new_action(spark, f"Idle_pulse_{index + 1}")
        # Staggered by rate, not by start time.
        #
        # Shifting the start was the obvious way and the wrong one: the strip
        # is exactly the length of the loop, so an action that begins late runs
        # off the end of it and the pulse is caught mid-flight at the seam. A
        # different number of runs per edge fills the same span exactly, drifts
        # in and out of step with its neighbours on its own, and lands back at
        # zero scale every time. Three, four and five all divide the clip.
        travel(spark, a, b, 3 + index % 3)
        shape(spark, "LINEAR")
        push(spark, "Idle", IDLE_START, IDLE_END)
        made.append(spark)

    # ---- The six skill nodes. Separate objects on the same rotation and the
    #      same drift, so they ride the frame exactly while staying
    #      individually aimable.
    for index, point in enumerate(layers[1]):
        node = uv_sphere(f"skill_dev_{index + 1}", runtime, 0.055,
                         segments=22, rings=11)
        node.data.transform(Matrix.Translation(point))
        node.data.update()
        node.location = centre
        assign(node, mats["Sculpt_Glow"])
        new_action(node, f"Idle_node_{index + 1}")
        spin(node, 2, 1.0)
        drift(node, NET_DRIFT)
        shape(node, "BEZIER")
        for curve in action_curves(node.animation_data.action):
            if curve.data_path == "rotation_euler":
                for point_key in curve.keyframe_points:
                    point_key.interpolation = "LINEAR"
                curve.update()
        push(node, "Idle", IDLE_START, IDLE_END)
        made.append(node)

    return made


# ------------------------------------------------------------------ lighting
LIGHT_COLLECTION = "30_Lighting"

# The end bay had none of its own.
#
# Every fixture in 04_lighting is aimed at something that hangs on a side wall,
# and the last five metres of the hall hang nothing — so the wall the visitor
# walks towards for forty metres was the darkest surface in the room. Fine while
# it was a flat backdrop with a door drawn on it. Not fine now that it is the
# thing the whole walk ends at.
#
# Two jobs: put a museum spot over each sculpture, and lift the bay off black.
# The wall itself is washed at runtime, for the reason set out in
# build_lighting(). Nothing here tries to make the end bright. It is supposed to
# be the darkest part of the hall — just not an absence.
SPOT_WATTS = 620.0
FILL_WATTS = 430.0


def light(name, kind, collection, location, rotation, energy, colour, **settings):
    data = bpy.data.lights.new(name, type=kind)
    data.energy = energy
    data.color = colour[:3]
    for key, value in settings.items():
        setattr(data, key, value)
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = rotation
    collection.objects.link(obj)
    return obj


def aim_at(obj, target):
    """Point a light at a place. Lights emit down their local -z."""
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def build_lighting():
    collection = get_collection(LIGHT_COLLECTION)
    made = []

    # ---- No grazing wash here, and that is a decision rather than an
    #      omission.
    #
    #      A baked light on this wall cannot reach the six blocks filling its
    #      opening: they move, so they carry no lightmap, and anything traced
    #      into the wall around them lands on them as an outline. Two sources
    #      washing the same wall, one of which only lights five sixths of it,
    #      is exactly the seam the design exists to hide.
    #
    #      So the wash lives in the frontend instead, where one spotlight
    #      treats the wall and the blocks identically — see HiddenWall in
    #      WalkableRoom.tsx. What stays baked here is the fill, which is broad
    #      and soft and lands mostly on the floor and the podiums.

    # ---- One spot per podium, from the nave ceiling, aimed at the sculpture.
    #      Tight and a little cold: a museum spot, not room lighting.
    for key, side, _label in SIDES:
        spot = light(f"Exhibit_Spot_{key}", "SPOT", collection,
                     location=(side * PODIUM_X, PODIUM_Y + 0.9, 6.4),
                     rotation=(0.0, 0.0, 0.0),
                     energy=SPOT_WATTS, colour=srgb("#dbe7f0"),
                     spot_size=math.radians(34.0), spot_blend=0.55,
                     shadow_soft_size=0.12)
        aim_at(spot, (side * PODIUM_X, PODIUM_Y, EX["podiumHeight"] + 0.3))
        made.append(spot)

    # ---- Fill. One soft source high in the bay so the floor and the podium
    #      sides are not pure black between the spots.
    fill = light("Exhibit_Fill", "AREA", collection,
                 location=(0.0, FACE_Y + 3.6, 5.6), rotation=(0.0, 0.0, 0.0),
                 energy=FILL_WATTS, colour=srgb("#9fb4c6"),
                 shape="RECTANGLE", size=9.0, size_y=3.0)
    aim_at(fill, (0.0, FACE_Y + 1.6, 1.0))
    made.append(fill)

    return made


# ----------------------------------------------------------------------- run
def build():
    static = get_collection(STATIC_COLLECTION)
    runtime = get_collection(RUNTIME_COLLECTION)
    clear_collection(STATIC_COLLECTION)
    clear_collection(RUNTIME_COLLECTION)

    # Actions from an earlier run would otherwise pile up as .001, .002 and the
    # exporter would find six tracks called HiddenWall with nothing on them.
    for action in list(bpy.data.actions):
        if action.users == 0:
            bpy.data.actions.remove(action)

    mats = build_materials()

    # The two openings. Same wall, same mechanism, two clips — the far one is
    # scrubbed by how close the visitor is standing, the portal by how far the
    # arrival flight has got.
    wall_parts, blocks = build_block_wall(
        runtime, mats, prefix="hidden_block", track="HiddenWall",
        face_y=-HALF_D, inward=-1.0, alcove=True,
    )
    # The portal's reference face is the *outer* one, at the far side of the
    # wall's thickness, and it retracts towards the hall. The visitor arrives
    # from outside: build it the other way round and the arrival flight heads
    # straight at the backs of six blocks, and the slab pulls back by shoving
    # itself out into the approach.
    portal_parts, portal_blocks = build_block_wall(
        runtime, mats, prefix="portal_block", track="PortalWall",
        face_y=HALF_D + WALL, inward=-1.0, mirror=True,
    )
    wall_parts.extend(portal_parts)
    blocks.extend(portal_blocks)

    exhibits = []
    for key, side, _label in SIDES:
        exhibits.extend(build_podium(static, runtime, mats, key, side))
    exhibits.extend(build_art_sculpture(runtime, mats, +PODIUM_X))
    exhibits.extend(build_dev_sculpture(runtime, mats, -PODIUM_X))

    # 04_lighting owns the collection and rebuilds it from scratch, so these go
    # in after it and this script has to be re-run whenever that one is.
    for obj in list(get_collection(LIGHT_COLLECTION).objects):
        if obj.name.startswith("Exhibit_"):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(data, bpy.types.Light) and data.users == 0:
                bpy.data.lights.remove(data)
    lights = build_lighting()

    scene = bpy.context.scene
    scene.frame_start = IDLE_START
    scene.frame_end = IDLE_END
    scene.render.fps = FPS
    scene.frame_set(IDLE_START)
    bpy.context.view_layer.update()

    return {
        "static": len(static.objects),
        "runtime": len(runtime.objects),
        "blocks": len(blocks),
        "wall_parts": len(wall_parts),
        "exhibits": len(exhibits),
        "lights": len(lights),
    }


if __name__ == "__main__":
    made = build()
    faces = sum(len(o.data.polygons)
                for name in (STATIC_COLLECTION, RUNTIME_COLLECTION)
                for o in bpy.data.collections[name].objects if o.type == "MESH")
    print(f"Exponate gebaut: {made['static']} statisch, "
          f"{made['runtime']} laufzeitgesteuert, {faces} Faces")
    print(f"  Zwei Blockwaende: {made['blocks']} Bloecke, "
          f"Clips HiddenWall und PortalWall {WALL_START}..{WALL_END}")
    print(f"  Idle-Clip {IDLE_START}..{IDLE_END} bei {FPS} fps")
    print(f"  {made['lights']} zusaetzliche Leuchten im Stirnjoch")
