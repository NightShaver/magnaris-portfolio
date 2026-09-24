# =============================================================================
# 08 — EXPORT
#
# Writes everything the browser needs into public/room/:
#
#     hall.glb            the hall, the fittings, both UV channels, the anchors
#     *_lightmap.webp     the baked light, one per mesh
#     stone_*.webp        the scanned surfaces, downscaled for the web
#     wood_*.webp
#     concrete_*.webp
#     room.json           the manifest that ties them together
#
# Run from Blender, after 07_bake.py:
#     exec(open(r"<repo>/blender/08_export.py").read())
#
# WHY THE MATERIALS ARE NOT EXPORTED AS SHADERS
#
# The marble is an image running through a mapping node, a multiply against a
# tint and a contrast node before it reaches Base Color, and the walnut and the
# concrete take the same path. glTF has no way to express that: the exporter
# supports Image -> (Mapping) -> Base Color and quietly drops the texture the
# moment anything sits in between, leaving a flat colour. So the glTF carries
# geometry, UVs and material *names* only, and the frontend builds the real
# materials from room.json. That also means the runtime gets a
# MeshStandardMaterial it can attach a lightmap and an environment map to,
# which is the whole point of the exercise.
#
# The palette and the tiling are read straight out of 03_materials.py rather
# than retyped here. A number that exists twice drifts.
# =============================================================================

import bpy
import json
import math
import shutil
import pathlib

ROOT = pathlib.Path(r"C:\Users\Felix\Desktop\DemoWebseiten\Portfolio")
BLENDER_DIR = ROOT / "blender"
BAKE_DIR = BLENDER_DIR / "bake"
OUT_DIR = ROOT / "public" / "room"

EXPORT_MESHES = ("Hall", "Fittings", "Arcade")
ANCHOR_COLLECTION = "90_Anchors"

# Everything the browser drives rather than reads off a lightmap: the hidden
# wall's blocks, the two sculptures, and the plates the frontend draws the
# skill texts onto. Exported as individual named objects, because each one
# moves on its own and a joined mesh has one transform.
RUNTIME_COLLECTION = "45_Runtime"

# The animation tracks 05_exhibits pushed its actions onto. Named here so the
# manifest can tell the frontend what to look for instead of the frontend
# guessing at clip names it cannot see.
CLIPS = {
    "HiddenWall": {"loop": False, "scrub": True},
    "PortalWall": {"loop": False, "scrub": True},
    "Idle": {"loop": True, "scrub": False},
}

# Web sizes, per texture set and sized to what the surface actually is.
#
# The marble runs 40 m of floor and gets 1k. The walnut covers six bench tops
# and the concrete ten flower pots; at 1k those two alone were a megabyte,
# which is more than the rest of the room put together. Normal maps are the
# worst offenders — noise compresses badly — and a 2.2 m bench does not need
# 1024 pixels of grain across 0.85 m of tile.
TEXTURE_SIZES = {"stone": 1024, "wood": 512, "concrete": 512, "plaster": 512}
TEXTURE_QUALITY = 84
NORMAL_QUALITY = 94

# The lightmaps are the textures carrying the look of the room, and every
# artefact in them gets multiplied by the intensity factor on the way back out.
LIGHTMAP_QUALITY = 95

# Lightmaps that ship smaller than they were baked. Empty now that the arcade
# bakes its lightmap at 1024 and only its albedo at 2048, which is the same
# saving without the extra eight minutes of tracing.
LIGHTMAP_SIZES: dict[str, int] = {}

# The arcade's albedo ships a notch smaller than it was baked.
#
# Fine marble veining is close to noise as far as a compressor is concerned:
# at 2048 and quality 84 this one file was 1.3 MB, more than the rest of the
# room together. At 1536 it still carries a hundred texels per metre, which is
# more than the eye resolves at arm's length from a column.
ALBEDO_SIZE = 1536
ALBEDO_QUALITY = 82


