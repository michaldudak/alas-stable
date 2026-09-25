"""Turns the high-resolution sculpture into the game mesh and exports it.

The exported mesh carries everything the game needs as custom vertex
attributes, so no armature or textures are required:

- `_ao`: ambient occlusion from the distance field,
- `_mask`: sock, muzzle/eye-rim and hoof masks,
- `_leg`: which leg a vertex follows (0-3 in LH, LF, RH, RF order),
- `_weight`: weights for that leg's upper, knee and fetlock bones; the body
  bone takes the rest.

Rig landmarks travel as JSON in the node extras (`rig`).
"""

import json
import math
import os

import bpy
import numpy as np

import anatomy

TARGET_TRIANGLES = 46000


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Field:
    """Trilinear lookup into the sculpted distance field (game coordinates)."""

    def __init__(self):
        half, origin = anatomy.field()
        self.grid = anatomy.mirrored(half)
        self.h = anatomy.VOXEL
        self.origin = np.array([-self.h * (half.shape[0] - 1), origin[1], origin[2]])

    def __call__(self, points):
        idx = (points - self.origin) / self.h
        limit = np.array(self.grid.shape) - 2
        i0 = np.clip(np.floor(idx).astype(int), 0, limit)
        f = np.clip(idx - i0, 0.0, 1.0)
        result = np.zeros(len(points))
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (
                        (f[:, 0] if dx else 1 - f[:, 0])
                        * (f[:, 1] if dy else 1 - f[:, 1])
                        * (f[:, 2] if dz else 1 - f[:, 2])
                    )
                    result += w * self.grid[i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
        return result


def to_game(v):
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)


def game_vertices(mesh):
    co = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get("co", co)
    normals = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get("normal", normals)
    return to_game(co.reshape(-1, 3)), to_game(normals.reshape(-1, 3))


def occlusion(field, points, normals):
    """Distance-field ambient occlusion sampled along the surface normal."""
    ao = np.zeros(len(points))
    weight = 1.0
    for distance in (0.02, 0.05, 0.1, 0.18, 0.3):
        ao += weight * np.clip(distance - field(points + normals * distance), 0, None) / distance
        weight *= 0.6
    return np.clip(1.0 - ao * 0.45, 0.25, 1.0)


def masks(points):
    """White socks with an irregular edge, darker muzzle and eye rims, hoof horn."""
    x, y, z = points.T
    ripple = 0.025 * np.sin(np.abs(x) * 40 + z * 23) + 0.015 * np.sin(z * 57)
    lower_leg = y < 1.2
    sock = np.where(lower_leg, 1 - smoothstep(0.36, 0.46, y + ripple), 0.0)
    hoof = np.where(lower_leg, 1 - smoothstep(0.125, 0.14, y), 0.0)
    axis = (-math.sin(anatomy.HEAD_TILT), math.cos(anatomy.HEAD_TILT))
    along = (y - anatomy.POLL[0]) * axis[0] + (z - anatomy.POLL[1]) * axis[1]
    muzzle = smoothstep(0.78, 0.92, along) * (y > 2.4)
    eye = np.array(anatomy.EYE)
    mirrored = np.stack([np.abs(x), y, z], 1)
    rim = 1 - smoothstep(0.05, 0.085, np.linalg.norm(mirrored - eye, axis=1))
    return np.stack([sock * (1 - hoof), np.maximum(muzzle, rim * 0.7), hoof], axis=1)


def leg_chain(index):
    """Root, knee, fetlock and ground points of a leg in game order (LH, LF, RH, RF)."""
    fore = index % 2 == 1
    side = 1 if index >= 2 else -1
    spec = anatomy.FORE if fore else anatomy.HIND
    x = spec["x"] * side
    cx = spec["lower_x"] * side
    return [
        np.array([x, *spec["root"]]),
        np.array([cx, *spec["knee"]]),
        np.array([cx, *spec["fetlock"]]),
        np.array([cx, *spec["hoof"]]),
    ]


def skin_weights(points):
    x, y, z = points.T
    leg = np.where(z > -0.1, 1, 0) + np.where(x > 0, 2, 0)
    weights = np.zeros((len(points), 3))
    for index in range(4):
        chain = leg_chain(index)
        mine = leg == index
        p = points[mine]
        best = np.full(len(p), np.inf)
        along = np.zeros(len(p))
        start = 0.0
        joints = []
        for a, b in zip(chain[:-1], chain[1:]):
            ab = b - a
            length = np.linalg.norm(ab)
            t = np.clip(((p - a) @ ab) / (length * length), 0, 1)
            d = np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
            closer = d < best
            best = np.where(closer, d, best)
            along = np.where(closer, start + t * length, along)
            start += length
            joints.append(start)
        knee, fetlock = joints[0], joints[1]
        if index % 2 == 1:
            # Upper foreleg vertices far from the bone line belong to the chest.
            reach = np.where(along < knee - 0.1, 1 - smoothstep(0.17, 0.3, best), 1.0)
            limb = reach * smoothstep(0.04, 0.32, along)
        else:
            # The thigh swings from the hip joint: everything below the croup and
            # behind the flank follows the leg, except the midline under the tail.
            px, py, pz = p.T
            thigh = (
                smoothstep(-0.3, -0.58, pz)
                * smoothstep(2.02, 1.58, py)
                * smoothstep(0.02, 0.15, np.abs(px))
            )
            limb = np.where(along < knee - 0.1, thigh, 1.0)
        to_knee = smoothstep(knee - 0.08, knee + 0.05, along)
        to_fetlock = smoothstep(fetlock - 0.05, fetlock + 0.04, along)
        weights[mine] = np.stack(
            [limb * (1 - to_knee), limb * (to_knee - to_fetlock), limb * to_fetlock], 1
        )
    return leg, weights


