# =============================================================================
# 06 — UNWRAP
#
# Prepares the hall and its fittings for baking and for export.
#
#   1. Join each group into one mesh. Forty-four objects are forty-four draw
#      calls in the browser; one joined mesh with a handful of material slots
#      is a handful. The originals are left untouched in their collections, so
#      the source of the room is still the scripts.
#
#   2. UV channel 0 — a world-scale cube projection. One metre of hall maps to
#      one UV unit, so a material that wants a 2.9 m stone tile simply asks for
#      1/2.9. Object coordinates would have been simpler, but glTF cannot
#      express them: a texture that is not driven by a UV layer does not
#      survive the export, and the marble would arrive as flat colour.
#
#   3. UV channel 1 — a packed lightmap atlas, no overlaps, with margin so
#      neighbouring islands do not bleed into each other during the bake.
#
# WHY TWO MESHES
#
# The hall is 7300 m² across 168 faces. The fittings are 60 m² across ten
# thousand. Packed into one atlas the fittings contribute almost no area and an
# enormous number of islands, and every island costs margin — the hall's texel
# density pays for a bench's. So they get an atlas each, sized to what they
# are: 2048 for the building, 1024 for the furniture, which at that scale is
# the denser of the two.
#
# Run from Blender, after 01-05:
#     exec(open(r"<repo>/blender/06_unwrap.py").read())
#
# Idempotent: rebuilds both bake meshes from scratch each run.
# =============================================================================

import bpy
import sys
import pathlib
import importlib

ROOT = pathlib.Path(r"C:\Users\Felix\Desktop\DemoWebseiten\Portfolio")
BLENDER_DIR = ROOT / "blender"
if str(BLENDER_DIR) not in sys.path:
    sys.path.insert(0, str(BLENDER_DIR))

import room_layout  # noqa: E402

importlib.reload(room_layout)
L = room_layout

BAKE_COLLECTION = "80_Bake"

# Each entry becomes one joined mesh with one lightmap atlas.
#
# Fixtures stay out of both: the frame blanks are stand-ins the frontend
# replaces, so they must not end up welded into anything. They are still
# present during the bake, as occluders.
BAKE_TARGETS = (
    {
        "name": "Hall",
        "sources": ("00_Shell", "10_Structure"),
        "atlas": 2048,
        "margin": 0.012,
    },
    {
        "name": "Fittings",
        # The exhibits join the furniture rather than getting an atlas of
        # their own: two podiums and two lecterns are 12 m2 against the
        # fittings' 91, too little to pay for a second 1024 and exactly the
        # same kind of surface — small, static, close to the visitor.
        "sources": ("15_Furniture", "40_Exhibits"),
        "atlas": 1024,
        # Tighter, because there are two orders of magnitude more islands here
        # and the margin is charged per island.
        "margin": 0.004,
    },
    {
        # The arcade, on its own, and the only target that also bakes its own
        # colour.
        #
        # Two reasons it is separate. It is what a visitor stands closest to,
        # so it wants the texel density the 40 m hall cannot afford. And its
        # marble is procedural, which glTF cannot carry as a shader — baking it
        # to a unique atlas is what gets it into the browser at all, and the
        # happy side effect is that the veining has no tiling, no repeat and no
        # seam, because nothing is tiled.
        "name": "Arcade",
        "sources": ("12_Arcade",),
        "atlas": 2048,
        "margin": 0.006,
        "albedo": True,
    },
)

# UV0 scale. cube_size = 1.0 means one metre maps to one UV unit, which makes
# every material's tiling factor readable as "metres per repeat".
UV0_CUBE_SIZE = 1.0

LIGHTMAP_ANGLE_LIMIT = 66.0


def load_module(filename):
    """Read another build script's constants without running its build."""
    namespace = {"__name__": f"_{filename}", "__file__": str(BLENDER_DIR / filename)}
    source = (BLENDER_DIR / filename).read_text(encoding="utf-8")
    exec(compile(source, filename, "exec"), namespace)
    return namespace


def view3d_override():
    """ops for UV work need a 3D view; find one rather than assume the context."""
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            region = next(r for r in area.regions if r.type == "WINDOW")
            return {"area": area, "region": region, "space_data": area.spaces.active}
    raise RuntimeError("kein 3D-Viewport gefunden")


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