def load_module(filename):
    """
    Read another build script's constants without running its build.

    Each script does its work under `if __name__ == "__main__"`, so executing
    it under any other name leaves the definitions and none of the side
    effects. The filenames start with digits, which rules out a plain import.
    """
    namespace = {"__name__": f"_{filename}", "__file__": str(BLENDER_DIR / filename)}
    source = (BLENDER_DIR / filename).read_text(encoding="utf-8")
    exec(compile(source, filename, "exec"), namespace)
    return namespace


def linear_to_srgb_hex(colour):
    def channel(c):
        c = max(0.0, min(1.0, c))
        s = c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
        return int(round(s * 255))
    return "#{:02x}{:02x}{:02x}".format(*(channel(c) for c in colour[:3]))


# ------------------------------------------------------------------ textures
def save_web_image(image, destination, quality):
    """
    Write a byte-for-byte copy as WebP.

    save_render runs the scene's view transform, and this scene is on AgX. A
    lightmap that has been through a film curve is no longer a lightmap, so the
    transform is set to Standard for the duration and put back afterwards.
    """
    scene = bpy.context.scene
    settings = scene.render.image_settings
    before = (settings.file_format, settings.quality, settings.color_mode,
              scene.view_settings.view_transform, scene.view_settings.look)

    settings.file_format = "WEBP"
    settings.quality = quality
    settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        image.save_render(str(destination), scene=scene)
    finally:
        (settings.file_format, settings.quality, settings.color_mode,
         scene.view_settings.view_transform, scene.view_settings.look) = before


def convert_texture(source, destination, size=None, quality=90):
    """
    Re-encode a texture for the web without changing what is in it.

    Every file here is a byte copy, including the data maps: roughness and
    normal carry no colour and must arrive at the browser exactly as they left.

    The tempting way to say that is to tag the source Non-Color, and it is
    wrong. save_render always encodes to the display space on the way out, so
    Non-Color in means the bytes get read as linear and encoded once more —
    the first run of this script produced a lightmap 217% too bright that way.
    Tagging the input with the same space the output is written in makes the
    decode and the encode cancel, which is what a byte copy is. Which channel
    is colour and which is data is the frontend's business, and three.js is
    told per texture.
    """
    image = bpy.data.images.load(str(source), check_existing=False)
    try:
        image.colorspace_settings.name = "sRGB"
        if size and (image.size[0] != size or image.size[1] != size):
            image.scale(size, size)
        save_web_image(image, destination, quality)
    finally:
        bpy.data.images.remove(image)
    return destination.stat().st_size


def mean_luminance(path):
    """
    Round-trip check: a WebP that lost the plot should say so out loud.

    Read as Non-Color on purpose. A lightmap leaves the bake as a 16-bit PNG,
    which Blender loads as float and decodes on the way in, while the WebP next
    to it is 8-bit and does not get decoded. Comparing those two as loaded is
    comparing linear against encoded, and it reports a 217% drift on a file
    that is perfectly fine. Non-Color puts both in the stored-value domain,
    which is the only domain in which "did the bytes survive" is a question.
    """
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        image.colorspace_settings.name = "Non-Color"
        import numpy as np
        buf = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(buf)
        rgba = buf.reshape(-1, 4)
        return float((rgba[:, :3] @ np.array([0.2126, 0.7152, 0.0722], "f4")).mean())
    finally:
        bpy.data.images.remove(image)


# ----------------------------------------------------------------- manifest
def emission_of(bsdf):
    """
    The emissive part of a material, if it has one.

    Blender measures emission in watts per square metre on top of a colour;
    three.js multiplies an emissive colour by a scalar and tone-maps the
    result. They are not the same quantity and there is no exact conversion, so
    the strength travels as it was authored and the frontend decides what a
    watt is worth under its own exposure.
    """
    colour = bsdf.inputs.get("Emission Color")
    strength = bsdf.inputs.get("Emission Strength")
    if colour is None or strength is None:
        return {}
    watts = float(strength.default_value)
    if watts <= 0.0:
        return {}
    return {
        "emissive": linear_to_srgb_hex(colour.default_value),
        "emissiveStrength": round(watts, 3),
    }


def describe_runtime(textured):
    """
    One entry per object the browser drives, plus the materials they use.

    These never reach a bake mesh, so describe_materials never sees them: it
    walks the three joined meshes and nothing else. They still need their
    materials rebuilt at runtime for exactly the same reason everything else
    does — glTF carries the name and not the shader.
    """
    collection = bpy.data.collections.get(RUNTIME_COLLECTION)
    if collection is None:
        return [], []

    objects, materials, seen = [], [], set()
    for obj in sorted(collection.objects, key=lambda o: o.name):
        if obj.type != "MESH":
            continue
        objects.append({
            "name": obj.name,
            "parent": obj.parent.name if obj.parent else None,
        })
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)
            nodes = mat.node_tree.nodes if mat.use_nodes else []
            bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
            entry = {"name": mat.name, "mesh": RUNTIME_COLLECTION}
            if mat.name in textured:
                set_name, tile = textured[mat.name]
                mix = next((n for n in nodes
                            if n.type == "MIX" and n.blend_type == "MULTIPLY"), None)
                tint = tuple(mix.inputs["B"].default_value)[:3] if mix else (1.0,) * 3
                entry.update({
                    "kind": "textured",
                    "texture": set_name,
                    "tile": tile,
                    "color": linear_to_srgb_hex(tint),
                })
                remap = next((n for n in nodes if n.type == "MAP_RANGE"), None)
                if remap:
                    entry["roughness"] = [
                        round(remap.inputs["To Min"].default_value, 3),
                        round(remap.inputs["To Max"].default_value, 3),
                    ]
                normal = next((n for n in nodes if n.type == "NORMAL_MAP"), None)
                if normal:
                    entry["normalStrength"] = round(
                        normal.inputs["Strength"].default_value, 3)
            else:
                entry.update({
                    "kind": "flat",
                    "color": linear_to_srgb_hex(bsdf.inputs["Base Color"].default_value)
                             if bsdf else "#000000",
                    "roughness": round(bsdf.inputs["Roughness"].default_value, 3)
                                 if bsdf else 1.0,
                })
            if bsdf:
                entry["metalness"] = round(bsdf.inputs["Metallic"].default_value, 3)
                entry.update(emission_of(bsdf))
            materials.append(entry)
    return objects, materials


def describe_clips():
    """The animation tracks that made it into the file, with their lengths."""
    scene = bpy.context.scene
    fps = scene.render.fps / scene.render.fps_base
    found = {}
    for obj in bpy.data.objects:
        if not obj.animation_data:
            continue
        for track in obj.animation_data.nla_tracks:
            if track.name not in CLIPS:
                continue
            start, end = found.get(track.name, (1e9, -1e9))
            for strip in track.strips:
                start = min(start, strip.frame_start)
                end = max(end, strip.frame_end)
            found[track.name] = (start, end)
    return [
        {
            "name": name,
            "duration": round((end - start) / fps, 4),
            **CLIPS[name],
        }
        for name, (start, end) in sorted(found.items())
    ]


def describe_materials(textured, baked_meshes):
    """
    One entry per material used by the exported meshes, so the frontend can
    rebuild each one. Textured materials name their set and their tile size in
    metres; the rest carry a flat colour.
    """
    described = []
    seen = set()
    for mesh_name in EXPORT_MESHES:
        obj = bpy.data.objects.get(mesh_name)
        if obj is None:
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)

            entry = {"name": mat.name, "mesh": mesh_name}
            nodes = mat.node_tree.nodes if mat.use_nodes else []
            bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)

            if mesh_name in baked_meshes:
                # The colour is already in the mesh's own albedo atlas, on the
                # same UV channel as its lightmap. Nothing to tile, nothing to
                # tint: white, and let the image speak.
                entry.update({
                    "kind": "baked",
                    "color": "#ffffff",
                    "roughness": round(bsdf.inputs["Roughness"].default_value, 3)
                                 if bsdf else 0.5,
                })
            elif mat.name in textured:
                set_name, tile = textured[mat.name]
                # The visible colour of a scanned surface is the tint it is
                # multiplied by, not the Base Color socket, which is driven by
                # the texture.
                mix = next((n for n in nodes
                            if n.type == "MIX" and n.blend_type == "MULTIPLY"), None)
                tint = tuple(mix.inputs["B"].default_value)[:3] if mix else (1.0,) * 3
                entry.update({
                    "kind": "textured",
                    "texture": set_name,
                    "tile": tile,
                    "color": linear_to_srgb_hex(tint),
                })
                remap = next((n for n in nodes if n.type == "MAP_RANGE"), None)
                if remap:
                    entry["roughness"] = [
                        round(remap.inputs["To Min"].default_value, 3),
                        round(remap.inputs["To Max"].default_value, 3),
                    ]
                normal = next((n for n in nodes if n.type == "NORMAL_MAP"), None)
                if normal:
                    entry["normalStrength"] = round(
                        normal.inputs["Strength"].default_value, 3)
            else:
                entry.update({
                    "kind": "flat",
                    "color": linear_to_srgb_hex(bsdf.inputs["Base Color"].default_value)
                             if bsdf else "#000000",
                    "roughness": round(bsdf.inputs["Roughness"].default_value, 3)
                                 if bsdf else 1.0,
                })
            if bsdf:
                entry["metalness"] = round(bsdf.inputs["Metallic"].default_value, 3)
                entry.update(emission_of(bsdf))
            described.append(entry)
    return described


def describe_anchors():
    """
    The anchors as the browser will see them.

    glTF is Y-up and Blender is Z-up, so the exporter rotates the scene on the
    way out and an anchor's glTF position is (x, z, -y) of its Blender one.
    These are written in the exported frame, so the frontend can compare what
    it reads from the glTF against this file and find a mismatch immediately.
    """
    anchors = []
    collection = bpy.data.collections.get(ANCHOR_COLLECTION)
    if collection is None:
        return anchors
    for obj in sorted(collection.objects, key=lambda o: o.name):
        x, y, z = obj.location
        anchors.append({
            "name": obj.name,
            "position": [round(x, 4), round(z, 4), round(-y, 4)],
            "rotationY": round(obj.rotation_euler.z, 6),
        })
    return anchors


# ------------------------------------------------------------------- export
def gltf_arguments(**wanted):
    """
    Keep only the arguments this Blender's exporter actually has.

    The glTF operator renames and drops properties between releases, and an
    unknown keyword is a hard error. Filtering against the operator's own rna
    means the script survives the next rename instead of failing on it.
    """
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    return {k: v for k, v in wanted.items() if k in known}


