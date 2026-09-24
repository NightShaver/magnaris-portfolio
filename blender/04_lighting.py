# =============================================================================
# 03 — LIGHTING
#
# A dark hall is not a lit hall turned down. It is a hall where only a few
# things are lit, and everything else falls away. Three sources, in order of
# how much work they do:
#
#   1. One spot per picture. The pictures are the brightest surfaces in the
#      room by a wide margin — that is what makes it a gallery.
#   2. A cove above the arcade, washing the nave ceiling. It gives the nave a
#      volume without putting a single visible fixture in the view.
#   3. Two accents, petrol at one end wall and violet at the other. The brand's
#      two colours, used exactly once each, at the two poles of the hall.
#
# There is deliberately no ambient and no environment light. In a hall this
# dark the fill comes from the floor bouncing the spots, which is why the
# marble is polished and why the bake has to be done in Cycles.
#
# Run from Blender, after 01 and 02:
#     exec(open(r"<repo>/blender/04_lighting.py").read())
# =============================================================================

import bpy
import sys
import pathlib
import importlib
from math import atan2, degrees, radians, hypot

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

COLLECTION = "30_Lighting"

# --- Sources -----------------------------------------------------------------
# Picture light: a wall washer, not a spot.
#
# The first version used one 38-degree spot per picture. At 2.6 m throw that
# lights a pool about 1.8 m across, on a picture 5.14 m wide — a bright ellipse
# in the middle of the work and dark corners, which is exactly the mistake that
# makes a render look like a render. Galleries wash large works with a linear
# source running parallel to the wall.
# Geometry comes from the layout module, because the frontend hangs the
# housings from the same numbers. Only the power and the colour live here:
# those are properties of the lamp, not of the building.
WASH_POWER = 230.0       # watts
WASH_COLOUR = (1.0, 0.94, 0.86)   # ~4000 K, a shade warm against the cold stone

# Cove: hidden in the slot above the arcade, facing up and inward. Cool, and
# dim enough that it never competes with the pictures.
COVE_POWER = 210.0

COVE_SEGMENTS = 9
COVE_COLOUR = (0.86, 0.91, 1.0)

# Accents. These are the only coloured light in the hall.
ACCENT_POWER = 90.0
PETROL = (0.059, 0.557, 0.569)    # #0F8E91
VIOLET = (0.435, 0.388, 0.780)    # #6F63C7


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear(colour):
    return tuple(srgb_to_linear(c) for c in colour)


# ---------------------------------------------------------------- utilities
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
        if isinstance(data, bpy.types.Light) and data.users == 0:
            bpy.data.lights.remove(data)


def add_light(name, kind, collection, location, **props):
    data = bpy.data.lights.new(name, type=kind)
    for key, value in props.items():
        setattr(data, key, value)
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    collection.objects.link(obj)
    return obj


def aim(obj, target):
    """
    Point a light at a world-space target.

    Lights emit along their local -Z, same as cameras. Rather than pulling in
    mathutils quaternions, the two angles are worked out directly: how far to
    tip over, and which way to face.
    """
    ox, oy, oz = obj.location
    tx, ty, tz = target
    dx, dy, dz = tx - ox, ty - oy, tz - oz
    obj.rotation_euler = (
        atan2(hypot(dx, dy), -dz),    # tip away from straight down
        0.0,
        atan2(dy, dx) - radians(90),  # swing round to face the target
    )