def build_bake_mesh(name, sources, target):
    """Duplicate the source collections, join the copies, leave originals alone."""
    copies = []
    for coll_name in sources:
        coll = bpy.data.collections.get(coll_name)
        if coll is None:
            continue
        for obj in coll.objects:
            if obj.type != "MESH":
                continue
            copy = obj.copy()
            copy.data = obj.data.copy()
            copy.name = f"bake_{obj.name}"
            target.objects.link(copy)
            copies.append(copy)

    if not copies:
        raise RuntimeError(f"nichts zu backen fuer {name}")

    # Join needs an active object and a selection, both of which are context.
    bpy.ops.object.select_all(action="DESELECT")
    for copy in copies:
        copy.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()

    mesh_object = bpy.context.view_layer.objects.active
    mesh_object.name = name
    mesh_object.data.name = name
    # The copies carry their originals' transforms; the joined mesh has to be
    # in world space or the lightmap is baked against geometry that is not
    # where the geometry is.
    mesh_object.data.transform(mesh_object.matrix_world)
    mesh_object.matrix_world.identity()
    return mesh_object


def make_uvs(obj, margin):
    """UV0: world-scale cube projection. UV1: packed lightmap atlas."""
    mesh = obj.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.uv_layers.new(name="UVMap")
    mesh.uv_layers.new(name="Lightmap")

    override = view3d_override()
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)

    # --- UV0
    mesh.uv_layers.active = mesh.uv_layers["UVMap"]
    with bpy.context.temp_override(**override):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=UV0_CUBE_SIZE, correct_aspect=False)
        bpy.ops.object.mode_set(mode="OBJECT")

    # --- UV1
    mesh.uv_layers.active = mesh.uv_layers["Lightmap"]
    with bpy.context.temp_override(**override):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(
            angle_limit=LIGHTMAP_ANGLE_LIMIT * 3.141592653589793 / 180.0,
            island_margin=margin,
            correct_aspect=False,
            scale_to_bounds=False,
        )
        bpy.ops.object.mode_set(mode="OBJECT")

    # The bake reads whichever layer is active when it runs.
    mesh.uv_layers.active = mesh.uv_layers["Lightmap"]
    return mesh


def switch_textures_to_uv(tiles):
    """
    Repoint every scanned material from Object coordinates to UV0.

    Object coordinates were the right call while authoring — they run straight
    through the geometry and ignore seams. They are the wrong call for export,
    because glTF has no way to say "drive this texture from object space". So
    the source is swapped once the meshes have UVs, and the mapping scale stays
    exactly what it was: metres per repeat.
    """
    switched = []
    for name, tile in tiles.items():
        mat = bpy.data.materials.get(name)
        if mat is None or not mat.use_nodes:
            continue
        coord = next((n for n in mat.node_tree.nodes if n.type == "TEX_COORD"), None)
        mapping = next((n for n in mat.node_tree.nodes if n.type == "MAPPING"), None)
        if coord is None or mapping is None:
            continue
        for link in list(mat.node_tree.links):
            if link.to_node is mapping and link.to_socket.name == "Vector":
                mat.node_tree.links.remove(link)
        mat.node_tree.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
        mapping.inputs["Scale"].default_value = (1.0 / tile,) * 3
        switched.append(f"{name} ({tile} m)")
    return switched


def texel_report(obj, atlas):
    """How many lightmap texels land on a metre of surface. Below ~8 is mush."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers["Lightmap"].data

    world_area = sum(p.area for p in mesh.polygons)
    uv_area = 0.0
    for tri in mesh.loop_triangles:
        a, b, c = (uv[i].uv for i in tri.loops)
        uv_area += abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2.0

    if world_area <= 0 or uv_area <= 0:
        return 0.0, world_area, uv_area
    return atlas * (uv_area ** 0.5) / (world_area ** 0.5), world_area, uv_area


def run():
    clear_collection(BAKE_COLLECTION)
    target = get_collection(BAKE_COLLECTION)

    built = []
    for spec in BAKE_TARGETS:
        obj = build_bake_mesh(spec["name"], spec["sources"], target)
        make_uvs(obj, spec["margin"])
        density, world_area, uv_area = texel_report(obj, spec["atlas"])
        built.append({
            "object": obj,
            "atlas": spec["atlas"],
            "density": density,
            "world_area": world_area,
            "uv_area": uv_area,
        })

    # Both palettes. 05_exhibits brings its own scanned materials and they
    # need repointing onto UV0 for exactly the same reason the hall's do.
    tiles = dict(load_module("03_materials.py")["TILES"])
    tiles.update(load_module("05_exhibits.py")["TILES"])
    return built, switch_textures_to_uv(tiles)


if __name__ == "__main__":
    built, switched = run()
    for entry in built:
        obj = entry["object"]
        print(f"Backmesh '{obj.name}': {len(obj.data.polygons)} Faces, "
              f"{len(obj.data.materials)} Materialslots")
        print(f"  Flaeche    : {entry['world_area']:.0f} m2, "
              f"UV-Belegung {entry['uv_area'] * 100:.1f}%")
        print(f"  Texeldichte: {entry['density']:.1f} px/m bei {entry['atlas']}")
    print(f"  Texturen auf UV: {', '.join(switched) if switched else 'nichts umgestellt'}")
