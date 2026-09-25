"""Builds the horse asset in Blender.

Run headless:  blender --background --python tools/horse/build_horse.py -- [--preview DIR]
The script sculpts the body from `anatomy.py`, reduces it to a game mesh and
writes `src/assets/horse.glb`. With --preview it also renders turntable views.
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
import openvdb

HERE = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import importlib  # noqa: E402

import anatomy  # noqa: E402
import game_mesh  # noqa: E402

importlib.reload(anatomy)
importlib.reload(game_mesh)

ROOT = os.path.dirname(os.path.dirname(HERE))


def to_blender(points):
    """Game (x, y, z) with +Y up and +Z forward to Blender (x, -z, y)."""
    points = np.asarray(points, float)
    return np.stack([points[:, 0], -points[:, 2], points[:, 1]], axis=1)


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def mesh_from_quads(name, points, quads):
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(len(points))
    mesh.vertices.foreach_set("co", to_blender(points).astype(np.float32).ravel())
    mesh.loops.add(len(quads) * 4)
    mesh.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set("loop_start", np.arange(0, len(quads) * 4, 4, dtype=np.int32))
    mesh.update(calc_edges=True)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def sculpt():
    half, origin = anatomy.field()
    full = anatomy.mirrored(half)
    h = anatomy.VOXEL
    ox = -h * (half.shape[0] - 1)
    grid = openvdb.FloatGrid(1.0)
    grid.copyFromArray(full)
    grid.transform = openvdb.createLinearTransform(
        [[h, 0, 0, 0], [0, h, 0, 0], [0, 0, h, 0], [ox, origin[1], origin[2], 1]]
    )
    points, quads = grid.convertToQuads(isovalue=0.0)
    obj = mesh_from_quads("HorseSculpt", points, quads)
    keep_largest_part(obj.data)
    mesh = obj.data
    euler = len(mesh.vertices) - len(mesh.edges) + len(mesh.polygons)
    # A closed surface without tunnels has Euler characteristic 2 (genus 0).
    genus = (2 - euler) // 2
    print("sculpt genus", genus)
    obj["genus"] = genus
    return obj


def keep_largest_part(mesh):
    """Drops specks the blending can leave behind, e.g. inside nostrils."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    seen, parts = set(), []
    for start in bm.verts:
        if start in seen:
            continue
        part, stack = [], [start]
        seen.add(start)
        while stack:
            vert = stack.pop()
            part.append(vert)
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        parts.append(part)
    parts.sort(key=len, reverse=True)
    bmesh.ops.delete(bm, geom=[v for part in parts[1:] for v in part], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()


def setup_preview():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (0.62, 0.42, 0.28)
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 800
    scene.render.film_transparent = False
    camera = bpy.data.objects.get("PreviewCamera")
    if camera is None:
        camera = bpy.data.objects.new("PreviewCamera", bpy.data.cameras.new("PreviewCamera"))
        scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def render_views(directory, views, prefix="horse"):
    camera = setup_preview()
    os.makedirs(directory, exist_ok=True)
    for name, (location, target, scale) in views.items():
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = scale
        loc = to_blender([location])[0]
        tgt = to_blender([target])[0]
        camera.location = loc
        direction = tgt - loc
        camera.rotation_euler = (
            math.atan2(math.hypot(direction[0], direction[1]), -direction[2]),
            0,
            math.atan2(direction[1], direction[0]) - math.pi / 2,
        )
        bpy.context.scene.render.filepath = os.path.join(directory, f"{prefix}-{name}.png")
        bpy.ops.render.render(write_still=True)


VIEWS = {
    "side": ((8, 1.9, 0.3), (0, 1.9, 0.3), 4.6),
    "front": ((0, 2.0, 8), (0, 2.0, 0), 4.2),
    "three-quarter": ((5.5, 3.4, 5.0), (0, 1.8, 0.3), 5.0),
    "head": ((3, 3.1, 2.4), (0.0, 3.1, 1.6), 1.6),
}
OUTPUT = os.path.join(ROOT, "src", "assets", "horse.glb")


def main(argv):
    preview = argv[argv.index("--preview") + 1] if "--preview" in argv else None
    clear_scene()
    sculpture = sculpt()
    bpy.context.view_layer.objects.active = sculpture
    sculpture.select_set(True)
    bpy.ops.object.shade_smooth()
    if preview:
        render_views(preview, VIEWS)
    if "--sculpt-only" in argv:
        return
    if sculpture["genus"] != 0:
        raise RuntimeError(
            f"The sculpted body has {sculpture['genus']} tunnel(s); blend the masses around them."
        )
    horse = game_mesh.build(sculpture, game_mesh.Field())
    sculpture.hide_render = True
    sculpture.hide_set(True)
    game_mesh.export(horse, OUTPUT)
    print("exported", len(horse.data.vertices), "vertices", len(horse.data.polygons), "triangles")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else globals().get("ARGS", []))