def probe(field, targets, directions, reach=0.8):
    """Surface points hit by rays aimed at `targets` from outside along `directions`."""
    targets = np.asarray(targets, float)
    directions = np.asarray(directions, float)
    directions = directions / np.linalg.norm(directions, axis=1, keepdims=True)
    outside = targets + directions * reach
    step = 0.004
    distance = np.zeros(len(targets))
    hit = np.full(len(targets), np.nan)
    previous = field(outside)
    while np.isnan(hit).any() and distance.max() < reach * 2:
        distance += step
        value = field(outside - directions * distance[:, None])
        crossing = np.isnan(hit) & (previous > 0) & (value <= 0)
        # Linear interpolation between the last two samples.
        hit = np.where(crossing, distance - step * value / (value - previous), hit)
        previous = value
    return outside - directions * hit[:, None]


def rounded(points):
    return [[round(float(v), 4) for v in p] for p in points]


def fitting(field):
    """Surface samples the game uses to fit tack, mane, tail and ornaments."""
    data = {}
    # Saddle pad rows and the girth, draped around the barrel.
    angles = np.linspace(-1.32, 1.32, 23)
    for name, z in (("padBack", -0.68), ("padFront", 0.54)):
        centers = np.tile([0.0, 1.98, z], (len(angles), 1))
        dirs = np.stack([np.sin(angles), np.cos(angles), np.zeros_like(angles)], 1)
        data[name] = rounded(probe(field, centers, dirs))
    around = np.linspace(0, 2 * math.pi, 25)
    dirs = np.stack([np.sin(around), np.cos(around), np.zeros_like(around)], 1)
    data["girth"] = rounded(probe(field, np.tile([0.0, 1.95, 0.32], (25, 1)), dirs))
    # Topline from the poll to the croup, sampled straight down the midline.
    zs = np.linspace(1.5, -1.3, 57)
    tops = probe(field, np.stack([np.zeros_like(zs), np.full_like(zs, 2.4), zs], 1),
                 np.tile([0.0, 1.0, 0.0], (len(zs), 1)), reach=1.6)
    data["topline"] = rounded(tops)
    # Neck half-width 0.15 below the crest, for mane strands.
    below = tops.copy()
    below[:, 1] -= 0.15
    below[:, 0] = 0.0
    across = np.tile([1.0, 0.0, 0.0], (len(zs), 1))
    data["toplineWidth"] = [round(float(p[0]), 4) for p in probe(field, below, across)]
    below[:, 1] -= 0.25
    data["toplineWidthLow"] = [round(float(p[0]), 4) for p in probe(field, below, across)]
    # Head half-width over a (s, t) grid in the head's own frame.
    ss = np.round(np.arange(-0.05, 1.101, 0.05), 3)
    ts = np.round(np.arange(-0.05, 0.451, 0.05), 3)
    grid = np.array([anatomy.head_point(s, t) for s in ss for t in ts])
    widths = probe(field, grid, np.tile([1.0, 0.0, 0.0], (len(grid), 1)), reach=0.5)[:, 0]
    data["head"] = {
        "poll": list(anatomy.POLL),
        "tilt": anatomy.HEAD_TILT,
        "s": ss.tolist(),
        "t": ts.tolist(),
        "width": [round(float(w), 4) if np.isfinite(w) else 0 for w in widths],
    }
    return data


def add_attribute(mesh, name, kind, values):
    attribute = mesh.attributes.new(name, kind, "POINT")
    key = "vector" if kind == "FLOAT_VECTOR" else "value"
    attribute.data.foreach_set(key, np.ascontiguousarray(values, np.float32).ravel())


def rig():
    names = ("root", "knee", "fetlock", "ground")
    return {
        "legs": [
            {name: [round(float(v), 4) for v in point] for name, point in zip(names, leg_chain(i))}
            for i in range(4)
        ],
        "eye": [round(float(v), 4) for v in anatomy.EYE],
    }


def fitting_data(field):
    return {**rig(), **fitting(field)}


def build(sculpture, field):
    obj = sculpture.copy()
    obj.data = sculpture.data.copy()
    obj.name = obj.data.name = "HorseSkin"
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
    points, normals = game_vertices(obj.data)
    add_attribute(obj.data, "_ao", "FLOAT", occlusion(field, points, normals))
    add_attribute(obj.data, "_mask", "FLOAT_VECTOR", masks(points))
    leg, weights = skin_weights(points)
    add_attribute(obj.data, "_leg", "FLOAT", leg)
    add_attribute(obj.data, "_weight", "FLOAT_VECTOR", weights)
    obj["rig"] = json.dumps(fitting_data(field))
    material = bpy.data.materials.get("Coat") or bpy.data.materials.new("Coat")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def export(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="PLACEHOLDER",
        export_vertex_color="NONE",
        export_attributes=True,
        export_extras=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )
