# =============================================================================
# 07 — BAKE
#
# Bakes the lighting into a texture on UV1, once per bake mesh. Not a full
# "combined" bake: only the diffuse direct and indirect contribution, with the
# surface colour left out. What comes out is a lightmap that multiplies against
# the albedo at runtime, which is what keeps the tiling marble and the walnut
# sharp — a combined bake would flatten a 40 m hall's stone into whatever an
# atlas can hold, and 16 texels per metre is nowhere near enough for veining.
#
# Run from Blender, after 06_unwrap.py:
#     exec(open(r"<repo>/blender/07_bake.py").read())
#
# Every source collection that has a bake mesh is hidden for the whole run: the
# bake targets are duplicates sitting in exactly the same place as the
# originals, and coincident geometry in a ray tracer produces speckle, not
# shadows. The bake meshes themselves all stay visible, so the fittings still
# cast their shadows onto the hall's floor and the hall still bounces light
# back onto the fittings.
#
# The bake is HDR and a PNG is not, so each result is normalised and sRGB
# encoded on the way out. The numbers the frontend needs to undo that are
# written next to the images in lightmap.json.
# =============================================================================

import bpy
import json
import time
import pathlib
import numpy as np

ROOT = pathlib.Path(r"C:\Users\Felix\Desktop\DemoWebseiten\Portfolio")
BAKE_DIR = ROOT / "blender" / "bake"

# High, because a bake gets no denoiser. scene.cycles.use_denoising applies to
# renders only — BakeSettings has no equivalent — so whatever noise is left at
# the last sample is what ends up in the atlas, permanently. At 96 the hall was
# covered in fireflies. This is a few minutes once, not a frame budget.
SAMPLES = 512
MARGIN = 12

BAKE_JOBS = (
    {"object": "Hall", "image": "Hall_Lightmap", "resolution": 2048},
    {"object": "Fittings", "image": "Fittings_Lightmap", "resolution": 1024},
    # The arcade also bakes its own colour. Its marble is procedural, which
    # glTF has no way to carry, so the albedo pass is how the veining reaches
    # the browser — and because every column is unwrapped uniquely, it arrives
    # with no tiling and no repeat.
    # The lightmap at 1024 and the albedo at 2048. They share a UV layout, and
     # only one of them needs the resolution: the albedo carries marble veining
     # at 134 texels per metre on the surface a visitor walks right up to, while
     # the lightmap on a column is a soft gradient. Baking both at 2048 cost
     # twelve minutes and a megabyte for a smooth ramp.
    {"object": "Arcade", "image": "Arcade_Lightmap", "resolution": 1024,
     "albedo": True, "albedo_resolution": 2048},
)

# Hidden for the whole run: each has a duplicate in 80_Bake.
#
# Kept visible: 20_Fixtures. The frame blanks stand in for the case plates and
# should cast their shadow onto the wall. The real plates land in the same
# place, so the dark patch behind them is never seen, and the wall around them
# is correct.
HIDE_WHILE_BAKING = ("00_Shell", "10_Structure", "12_Arcade", "15_Furniture",
                    "40_Exhibits")

TARGET_NODE = "BakeTarget"

# Everything is divided by this percentile of the lit texels. Above it, texels
# clip — at 99.5% that is the inside of the cove slot and the half metre of
# wall directly behind a washer, neither of which anyone stands under.
NORMALISE_PERCENTILE = 0.995

# Anything at or below this is unlit atlas gutter, not dark hall.
LIT_THRESHOLD = 0.0005


def get_image(name, resolution):
    img = bpy.data.images.get(name)
    if img and (img.size[0] != resolution or img.size[1] != resolution):
        bpy.data.images.remove(img)
        img = None
    if img is None:
        img = bpy.data.images.new(
            name, resolution, resolution, alpha=False, float_buffer=True
        )
    # The buffer holds light, not colour, and nothing may transform it behind
    # our back. The sRGB curve is applied explicitly further down.
    img.colorspace_settings.name = "Non-Color"
    return img


def attach_targets(obj, image):
    """
    Every material on the object needs the target image as its active node.

    Cycles bakes into whatever image texture node is active in each material,
    which is easy to forget and produces a silent no-op when it is missing.
    The nodes stay unconnected: they are a destination, not part of the shader.
    """
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        node = nodes.get(TARGET_NODE)
        if node is None:
            node = nodes.new("ShaderNodeTexImage")
            node.name = TARGET_NODE
            node.label = TARGET_NODE
            node.location = (900, -400)
        node.image = image
        node.select = True
        nodes.active = node


def detach_targets(obj):
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        node = mat.node_tree.nodes.get(TARGET_NODE)
        if node is not None:
            mat.node_tree.nodes.remove(node)