# -------------------------------------------------------------------- build
def build():
    coll = get_collection(COLLECTION)
    clear_collection(COLLECTION)
    depth = L.ROOM["depth"]

    # ---- One wall washer per hanging slot, running along the hall so its
    #      long axis matches the long axis of the picture.
    for slot in L.SLOTS:
        x_wall, y_centre, z_depth = slot["position"]
        inward = -slot["side"]
        name = f"Wash_{slot['name'].replace('.', '_')}"

        wash = add_light(
            name, "AREA", coll,
            location=(x_wall + inward * L.WASH["setback"], z_depth, L.WASH_HEIGHT),
            energy=WASH_POWER,
            color=linear(WASH_COLOUR),
            shape="RECTANGLE",
            size=L.WASH_LENGTH,
            size_y=L.WASH["depth"],
        )
        aim(wash, (x_wall, z_depth, y_centre))

    # ---- Cove. Broken into segments so the light follows the hall instead of
    #      being one enormous emitter that bakes into a flat band.
    seg_len = depth / COVE_SEGMENTS
    for side in (-1, 1):
        for i in range(COVE_SEGMENTS):
            y = -depth / 2 + seg_len * (i + 0.5)
            cove = add_light(
                f"Cove_{'L' if side < 0 else 'R'}_{i + 1:02d}", "AREA", coll,
                location=(side * (L.NAVE_HALF_WIDTH - 0.40), y,
                          AISLE_H + S["coveHeight"] + 0.05),
                energy=COVE_POWER,
                color=linear(COVE_COLOUR),
                shape="RECTANGLE",
                size=seg_len * 0.94,
                size_y=0.18,
            )
            # Up and inward, at the ceiling rather than at the band.
            #
            # Re-aiming alone did nothing, and the reason was distance, not
            # direction: the lamp sat 20 cm from the clerestory, so by inverse
            # square that face got four hundred times the irradiance the
            # ceiling did no matter where it pointed. The band blew out to pure
            # white and the ceiling measured 0.0000 in the atlas.
            #
            # So the ledge got deeper and the lamp moved back onto it. From
            # 0.4 m it still grazes the band hard enough to make it the
            # brightest surface in the nave, and it finally reaches the ceiling.
            aim(cove, (side * (L.NAVE_HALF_WIDTH - 2.6), y, NAVE_H))

    # ---- Pier grazers. What makes a hall legible is lit vertical surface,
    #      not lit floor: a polished dark floor seen down its own length is a
    #      mirror of a dark ceiling and returns nothing. Washing the arcade
    #      makes the rhythm of the bays read, and gives the marble something
    #      worth reflecting.
    for i, z in enumerate(L.PILASTER_Z, start=1):
        for side in (-1, 1):
            grazer = add_light(
                f"Graze_{'L' if side < 0 else 'R'}_{i:02d}", "SPOT", coll,
                location=(side * (L.NAVE_HALF_WIDTH - 0.45), z, 0.12),
                energy=45.0,
                spot_size=radians(52.0),
                spot_blend=0.75,
                shadow_soft_size=0.12,
                color=linear((1.0, 0.95, 0.88)),
            )
            # Straight up the inner face of the pier.
            aim(grazer, (side * (L.NAVE_HALF_WIDTH + 0.02), z, AISLE_H))

    # ---- Nave downlights. The cove alone cannot carry the middle of the
    #      hall: it washes a ceiling with under one percent albedo, so almost
    #      nothing comes back down. These light the floor directly, and the
    #      polished marble does the rest.
    for i, y in enumerate(L.TRACK_ROD_Z, start=1):
        down = add_light(
            f"Nave_Down_{i:02d}", "SPOT", coll,
            location=(0.0, y, NAVE_H - 0.25),
            # 260 W was the floor's whole budget and it produced nothing.
            # Run the numbers: a 64-degree spot at 7.75 m spreads its power
            # over a pool ten metres across, about 4.5 W/m². The wall washers
            # sit 1.25 m off the wall and deliver forty times that, onto a
            # surface with three times the albedo. The floor was not broken,
            # it was a hundred times underlit — a black mass with the rest of
            # the hall reflected in it.
            energy=2400.0,
            # Tighter, so each one reads as a deliberate pool rather than an
            # even grey wash. That is what a gallery floor actually looks like
            # and what the plinth's own spot already did.
            spot_size=radians(52.0),
            spot_blend=0.75,
            shadow_soft_size=0.25,
            color=linear((1.0, 0.96, 0.91)),
        )
        aim(down, (0.0, y, 0.0))

    # ---- Accents. Petrol at the far end, violet at the entrance: the two
    #      brand colours, once each, at the two poles of the axis.
    for end, colour, label in ((-1, PETROL, "Petrol"), (1, VIOLET, "Violet")):
        accent = add_light(
            f"Accent_{label}", "AREA", coll,
            location=(0.0, end * (HALF_D - 1.1), NAVE_H - 1.2),
            energy=ACCENT_POWER,
            color=linear(colour),
            shape="RECTANGLE",
            size=L.ROOM["width"] * 0.55,
            size_y=0.5,
        )
        # Graze down the end wall rather than point at it: a wash reads as
        # architecture, a spot reads as a gel on a wall.
        aim(accent, (0.0, end * HALF_D, 1.2))

    return len(coll.objects)


def setup_world():
    """
    Near-black world. A dark hall with an environment light in it is a grey
    hall — every surface picks up a floor of ambient that no amount of
    contrast grading gets back out.
    """
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        # Not pure black. A hall with zero ambient has no bounce at all,
        # and every shadow goes to absolute zero, which reads as a hole
        # rather than as darkness.
        bg.inputs["Color"].default_value = (0.010, 0.012, 0.018, 1.0)
        bg.inputs["Strength"].default_value = 1.0


def setup_render(engine="BLENDER_EEVEE_NEXT"):
    """
    EEVEE for looking, Cycles for baking. Blender renamed the EEVEE identifier
    between versions, so fall back rather than assume.
    """
    scene = bpy.context.scene
    try:
        scene.render.engine = engine
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"

    scene.view_settings.view_transform = "AgX"   # holds highlights on the spots
    # Blender renames these looks between versions; take the first that exists
    # rather than hard-coding a string that breaks on the next release.
    looks = scene.view_settings.bl_rna.properties["look"].enum_items.keys()
    for candidate in ("AgX - Base Contrast", "AgX - Medium Contrast",
                      "AgX - Medium High Contrast", "None"):
        if candidate in looks:
            scene.view_settings.look = candidate
            break
    scene.render.film_transparent = False

    if scene.render.engine.startswith("BLENDER_EEVEE"):
        ee = scene.eevee
        for attr, value in (
            ("use_raytracing", True),
            ("use_shadows", True),
            ("use_volumetric_lights", False),
            ("taa_render_samples", 64),
        ):
            if hasattr(ee, attr):
                setattr(ee, attr, value)


if __name__ == "__main__":
    setup_world()
    count = build()
    setup_render()
    print(f"{count} Leuchten gesetzt")
    print(f"  {len(L.SLOTS)} Wandfluter, {COVE_SEGMENTS * 2} Voutensegmente, "
          f"{len(L.PILASTER_Z) * 2} Pfeilerfluter, {len(L.TRACK_ROD_Z)} Deckenstrahler, 2 Akzente")
    print(f"  Engine: {bpy.context.scene.render.engine}, View: {bpy.context.scene.view_settings.view_transform}")
