"""Untextured Blender renders of the assembled parts, for checking shapes."""

import math
import os

import bpy
import numpy as np
from mathutils import Vector

COLOURS = {
    "skin": (0.78, 0.55, 0.45),
    "eyes": (0.9, 0.9, 0.9),
    "lashes": (0.15, 0.1, 0.08),
    "top": (0.1, 0.16, 0.3),
    "breeches": (0.72, 0.66, 0.54),
    "boots": (0.02, 0.018, 0.016),
    "soles": (0.01, 0.01, 0.01),
    "gloves": (0.07, 0.05, 0.04),
    "belt": (0.12, 0.07, 0.04),
    "metal": (0.7, 0.7, 0.72),
    "helmet": (0.03, 0.05, 0.05),
    "strap": (0.02, 0.02, 0.02),
    "hair": (0.16, 0.09, 0.05),
}
ROUGHNESS = {"boots": 0.3, "helmet": 0.45, "metal": 0.25, "belt": 0.45}
VIEWS = {
    "front": ((0, 0.86, 6), (0, 0.86, 0), 1.85, (640, 880)),
    "side": ((6, 0.86, 0), (0, 0.86, 0), 1.85, (640, 880)),
    "back": ((-2.5, 0.86, -6), (0, 0.86, 0), 1.85, (640, 880)),
    "head": ((1.2, 1.64, 3), (0, 1.6, 0), 0.42, (640, 640)),
    "head-side": ((3, 1.6, -0.3), (0, 1.6, 0), 0.42, (640, 640)),
    "boot": ((3, 0.3, 1.5), (0.15, 0.24, 0.05), 0.62, (640, 640)),
    "hand": ((1.5, 1.05, 3), (0.45, 1.02, 0.2), 0.3, (640, 640)),
}


def _blender(points):
    points = np.asarray(points)
    return np.stack([points[:, 0], -points[:, 2], points[:, 1]], 1)


def render(parts, directory, name, views=None, samples=24):
    os.makedirs(directory, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    for part in parts:
        mesh = bpy.data.meshes.new(part.material)
        mesh.from_pydata(_blender(part.vertices).tolist(), [], part.faces)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        material = bpy.data.materials.new(part.material)
        material.use_nodes = True
        shader = material.node_tree.nodes["Principled BSDF"]
        shader.inputs["Base Color"].default_value = (*COLOURS.get(part.material, (0.5, 0.5, 0.5)), 1)
        shader.inputs["Roughness"].default_value = ROUGHNESS.get(part.material, 0.7)
        mesh.materials.append(material)
        scene.collection.objects.link(bpy.data.objects.new(part.material, mesh))
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.8, 0.9, 1)
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3
    sun.data.angle = 0.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.type = "ORTHO"
    scene.collection.objects.link(camera)
    scene.camera = camera
    for view, (eye, target, size, resolution) in (views or VIEWS).items():
        eye = Vector((eye[0], -eye[2], eye[1]))
        target = Vector((target[0], -target[2], target[1]))
        camera.location = eye
        camera.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = size
        scene.render.resolution_x, scene.render.resolution_y = resolution
        scene.render.filepath = os.path.join(directory, f"{name}-{view}.png")
        bpy.ops.render.render(write_still=True)