def read_pixels(image):
    buf = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(buf)
    return buf.reshape(-1, 4)


def write_pixels(image, rgba):
    image.pixels.foreach_set(rgba.reshape(-1))
    image.update()


def luminance(rgba):
    return rgba[:, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def measure(rgba):
    lum = luminance(rgba)
    lit = lum[lum > LIT_THRESHOLD]
    if lit.size == 0:
        return {"coverage": 0.0, "mean": 0.0, "median": 0.0,
                "p95": 0.0, "max": float(lum.max()), "ceiling": 1.0}
    return {
        "coverage": float(lit.size) / float(lum.size),
        "mean": float(lit.mean()),
        "median": float(np.median(lit)),
        "p95": float(np.quantile(lit, 0.95)),
        "max": float(lum.max()),
        "ceiling": float(np.quantile(lit, NORMALISE_PERCENTILE)),
    }


def despeckle(image, threshold=2.5, floor_value=0.02):
    """
    Remove fireflies from a baked atlas.

    A bake gets no denoiser — scene.cycles.use_denoising is a render setting and
    BakeSettings has no equivalent — so a single unlucky indirect sample
    survives in the image as a white pixel, permanently. Clamping the bounces
    helps and does not finish the job: the dark ceilings in this hall are lit
    almost entirely by what the white columns throw back at them, and a dark
    surface's estimate is noisy in relative terms no matter what the absolute
    clamp is. The sRGB curve then spends its precision exactly there and pulls
    the speckle up into view.

    So the outliers are replaced rather than averaged away: a texel brighter
    than `threshold` times the median of its eight neighbours takes that
    median's colour, and everything else is left untouched. A gradient has no
    outliers and comes through unchanged; an isolated white pixel has nothing
    but outliers and disappears.

    `floor_value` keeps the filter off the genuinely dark parts of the atlas,
    where a median near zero would make every lit texel look like an outlier.
    """
    width, height = image.size
    rgba = read_pixels(image).reshape(height, width, 4)
    lum = rgba[:, :, :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

    # The eight neighbours, as shifted copies. Edges repeat, which is what
    # np.roll does anyway and is harmless in a padded atlas.
    stack = np.stack(
        [np.roll(np.roll(lum, dy, axis=0), dx, axis=1)
         for dy in (-1, 0, 1) for dx in (-1, 0, 1)
         if not (dx == 0 and dy == 0)],
        axis=0,
    )
    neighbour_median = np.median(stack, axis=0)

    hot = (lum > threshold * neighbour_median + floor_value)
    if not hot.any():
        return 0

    colour_stack = np.stack(
        [np.roll(np.roll(rgba[:, :, :3], dy, axis=0), dx, axis=1)
         for dy in (-1, 0, 1) for dx in (-1, 0, 1)
         if not (dx == 0 and dy == 0)],
        axis=0,
    )
    rgba[hot, :3] = np.median(colour_stack, axis=0)[hot]
    write_pixels(image, rgba.reshape(-1, 4))
    return int(hot.sum())


def linear_to_srgb(x):
    """
    The sRGB transfer curve, applied by hand.

    Half of this hall sits below 0.01 linear. Written straight into an 8-bit
    PNG that is one or two steps out of 255, and the walls band into flat
    terraces. The curve spends its precision in the darks, which is where a
    gallery at this light level actually lives. The frontend hands the texture
    to three.js as SRGBColorSpace and gets the linear values back.

    Applied here rather than left to Blender's colour management, because the
    image stays tagged Non-Color: what is in the buffer is what lands in the
    file, with no transform in between to reason about.
    """
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92,
                    1.055 * np.power(x, 1.0 / 2.4) - 0.055)


def encode(image, ceiling):
    """Normalise into 0-1, then sRGB encode. Returns the factor to undo it."""
    factor = max(1.0, ceiling)
    rgba = read_pixels(image)
    rgba[:, :3] = linear_to_srgb(rgba[:, :3] / factor)
    rgba[:, 3] = 1.0
    write_pixels(image, rgba)
    return factor


def prepare_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    # Clamp the indirect bounces hard.
    #
    # A bake gets no denoiser, so a single bright indirect sample survives as a
    # white pixel forever. The white marble columns raised the ceiling of the
    # whole hall and brought the fireflies back with it. At 2 the clamp costs
    # almost nothing in a diffuse-only bake of a dark room and removes them.
    scene.cycles.sample_clamp_indirect = 2.0

    bake = scene.render.bake
    bake.target = "IMAGE_TEXTURES"
    bake.margin = MARGIN
    bake.use_clear = True
    bake.use_selected_to_active = False
    # Lighting only. With use_pass_color on, the albedo bakes in too and the
    # result is a flat painted hall instead of a lightmap.
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_color = False


def bake_one(job):
    obj = bpy.data.objects[job["object"]]
    image = get_image(job["image"], job["resolution"])

    obj.data.uv_layers.active = obj.data.uv_layers["Lightmap"]
    attach_targets(obj, image)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    started = time.time()
    bpy.ops.object.bake("EXEC_DEFAULT", type="DIFFUSE")
    took = time.time() - started

    speckles = despeckle(image)
    stats = measure(read_pixels(image))
    factor = encode(image, stats["ceiling"])

    BAKE_DIR.mkdir(parents=True, exist_ok=True)
    out = BAKE_DIR / f"{job['image']}.png"
    image.filepath_raw = str(out)
    image.file_format = "PNG"
    image.save()

    albedo_file = None
    if job.get("albedo"):
        albedo_file = bake_albedo(job, obj)

    detach_targets(obj)
    return {
        "mesh": job["object"],
        "albedo": albedo_file,
        "file": out,
        "resolution": job["resolution"],
        "samples": SAMPLES,
        "seconds": took,
        "intensity": round(factor, 4),
        "speckles": speckles,
        "stats": stats,
    }


def bake_albedo(job, obj):
    """
    Bake the surface colour on its own, with no light in it at all.

    This is the opposite pass to the lightmap: use_pass_color and nothing else,
    so what lands in the image is the material's base colour and none of the
    room. The two multiply at runtime exactly as they would in a shader.

    It exists for one material. The columns are veined procedurally, and a
    procedural texture cannot be exported — it has to be rendered to an image
    somewhere, and rendering it into the same unique unwrap the lightmap uses
    costs one more pass and removes tiling from the problem entirely.
    """
    scene = bpy.context.scene
    image = get_image(job["image"].replace("_Lightmap", "_Albedo"),
                      job.get("albedo_resolution", job["resolution"]))
    # Colour, not light: this one does go through the sRGB transform, because
    # it is a colour map and three.js will read it as one.
    image.colorspace_settings.name = "sRGB"
    attach_targets(obj, image)

    bake = scene.render.bake
    before = (bake.use_pass_direct, bake.use_pass_indirect, bake.use_pass_color)
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    try:
        bpy.ops.object.bake("EXEC_DEFAULT", type="DIFFUSE")
    finally:
        (bake.use_pass_direct, bake.use_pass_indirect,
         bake.use_pass_color) = before

    BAKE_DIR.mkdir(parents=True, exist_ok=True)
    out = BAKE_DIR / f"{image.name}.png"
    image.filepath_raw = str(out)
    image.file_format = "PNG"
    image.save()
    return out


def run():
    scene = bpy.context.scene
    previous_engine = scene.render.engine

    hidden = []
    for name in HIDE_WHILE_BAKING:
        coll = bpy.data.collections.get(name)
        if coll is not None:
            hidden.append((coll, coll.hide_render))
            coll.hide_render = True

    prepare_scene()
    results = [bake_one(job) for job in BAKE_JOBS]

    for coll, was_hidden in hidden:
        coll.hide_render = was_hidden
    scene.render.engine = previous_engine

    BAKE_DIR.mkdir(parents=True, exist_ok=True)
    (BAKE_DIR / "lightmap.json").write_text(
        json.dumps(
            {
                "encoding": "srgb",
                "uv": "Lightmap",
                "maps": [
                    {
                        "mesh": r["mesh"],
                        "texture": r["file"].name,
                        "resolution": r["resolution"],
                        "samples": r["samples"],
                        "intensity": r["intensity"],
                        **({"albedo": r["albedo"].name} if r["albedo"] else {}),
                    }
                    for r in results
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return results


if __name__ == "__main__":
    for result in run():
        stats = result["stats"]
        size_mb = result["file"].stat().st_size / 1024 / 1024
        print(f"{result['mesh']}: {result['seconds']:.0f}s, "
              f"{result['resolution']}x{result['resolution']}, "
              f"{result['samples']} Samples -> {result['file'].name} ({size_mb:.2f} MB)")
        print(f"  belegte Atlasflaeche: {stats['coverage'] * 100:.0f}%")
        print(f"  linear, nur belegt  : Median {stats['median']:.4f}  "
              f"Mittel {stats['mean']:.4f}  p95 {stats['p95']:.3f}  "
              f"Max {stats['max']:.1f}")
        print(f"  lightMapIntensity   : {result['intensity']:.4f}")
        print(f"  Fireflies entfernt  : {result['speckles']}")
        if result["albedo"]:
            print(f"  Albedo gebacken     : {result['albedo'].name}")
