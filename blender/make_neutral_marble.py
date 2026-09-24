# =============================================================================
# MAKE NEUTRAL MARBLE — a one-off, not part of the numbered pipeline
#
# Re-grades the Grey Cartago scan into a light, neutral marble and writes it
# next to the original as marble_neutral_Diffuse.jpg. Run once; the result is
# committed.
#
#     exec(open(r"<repo>/blender/make_neutral_marble.py").read())
#
# WHY THIS EXISTS
#
# Two problems, one cause.
#
# The piers should be white marble, and tinting the grey scan lighter cannot
# do it: the runtime material is `color x map` and a multiply only ever
# darkens. The map itself has to carry the value.
#
# And the floor had rust-coloured patches in it. Not dirt, and not the
# lightmap — Grey Cartago is a slab floor with genuinely terracotta courses in
# among the grey ones. Handsome in a hotel lobby, wrong in a hall whose entire
# palette is petrol, violet and ink.
#
# Both are fixed by grading once, at the source: desaturate almost to the
# stone's own luminance, then stretch that luminance up into the range a light
# marble occupies. The veining, the grain and the slab joints all survive,
# because they are structure rather than exposure.
#
# One map then serves both surfaces, and the multiply does the rest: the piers
# take a near-white tint and stay marble, the floor takes a dark blue-grey one
# and becomes the dark polished stone it was — minus the rust.
#
# Roughness and normal are not touched and not copied. A surface's relief does
# not change when its quarry does, and the material points at the originals.
# =============================================================================

import bpy
import pathlib
import numpy as np

TEXTURE_DIR = pathlib.Path(
    r"C:\Users\Felix\Desktop\DemoWebseiten\Portfolio\blender\textures"
)
SOURCE = TEXTURE_DIR / "grey_cartago_01_Diffuse.jpg"
TARGET = TEXTURE_DIR / "marble_neutral_Diffuse.jpg"

# How far to pull each pixel towards its own luminance.
#
# Nearly all the way. At 0.7 the terracotta courses were still plainly orange;
# the remaining 0.06 is what keeps the stone from going dead grey, which is
# the difference between marble and concrete.
DESATURATE = 0.94

# The linear range the finished stone occupies. Below is the vein, above is the
# field. Real white marble sits between roughly 0.55 and 0.75 mean; the low end
# here is the dark vein, not the average.
OUT_LOW = 0.34
OUT_HIGH = 0.88

# The input percentiles those two map to. Clipping the outer 2% at each end
# stops a single dark inclusion from flattening the whole grade.
IN_LOW_PERCENTILE = 0.02
IN_HIGH_PERCENTILE = 0.98

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def srgb_to_linear(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92,
                    1.055 * np.power(x, 1.0 / 2.4) - 0.055)


def load_raw(path):
    """
    Read the stored bytes, with no colour management in the way.

    Non-Color means Blender hands back what is in the file rather than what it
    thinks the file means, which is the only way to know what the decode is
    doing — this pipeline has already been bitten once by an sRGB curve applied
    twice.
    """
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = "Non-Color"
    buf = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(buf)
    size = (image.size[0], image.size[1])
    bpy.data.images.remove(image)
    return buf.reshape(-1, 4), size


def save_raw(rgba, size, path):
    image = bpy.data.images.new("marble_neutral", size[0], size[1], alpha=False)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(rgba.reshape(-1))
    image.update()

    scene = bpy.context.scene
    settings = scene.render.image_settings
    before = (settings.file_format, settings.quality,
              scene.view_settings.view_transform, scene.view_settings.look)
    settings.file_format = "JPEG"
    settings.quality = 94
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    try:
        image.save_render(str(path), scene=scene)
    finally:
        (settings.file_format, settings.quality,
         scene.view_settings.view_transform, scene.view_settings.look) = before
        bpy.data.images.remove(image)


def regrade(rgba):
    linear = srgb_to_linear(rgba[:, :3])
    lum = linear @ LUMA

    grey = np.repeat(lum[:, None], 3, axis=1)
    desaturated = linear * (1.0 - DESATURATE) + grey * DESATURATE

    low = float(np.quantile(lum, IN_LOW_PERCENTILE))
    high = float(np.quantile(lum, IN_HIGH_PERCENTILE))
    span = max(high - low, 1e-6)
    t = np.clip((lum - low) / span, 0.0, 1.0)
    wanted = OUT_LOW + (OUT_HIGH - OUT_LOW) * t

    # Scale each pixel to the luminance it should have, so the hue that
    # survived the desaturation rides along instead of being replaced by grey.
    scale = wanted / np.maximum(lum, 1e-5)
    out = np.clip(desaturated * scale[:, None], 0.0, 1.0)

    result = rgba.copy()
    result[:, :3] = linear_to_srgb(out)
    result[:, 3] = 1.0
    return result, lum, out @ LUMA


if __name__ == "__main__":
    if not SOURCE.exists():
        raise SystemExit(f"fehlt: {SOURCE}")

    rgba, size = load_raw(SOURCE)
    graded, before, after = regrade(rgba)
    save_raw(graded, size, TARGET)

    print(f"neutraler Marmor abgeleitet: {TARGET.name} "
          f"({size[0]}x{size[1]}, {TARGET.stat().st_size // 1024} KB)")
    print(f"  linear vorher : Mittel {before.mean():.3f}  "
          f"p05 {np.quantile(before, 0.05):.3f}  p95 {np.quantile(before, 0.95):.3f}")
    print(f"  linear nachher: Mittel {after.mean():.3f}  "
          f"p05 {np.quantile(after, 0.05):.3f}  p95 {np.quantile(after, 0.95):.3f}")