def export_gltf():
    anchors = bpy.data.collections.get(ANCHOR_COLLECTION)
    restore = []
    if anchors is not None:
        restore.append((anchors, anchors.hide_viewport))
        anchors.hide_viewport = False

    bpy.ops.object.select_all(action="DESELECT")
    exported = 0
    active = None
    for name in EXPORT_MESHES:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        obj.hide_set(False)
        obj.select_set(True)
        active = obj
        exported += 1
    runtime = bpy.data.collections.get(RUNTIME_COLLECTION)
    if runtime is not None:
        for obj in runtime.objects:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.select_set(True)
            active = active or obj
            exported += 1
    if anchors is not None:
        for obj in anchors.objects:
            obj.hide_set(False)
            obj.select_set(True)
            exported += 1
    bpy.context.view_layer.objects.active = active

    target = OUT_DIR / "hall.glb"
    bpy.ops.export_scene.gltf(**gltf_arguments(
        filepath=str(target),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,       # both channels, UVMap then Lightmap
        export_tangents=False,
        export_materials="EXPORT",   # names and slot assignment, see the header
        export_image_format="NONE",  # the frontend loads its own textures
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        # The mechanism and the two idle loops.
        #
        # NLA_TRACKS rather than ACTIONS, and that is the whole reason the
        # keyframes were pushed onto named tracks in the first place: in this
        # mode the exporter makes one glTF animation per track *name* and
        # merges every object carrying a track by that name into it. Six blocks
        # with six separate actions come out as one clip called HiddenWall, the
        # way a mechanism should. In ACTIONS mode they would arrive as
        # HiddenWall, HiddenWall.001 and so on, and the frontend would have to
        # play six clips in lockstep and hope.
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        # Every second frame. The exporter samples animation per frame, and at
        # 24 fps across a twenty second loop that is 481 keys on every channel
        # of every moving object — about a hundred kilobytes of quaternions
        # describing rotations that are linear anyway. Twelve samples a second
        # still resolves the hidden wall's easing, which is the only curve in
        # the file that is not a straight line.
        export_frame_step=2,
        export_frame_range=False,
        export_bake_animation=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_object=True,
        export_skins=False,
        export_morph=False,
        # Draco. The hall on its own was 156 faces and compression would have
        # been pure overhead; the fittings are ten thousand, and uncompressed
        # that is a megabyte of float32 positions, normals and two UV sets.
        # The decoder lives in public/draco/ rather than on Google's CDN — this
        # site is a static export and has no business phoning out to render its
        # own furniture.
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    ))

    for collection, hidden in restore:
        collection.hide_viewport = hidden
    return target, exported


def run():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    materials_module = load_module("03_materials.py")
    texture_sets = materials_module["TEXTURE_SETS"]
    textured = dict(materials_module["TEXTURED"])
    textured.update(load_module("05_exhibits.py")["TEXTURED"])
    texture_dir = pathlib.Path(materials_module["TEXTURE_DIR"])

    bake_meta = json.loads((BAKE_DIR / "lightmap.json").read_text(encoding="utf-8"))

    jobs = []
    baked_meshes = set()
    for entry in bake_meta["maps"]:
        name = f"{entry['mesh'].lower()}_lightmap.webp"
        jobs.append((name, BAKE_DIR / entry["texture"],
                     LIGHTMAP_SIZES.get(entry["mesh"]), LIGHTMAP_QUALITY))
        if entry.get("albedo"):
            baked_meshes.add(entry["mesh"])
            jobs.append((f"{entry['mesh'].lower()}_albedo.webp",
                         BAKE_DIR / entry["albedo"], ALBEDO_SIZE, ALBEDO_QUALITY))
    for set_name, files in texture_sets.items():
        for key, suffix in (("diffuse", "diffuse"), ("rough", "rough"),
                            ("normal", "normal")):
            source = texture_dir / files[key]
            if not source.exists():
                continue
            quality = NORMAL_QUALITY if key == "normal" else TEXTURE_QUALITY
            size = TEXTURE_SIZES.get(set_name, 1024)
            jobs.append((f"{set_name}_{suffix}.webp", source, size, quality))

    written = {}
    roundtrip = []
    for name, source, size, quality in jobs:
        destination = OUT_DIR / name
        written[name] = convert_texture(source, destination, size=size, quality=quality)
        roundtrip.append((name, mean_luminance(source), mean_luminance(destination)))

    runtime_objects, runtime_materials = describe_runtime(textured)

    target, exported = export_gltf()
    written["hall.glb"] = target.stat().st_size

    manifest = {
        "generated": "blender/08_export.py",
        "mesh": "hall.glb",
        # glTF is Y-up and Blender is Z-up, so the exporter maps
        # (x, y, z) -> (x, z, -y): the room comes out with its depth negated
        # and the entrance portal at -Z. The frontend walks from +Z, so it
        # turns the room around on load. The hall is bilaterally symmetric,
        # which is what makes that exact rather than approximate.
        "yawOnLoad": round(math.pi, 6),
        "meshes": [
            {
                "name": entry["mesh"],
                "lightmap": {
                    "texture": f"{entry['mesh'].lower()}_lightmap.webp",
                    "uv": 1,
                    "colorSpace": "srgb",
                    "intensity": entry["intensity"],
                    "resolution": entry["resolution"],
                    "samples": entry["samples"],
                },
                **(
                    {
                        # Colour baked into the same unique unwrap as the
                        # lightmap. Sampled on UV1 and never tiled.
                        "albedo": {
                            "texture": f"{entry['mesh'].lower()}_albedo.webp",
                            "uv": 1,
                            "colorSpace": "srgb",
                        }
                    }
                    if entry.get("albedo")
                    else {}
                ),
            }
            for entry in bake_meta["maps"]
        ],
        "textures": {
            set_name: {
                "map": f"{set_name}_diffuse.webp",
                "roughnessMap": f"{set_name}_rough.webp",
                "normalMap": f"{set_name}_normal.webp",
            }
            for set_name in texture_sets
        },
        "credit": "grey_cartago_01, american_walnut_veneer, concrete_floor_01 — "
                  "Poly Haven, CC0",
        "materials": describe_materials(textured, baked_meshes) + runtime_materials,
        "anchors": describe_anchors(),
        # What the browser drives: the hidden wall's blocks, the two sculptures
        # and the plates the skill texts go on, plus the clips that move them.
        "runtime": {
            "collection": RUNTIME_COLLECTION,
            "objects": runtime_objects,
            "clips": describe_clips(),
        },
    }
    (OUT_DIR / "room.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    written["room.json"] = (OUT_DIR / "room.json").stat().st_size

    credits = BLENDER_DIR / "textures" / "CREDITS.txt"
    if credits.exists():
        shutil.copy2(credits, OUT_DIR / "CREDITS.txt")
        written["CREDITS.txt"] = (OUT_DIR / "CREDITS.txt").stat().st_size

    # Anything in public/room/ that this run did not write is left over from a
    # previous shape of the pipeline, and public/room/ is committed. The single
    # lightmap from before the hall and its fittings were split kept shipping
    # 327 KB to every visitor for nothing.
    stale = [p for p in OUT_DIR.iterdir()
             if p.is_file() and p.name not in written and p.name != "room.json"]
    for path in stale:
        path.unlink()

    return manifest, written, exported, roundtrip, [p.name for p in stale]


if __name__ == "__main__":
    manifest, written, exported, roundtrip, stale = run()
    total = sum(written.values())

    print(f"Export nach public/room/  ({exported} Objekte, {total / 1024 / 1024:.2f} MB gesamt)")
    for name in sorted(written, key=lambda n: -written[n]):
        print(f"  {name:24s} {written[name] / 1024:7.0f} KB")

    auffaellig = [(n, b, a) for n, b, a in roundtrip
                  if b and abs(a - b) / b > 0.03]
    if auffaellig:
        print("  Roundtrip ACHTUNG:")
        for name, before, after in auffaellig:
            print(f"    {name:22s} {before:.4f} -> {after:.4f}")
    else:
        print(f"  Roundtrip: alle {len(roundtrip)} Texturen unter 3% Abweichung")

    if stale:
        print(f"  geloescht (nicht mehr im Manifest): {', '.join(stale)}")
    print(f"  Meshes     : {', '.join(m['name'] for m in manifest['meshes'])}")
    print(f"  Materialien: {len(manifest['materials'])}")
    print(f"  Anker      : {len(manifest['anchors'])}")
