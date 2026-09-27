"""Builds the rider asset in Blender.

Run headless:  blender --background --python tools/rider/build_rider.py -- [--preview DIR]
The figure from `figure.py` is meshed, reduced, split into clothing materials,
given bone weights and exported to `src/assets/rider.glb`.
"""

import json
import os
import sys

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
HORSE = os.path.join(os.path.dirname(HERE), "horse")
for path in (HERE, HORSE):
    if path not in sys.path:
        sys.path.insert(0, path)

import importlib  # noqa: E402

import anatomy  # noqa: E402
import build_horse  # noqa: E402
import figure  # noqa: E402
import game_mesh  # noqa: E402

for module in (anatomy, game_mesh, build_horse, figure):
    importlib.reload(module)

ROOT = os.path.dirname(os.path.dirname(HERE))
OUTPUT = os.path.join(ROOT, "src", "assets", "rider.glb")
TARGET_TRIANGLES = 32000
MATERIALS = ["skin", "hair", "shirt", "breeches", "boots", "gloves"]
VIEWS = {
    "front": ((0, 1.4, 6), (0, 1.3, 0), 2.9),
    "side": ((6, 1.4, 0.05), (0, 1.3, 0.05), 2.9),
    "three-quarter": ((3.5, 2.0, 4.5), (0, 1.3, 0), 3.0),
    "face": ((0.9, 2.42, 2.3), (0, 2.38, 0.05), 0.55),
}


def bone_weights(points):
    """The two closest bones (by distance to the bone minus its thickness), blended softly."""
    segments = figure.bone_segments()
    distances = []
    for _, a, b, radius in segments:
        ab = b - a
        t = np.clip(((points - a) @ ab) / (ab @ ab), 0, 1)
        distances.append(np.linalg.norm(points - (a + t[:, None] * ab), axis=1) - radius)
    distances = np.stack(distances, 1)
    order = np.argsort(distances, axis=1)
    first, second = order[:, 0], order[:, 1]
    rows = np.arange(len(points))
    gap = distances[rows, second] - distances[rows, first]
    # Equal distances share the vertex; a 4 cm lead gives the closer bone all of it.
    blend = 0.5 * (1 - game_mesh.smoothstep(0.0, 0.04, gap))
    return first, second, blend


def split_along_garments(mesh):
    """Adds edges exactly on each garment edge, then re-triangulates."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for point, normal in figure.cuts():
        (p,) = build_horse.to_blender([point])
        (n,) = build_horse.to_blender([normal])
        geometry = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geometry, plane_co=p, plane_no=n)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()


def build(sculpture, field):
    obj = sculpture.copy()
    obj.data = sculpture.data.copy()
    obj.name = obj.data.name = "RiderBody"
    bpy.context.scene.collection.objects.link(obj)
    decimate = obj.modifiers.new("Decimate", "DECIMATE")
    decimate.ratio = TARGET_TRIANGLES / (2 * len(sculpture.data.polygons))
    decimate.use_collapse_triangulate = True
    transfer = obj.modifiers.new("Normals", "DATA_TRANSFER")
    transfer.object = sculpture
    transfer.use_loop_data = True
    transfer.data_types_loops = {"CUSTOM_NORMAL"}
    transfer.loop_mapping = "POLYINTERP_NEAREST"
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh = obj.data
    split_along_garments(mesh)
    points, normals = game_mesh.game_vertices(mesh)
    first, second, blend = bone_weights(points)
    # Everything above the collar follows the head, everything below the torso.
    names = [name for name, *_ in figure.BONES]
    head, spine = names.index("head"), names.index("spine")
    above = points[:, 1] > 2.2
    below = points[:, 1] < 2.12
    for bones in (first, second):
        bones[above & (bones == spine)] = head
        bones[below & (bones == head)] = spine
    joints = np.stack([first, second, np.zeros_like(first)], 1)
    game_mesh.add_attribute(mesh, "_joint", "FLOAT_VECTOR", joints)
    game_mesh.add_attribute(mesh, "_blend", "FLOAT", blend)
    game_mesh.add_attribute(mesh, "_ao", "FLOAT", game_mesh.occlusion(field, points, normals))
    # Clothing regions are whole faces, so seams between garments stay crisp.
    mesh.materials.clear()
    for name in MATERIALS:
        mesh.materials.append(bpy.data.materials.get(name) or bpy.data.materials.new(name))
    names = [name for name, *_ in figure.BONES]
    centers = np.empty(len(mesh.polygons) * 3, np.float32)
    mesh.polygons.foreach_get("center", centers)
    centers = game_mesh.to_game(centers.reshape(-1, 3))
    first_vertex = np.empty(len(mesh.polygons), np.int32)
    mesh.polygons.foreach_get("loop_start", first_vertex)
    loops = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get("vertex_index", loops)
    indices = [
        MATERIALS.index(figure.region(tuple(center), names[first[loops[start]]]))
        for center, start in zip(centers, first_vertex)
    ]
    mesh.polygons.foreach_set("material_index", np.array(indices, np.int32))
    obj["rig"] = json.dumps(figure.rig())
    return obj


def main(argv):
    preview = argv[argv.index("--preview") + 1] if "--preview" in argv else None
    build_horse.clear_scene()
    half, origin = anatomy.field(figure.primitives(), figure.BOUNDS, figure.VOXEL)
    sculpture = build_horse.mesh_field(half, origin, figure.VOXEL, "RiderSculpt")
    bpy.context.view_layer.objects.active = sculpture
    sculpture.select_set(True)
    bpy.ops.object.shade_smooth()
    if preview:
        build_horse.render_views(preview, VIEWS, prefix="rider")
    if "--sculpt-only" in argv:
        return
    if sculpture["genus"] != 0:
        raise RuntimeError(f"The rider has {sculpture['genus']} tunnel(s).")
    rider = build(sculpture, game_mesh.Field(half, origin, figure.VOXEL))
    sculpture.hide_render = True
    sculpture.hide_set(True)
    game_mesh.export(rider, OUTPUT, materials="EXPORT")
    print("exported", len(rider.data.vertices), "vertices", len(rider.data.polygons), "triangles")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else globals().get("ARGS", []))
