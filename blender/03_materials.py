# =============================================================================
# 02 — MATERIALS
#
# A dark marble Kunsthalle. Seven materials, no more: every extra material is
# another draw call in the browser and another surface to keep consistent.
#
# Run from Blender, after 01_shell.py:
#     exec(open(r"<repo>/blender/03_materials.py").read())
#
# Idempotent: materials are looked up by name and rebuilt in place, so slot
# assignments on existing objects survive a re-run.
#
# COLOUR. Everything sits in the Magnaris palette. Midnight Ink #111723 is the
# floor of the range; the surfaces step up from it in small increments. Petrol
# and Violet appear nowhere in here — they are light, not paint, and they enter
# in 04_lighting.py.
#
# The marble is scanned: Grey Cartago from Poly Haven (CC0), in
# blender/textures/. It arrives as a light grey stone and is tinted down here
# rather than swapped for a dark scan, because what procedural veining cannot
# fake is the roughness and normal detail — and those are used as delivered.
#
# If the texture files are missing (a fresh clone that has not fetched them)
# every marble material falls back to the procedural veining further down. The
# hall still builds and still bakes; it only loses the scanned surface detail.
# =============================================================================

import bpy

# --- Palette. Linear values; Blender's colour pickers are linear, sRGB hex is
#     not, so every hex is converted once here rather than eyeballed.
def srgb(hex_string, alpha=1.0):
    """#rrggbb -> linear RGBA, the space Blender's node inputs actually use."""
    hex_string = hex_string.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(hex_string[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


PALETTE = {
    "marble_dark": srgb("#0c1018"),   # the body of the stone
    "marble_vein": srgb("#8d98a6"),   # Steel Gray, the veining
    "marble_mid":  srgb("#151c28"),   # honed piers, a step up from the floor
    "wall_aisle":  srgb("#5c667a"),   # the picture wall: light enough to read against
    # The clerestory. In a basilica the bright element is the band above the
    # arcade, not the floor. This is the only light-valued surface in the hall
    # and everything below it reads against it.
    "clerestory":  srgb("#7d879c"),
    "ceiling":     srgb("#262e3c"),   # dark, but able to take the cove wash
    "reveal":      srgb("#0a0e15"),   # shadow gaps, darker than anything near them
    "blank":       srgb("#6b7486"),   # stand-in for a case plate
    # Multipliers applied to the scanned stone. Grey Cartago arrives light;
    # these pull it into the hall's range without flattening the veins.
    # Tints multiplied over the neutral marble. The map now carries 0.50
    # linear instead of 0.096, so both of these moved.
    #
    # The floor's is not simply five times darker to preserve the old value,
    # because the old value was a lie: the floor was almost black in diffuse
    # and got its entire appearance from reflecting an environment map of
    # panels that are not in the room. Once that was replaced by a probe of the
    # actual hall the floor went out, which is what it had been all along. So
    # it is graded to what dark polished stone actually is — about 0.05 linear,
    # a little darker than the picture wall — and the reflection sits on top of
    # a floor instead of standing in for one.
    #
    # The pier's is near white, because that is the only way to get white stone
    # out of a material that can only multiply.
    # White marble for the columns: a near-white field with grey veining. Both
    # are the finished appearance, not a tint — the procedural writes them
    # straight into the base colour.
    "column_base": srgb("#dfe3e9"),
    "column_vein": srgb("#7c8694"),
    # What the floor should look like, not what to multiply by: tint_for()
    # works the multiplier out from whatever the map happens to bring.
    "floor":       srgb("#18202c"),
    # --- Fittings.
    # The walnut arrives mid-brown and would be the warmest thing in the
    # hall by a wide margin. Pulled down and slightly desaturated, it
    # stays the one warm note in a cold room instead of a bright plank.
    #
    # Like every other entry here, this is the colour the surface should end
    # up, not the number to multiply the scan by — tint_for() works the
    # multiplier out. The bench and the planter were the two that went in
    # raw, so the walnut got multiplied by a mid-brown instead of graded to
    # one: about six per cent linear, with the grain crushed out of it. A
    # wooden bench that reads as grey concrete.
    "wood_tint":     srgb("#8a7a68"),
    "concrete_tint": srgb("#6a707c"),
    # Powder-coated steel: the bodies. Almost black, barely a highlight.
    "steel_dark":    srgb("#202733"),
    # Brushed steel: the bands, the posts, the finials. The only bright
    # metal in the hall, used where a hand would touch it.
    "steel_bright":  srgb("#98a3b2"),
    # The inside of a bin and the soil in a pot. Both are holes.
    "void":          srgb("#070a0f"),
    "foliage":       srgb("#3f5f4a"),
}


import os

TEXTURE_DIR = os.path.join(
    r"C:\Users\Felix\Desktop\DemoWebseiten\Portfolio\blender", "textures"
)

# Scanned surfaces, all Poly Haven and all CC0. Each set is three maps, and
# each material that uses one names the set plus the metres between repeats.
TEXTURE_SETS = {
    "stone": {
        # Re-graded by make_neutral_marble.py: the delivered scan is a dark
        # slab floor with terracotta courses in it, and this hall has no use
        # for either. Roughness and normal are the originals — a surface's
        # relief does not change when its exposure does.
        "diffuse": "marble_neutral_Diffuse.jpg",
        "rough": "grey_cartago_01_Rough.jpg",
        "normal": "grey_cartago_01_nor_gl.jpg",
    },
    "wood": {
        "diffuse": "american_walnut_veneer_Diffuse.jpg",
        "rough": "american_walnut_veneer_Rough.jpg",
        "normal": "american_walnut_veneer_nor_gl.jpg",
    },
    "concrete": {
        "diffuse": "concrete_floor_01_Diffuse.jpg",
        "rough": "concrete_floor_01_Rough.jpg",
        "normal": "concrete_floor_01_nor_gl.jpg",
    },
    "plaster": {
        "diffuse": "grey_plaster_Diffuse.jpg",
        "rough": "grey_plaster_Rough.jpg",
        "normal": "grey_plaster_nor_gl.jpg",
    },
}

# Kept for the export, which reads it to name the marble set.
STONE = TEXTURE_SETS["stone"]

# Metres between repeats, per material.
#
# One number, read twice: here it sets the mapping scale while the material is
# still driven by object coordinates, and 06_unwrap reads it again when it
# repoints the same material at a UV channel. They used to be two numbers that
# happened to agree.
TEXTURED = {
    "Marble_Dark": ("stone", 2.9),
    "Wood_Bench": ("wood", 0.85),
    "Concrete_Pot": ("concrete", 1.10),
    # The walls, the clerestory and the ceilings are all the same painted
    # plaster at different values. They were flat colours with no map at all,
    # which is fine on its own and wrong next to a textured floor: the wall
    # washer's gradient sat on nothing, and the untextured surfaces read as a
    # different render from the textured ones standing in front of them.
    "Wall_Aisle": ("plaster", 3.2),
    "Clerestory": ("plaster", 3.2),
    "Ceiling": ("plaster", 4.0),
}

# Just the tiling, which is all 06_unwrap needs when it repoints the mapping.
TILES = {name: tile for name, (_set, tile) in TEXTURED.items()}


def load_texture(filename, non_color=False):
    """Load an image from blender/textures, reusing the datablock. None if absent."""
    path = os.path.join(TEXTURE_DIR, filename)
    if not os.path.exists(path):
        return None
    img = bpy.data.images.get(filename)
    if img is None:
        img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return img


def have(set_name):
    """True when every map of a texture set is on disk.

    A fresh clone that has not fetched the textures still builds and still
    bakes; the marble falls back to procedural veining and the fittings fall
    back to flat colour. What it loses is surface detail, not the hall.
    """
    files = TEXTURE_SETS[set_name].values()
    return all(os.path.exists(os.path.join(TEXTURE_DIR, f)) for f in files)


def texture_mean(set_name):
    """
    The average linear luminance a texture set's diffuse map brings with it.

    Measured, not assumed. It is the number that decides every tint, and it
    changes the moment a texture is swapped — Grey Cartago sits at 0.096 and
    the plaster at roughly four times that, so a palette entry that looked
    right against one is nowhere near right against the other.
    """
    import numpy as np

    if not have(set_name):
        return 1.0
    cached = _TEXTURE_MEANS.get(set_name)
    if cached is not None:
        return cached

    path = os.path.join(TEXTURE_DIR, TEXTURE_SETS[set_name]["diffuse"])
    image = bpy.data.images.load(path, check_existing=False)
    try:
        image.colorspace_settings.name = "Non-Color"
        buf = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(buf)
        stored = buf.reshape(-1, 4)[:, :3]
        # Stored values are sRGB encoded; the shader works in linear.
        linear = np.where(stored <= 0.04045, stored / 12.92,
                          ((stored + 0.055) / 1.055) ** 2.4)
        mean = float((linear @ np.array([0.2126, 0.7152, 0.0722], "f4")).mean())
    finally:
        bpy.data.images.remove(image)

    _TEXTURE_MEANS[set_name] = mean
    return mean


_TEXTURE_MEANS = {}


def tint_for(target, set_name):
    """
    The multiply tint that lands a scanned surface on an intended colour.

    The palette says what a surface should look like; the map brings its own
    brightness; and the runtime material can only multiply the two. Solving
    that by hand is how the floor ended up five times too dark the first time
    the stone was regraded, so it is solved here instead.
    """
    mean = texture_mean(set_name)
    return tuple(min(1.0, c / max(mean, 1e-4)) for c in target[:3]) + (1.0,)


# ---------------------------------------------------------------- foundations
def fresh_material(name):
    """Return an empty node tree under `name`, reusing the datablock if it exists."""
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    return mat


def principled(mat, base_color, roughness, metallic=0.0, specular=0.5):
    """Standard output chain. Returns (nodes, bsdf) so callers can keep building."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    # Blender renamed this input; support both without guessing.
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = specular
            break

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return nodes, links, bsdf


def marble_veins(mat, nodes, links, bsdf, vein_colour, base_colour,
                 scale=0.7, sharpness=0.52, relief=0.12):
    """
    Nero-Marquina style veining: a wave texture pushed out of shape by noise,
    then clipped hard so the veins read as cracks rather than as clouds.

    Object coordinates, not UV. A 40 m hall unwrapped for a lightmap has seams
    all over it; veining driven by UVs would jump at every one of them. Object
    space runs straight through the geometry.
    """
    coord = nodes.new("ShaderNodeTexCoord")
    coord.location = (-1200, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-1000, 0)
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    # Large-scale distortion: this is what stops the veins reading as stripes.
    warp = nodes.new("ShaderNodeTexNoise")
    warp.location = (-800, -200)
    warp.inputs["Scale"].default_value = 1.6
    warp.inputs["Detail"].default_value = 6.0
    warp.inputs["Roughness"].default_value = 0.55
    links.new(mapping.outputs["Vector"], warp.inputs["Vector"])

    displace = nodes.new("ShaderNodeVectorMath")
    displace.location = (-620, -80)
    displace.operation = "ADD"
    links.new(mapping.outputs["Vector"], displace.inputs[0])
    links.new(warp.outputs["Color"], displace.inputs[1])

    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-440, 0)
    wave.wave_type = "BANDS"
    wave.bands_direction = "DIAGONAL"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 0.9
    wave.inputs["Distortion"].default_value = 12.0
    wave.inputs["Detail"].default_value = 4.0
    wave.inputs["Detail Scale"].default_value = 2.0
    links.new(displace.outputs["Vector"], wave.inputs["Vector"])

    # Hard clip. A soft ramp gives marbled plastic; marble veins have an edge.
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-240, 0)
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = sharpness
    ramp.color_ramp.elements[1].position = min(1.0, sharpness + 0.10)
    links.new(wave.outputs["Color"], ramp.inputs["Fac"])

    mix = nodes.new("ShaderNodeMix")
    mix.location = (40, 60)
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = base_colour
    mix.inputs["B"].default_value = vein_colour
    links.new(ramp.outputs["Color"], mix.inputs["Factor"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

    # The veins sit very slightly proud — polished marble is not perfectly flat
    # where a harder mineral runs through it.
    bump = nodes.new("ShaderNodeBump")
    bump.location = (40, -220)
    bump.inputs["Strength"].default_value = relief
    bump.inputs["Distance"].default_value = 0.002
    links.new(ramp.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mix


def scanned(mat, nodes, links, bsdf, set_name, tint, tile,
            rough_min, rough_max, normal_strength=0.6):
    """
    A scanned PBR set, tinted into the hall's value range.

    Written for the marble and then used unchanged for the walnut on the
    benches and the cast concrete of the planters, because the job is the same
    every time: three maps in, a tint over the diffuse, the scanned roughness
    remapped into the range this surface actually has, and the normal at
    whatever strength the relief wants.

    Coordinates are Object, not UV. The boxes carry no UV layer yet — the
    lightmap unwrap comes later and gets a channel of its own — and world
    aligned stone is what a stone floor actually is: slabs laid to the building
    grid, not to a texture atlas.

    The scanned roughness is a honed finish around 0.4. It is remapped into a
    polished range rather than replaced, so the variation in the scan survives
    while the surface reads as polished.
    """
    coord = nodes.new("ShaderNodeTexCoord")
    coord.location = (-1100, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-920, 0)
    # Metres per repeat, as a scale on object coordinates.
    mapping.inputs["Scale"].default_value = (1.0 / tile,) * 3
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def image_node(key, y, non_color):
        node = nodes.new("ShaderNodeTexImage")
        node.location = (-700, y)
        node.image = load_texture(TEXTURE_SETS[set_name][key],
                                  non_color=non_color)
        node.extension = "REPEAT"
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    diffuse = image_node("diffuse", 240, False)
    rough = image_node("rough", -40, True)
    normal = image_node("normal", -320, True)

    # Tint: multiply the light scan down towards Midnight Ink, then pull the
    # contrast back so the veins do not vanish along with the value.
    # Contrast first, tint second — and that order is not cosmetic.
    #
    # Brightness/Contrast computes (x - 0.5) * (1 + contrast) + 0.5. Run after
    # the tint, the floor's colour arrives at about 0.009 and comes out at
    # -0.099, which clamps to pure black. A black albedo is not just a dark
    # floor: with use_pass_color off, Cycles bakes light *divided by* albedo,
    # and divides by zero to zero. The floor and both ceilings measured exactly
    # 0.0000 in the lightmap for that reason and no other — while every
    # light-tinted surface in the same bake came out fine.
    #
    # Applied to the texture instead, the input sits around 0.5 where the
    # curve is meant to work, and the tint then takes the result down to the
    # value the palette asks for.
    contrast = nodes.new("ShaderNodeBrightContrast")
    contrast.location = (-420, 260)
    contrast.inputs["Contrast"].default_value = 0.22
    links.new(diffuse.outputs["Color"], contrast.inputs["Color"])

    mix = nodes.new("ShaderNodeMix")
    mix.location = (-200, 260)
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = tint
    links.new(contrast.outputs["Color"], mix.inputs["A"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

    remap = nodes.new("ShaderNodeMapRange")
    remap.location = (-420, -40)
    remap.inputs["From Min"].default_value = 0.0
    remap.inputs["From Max"].default_value = 1.0
    remap.inputs["To Min"].default_value = rough_min
    remap.inputs["To Max"].default_value = rough_max
    links.new(rough.outputs["Color"], remap.inputs["Value"])
    links.new(remap.outputs["Result"], bsdf.inputs["Roughness"])

    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.location = (-420, -320)
    nmap.inputs["Strength"].default_value = normal_strength
    links.new(normal.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])


# ----------------------------------------------------------------- materials
def build_materials():
    made = {}

    # Floor: polished dark marble. The one glossy surface in the hall, and the
    # reason the room reads as a Kunsthalle rather than a corridor.
    mat = fresh_material("Marble_Dark")
    nodes, links, bsdf = principled(mat, PALETTE["marble_dark"], roughness=0.10)
    if have("stone"):
        scanned(mat, nodes, links, bsdf, "stone",
                tint_for(PALETTE["floor"], "stone"),
                tile=TILES["Marble_Dark"], rough_min=0.10, rough_max=0.30,
                normal_strength=0.45)
    else:
        marble_veins(mat, nodes, links, bsdf,
                     PALETTE["marble_vein"], PALETTE["marble_dark"],
                     scale=0.42, sharpness=0.54, relief=0.10)
    made["Marble_Dark"] = mat

    # The columns. White marble, and the one material in the hall that is not a
    # scan.
    #
    # A scanned slab floor wrapped around a shaft is a tiled column, joints and
    # all, and no tiling factor makes that go away. The procedural veining
    # below runs through object space instead: it has no joints, no repeat and
    # no seam, and because every column stands somewhere else in the same 3D
    # field, every column is veined differently — which is what a row of
    # marble columns actually looks like.
    #
    # It never reaches the browser as a shader. The arcade is baked to its own
    # albedo atlas in 07_bake, at a texel density no tiling texture could
    # match at this distance, and what ships is that image.
    mat = fresh_material("Marble_Column")
    nodes, links, bsdf = principled(mat, PALETTE["column_base"], roughness=0.16)
    # Scale is metres per feature, inverted: at 0.55 the veins came out as
    # metre-wide clouds wrapped round a 0.75 m shaft, which reads as camouflage
    # rather than as stone. Marble veins at this distance are a hand's width.
    marble_veins(mat, nodes, links, bsdf,
                 PALETTE["column_vein"], PALETTE["column_base"],
                 scale=4.6, sharpness=0.68, relief=0.04)
    made["Marble_Column"] = mat

    # The picture wall, the nave, the clerestory and the ceilings: one painted
    # plaster at four values. No pattern — anything with a pattern on it
    # competes with the work hanging on it — but a surface, so the wall
    # washer's gradient has something to lie on.
    # Wall_Nave is gone. The end walls used to be a darker value of the same
    # plaster so the volume beyond the arcade would recede, and the effect in
    # the room was a dark void with the violet accent mottling across it. They
    # take the picture wall's material now: same plaster, same value, one wall
    # running all the way round.
    for name, tint, tile, rough in (
        ("Wall_Aisle", "wall_aisle", 3.2, (0.80, 0.94)),
        ("Clerestory", "clerestory", 3.2, (0.88, 0.98)),
        ("Ceiling", "ceiling", 4.0, (0.90, 1.00)),
    ):
        mat = fresh_material(name)
        nodes, links, bsdf = principled(mat, PALETTE[tint], roughness=rough[1],
                                        specular=0.25)
        if have("plaster"):
            scanned(mat, nodes, links, bsdf, "plaster",
                    tint_for(PALETTE[tint], "plaster"), tile=tile,
                    rough_min=rough[0], rough_max=rough[1],
                    normal_strength=0.35)
        made[name] = mat

    # Shadow gaps. Darker than whatever sits next to them, otherwise the reveal
    # stops reading as a gap and starts reading as a stripe.
    made["Reveal"] = fresh_material("Reveal")
    principled(made["Reveal"], PALETTE["reveal"], roughness=1.0, specular=0.1)

    # Stand-in for a case plate, replaced by the frontend at runtime.
    made["Blank_Plate"] = fresh_material("Blank_Plate")
    principled(made["Blank_Plate"], PALETTE["blank"], roughness=0.6, specular=0.4)

    # ---- Fittings ---------------------------------------------------------
    # The bench tops. Walnut is the one warm material in the building, and it
    # is on the one thing a visitor actually touches.
    mat = fresh_material("Wood_Bench")
    nodes, links, bsdf = principled(mat, PALETTE["wood_tint"], roughness=0.42)
    if have("wood"):
        scanned(mat, nodes, links, bsdf, "wood",
                tint_for(PALETTE["wood_tint"], "wood"),
                tile=TILES["Wood_Bench"], rough_min=0.30, rough_max=0.52,
                normal_strength=0.55)
    made["Wood_Bench"] = mat

    # Cast concrete for the planters: fine, matte, close in value to the piers
    # so a pot reads as part of the building rather than as an object in it.
    mat = fresh_material("Concrete_Pot")
    nodes, links, bsdf = principled(mat, PALETTE["concrete_tint"], roughness=0.78)
    if have("concrete"):
        scanned(mat, nodes, links, bsdf, "concrete",
                tint_for(PALETTE["concrete_tint"], "concrete"),
                tile=TILES["Concrete_Pot"], rough_min=0.62, rough_max=0.88,
                normal_strength=0.5)
    made["Concrete_Pot"] = mat

    # Powder-coated steel: bench legs, bin bodies. Dark, barely a highlight.
    made["Steel_Dark"] = fresh_material("Steel_Dark")
    principled(made["Steel_Dark"], PALETTE["steel_dark"],
               roughness=0.42, metallic=0.65)

    # Brushed steel: the band at a bin's mouth, the barrier posts and finials.
    # The only bright metal in the hall, and it is on what a hand touches.
    made["Steel_Bright"] = fresh_material("Steel_Bright")
    principled(made["Steel_Bright"], PALETTE["steel_bright"],
               roughness=0.26, metallic=0.9)

    # The inside of a bin, the soil in a pot. Both are holes: matte, and
    # darker than anything around them, or they stop reading as openings.
    made["Void"] = fresh_material("Void")
    principled(made["Void"], PALETTE["void"], roughness=1.0, specular=0.05)

    made["Foliage"] = fresh_material("Foliage")
    principled(made["Foliage"], PALETTE["foliage"], roughness=0.62, specular=0.35)

    # The rope is the one place violet touches something a visitor stands next
    # to. Matte cord, no sheen — a shiny rope reads as plastic.
    made["Rope"] = fresh_material("Rope")
    principled(made["Rope"], srgb("#6F63C7"), roughness=0.92, specular=0.2)

    return made


# ------------------------------------------------------------------ assignment
# Which material each object gets, matched on the name prefix 01_shell.py used.
ASSIGNMENT = (
    ("Floor", "Marble_Dark"),
    ("Column_", "Marble_Column"),
    ("Abacus_", "Marble_Column"),
    ("Wall_L", "Wall_Aisle"),
    ("Wall_R", "Wall_Aisle"),
    ("Wall_Front", "Wall_Aisle"),
    ("Wall_Back", "Wall_Aisle"),
    ("Spandrel", "Clerestory"),
    ("Ceiling_Aisle", "Ceiling"),
    # The nave ceiling is stone, not plaster: the same dark polished marble as
    # the floor, eight metres up. It is the one surface in the hall with
    # nothing on it and nothing in front of it, and a polished one reflects the
    # cove band and the pictures back down instead of swallowing them.
    ("Ceiling_Nave", "Marble_Dark"),
    ("Cove", "Reveal"),
    ("Reveal_", "Reveal"),
    ("Blank_", "Blank_Plate"),
    # Fittings, from 02_furniture.py.
    ("Bench_Seat", "Wood_Bench"),
    ("Bench_Leg", "Steel_Dark"),
    ("Bench_", "Wood_Bench"),
    ("Bin_Band", "Steel_Bright"),
    ("Bin_Rim", "Steel_Bright"),
    ("Bin_Liner", "Void"),
    ("Bin_Bottom", "Void"),
    ("Bin_", "Steel_Dark"),
    ("Planter_Soil", "Void"),
    ("Planter_", "Concrete_Pot"),
    ("Plant_", "Foliage"),
    ("Barrier_Rope", "Rope"),
    ("Barrier_", "Steel_Bright"),
)


# Two jobs on one object, which a per-object assignment cannot express.
#
# The spandrel is the wall the arcade carries. Its inner face is the
# clerestory — the brightest surface in the hall and the one the cove washes.
# Its underside is not: that is the soffit over each arcade opening, and from
# the aisle it is the head of a deep opening, which should be dark. Painted
# clerestory it reads as a lit shelf, and it is the one light surface in the
# room with no reason to be light.
FACE_OVERRIDES = (
    {"prefix": "Spandrel", "material": "Ceiling", "facing": "down"},
)


def apply_face_overrides(materials):
    """
    Repaint individual faces after the per-object pass.

    Normals are read in local space, which is the same as world space here:
    01_shell builds every box at its final coordinates and leaves the object
    transform at identity.
    """
    repainted = 0
    for rule in FACE_OVERRIDES:
        target = materials.get(rule["material"])
        if target is None:
            continue
        wanted_down = rule["facing"] == "down"
        for obj in bpy.data.objects:
            if obj.type != "MESH" or not obj.name.startswith(rule["prefix"]):
                continue
            mesh = obj.data
            names = [m.name if m else "" for m in mesh.materials]
            if target.name not in names:
                mesh.materials.append(target)
                names.append(target.name)
            index = names.index(target.name)
            for polygon in mesh.polygons:
                facing_down = polygon.normal.z < -0.9
                if facing_down == wanted_down and facing_down:
                    polygon.material_index = index
                    repainted += 1
            mesh.update()
    return repainted


def assign(materials):
    hits, misses = 0, []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for prefix, mat_name in ASSIGNMENT:
            if obj.name.startswith(prefix):
                obj.data.materials.clear()
                obj.data.materials.append(materials[mat_name])
                hits += 1
                break
        else:
            misses.append(obj.name)
    return hits, misses


if __name__ == "__main__":
    materials = build_materials()
    hits, misses = assign(materials)
    repainted = apply_face_overrides(materials)
    print(f"{len(materials)} Materialien, {hits} Objekte zugewiesen")
    print(f"  Flaechen nachtraeglich umgefaerbt: {repainted}")
    if misses:
        print("  ohne Material:", ", ".join(misses))
