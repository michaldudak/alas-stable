"""Writes a built rider as a GLB plus its textures.

The GLB is plain glTF 2.0: one skinned mesh with a primitive per material and
a joint hierarchy whose rest pose has no rotations. Joint positions, chain
ends and head landmarks are repeated in the mesh node's `extras.rig` for the
game. Vertex attributes are quantised (KHR_mesh_quantization).
"""

import json
import os
import struct

import numpy as np

import meshops
import outfit
import textures

MATERIAL_ORDER = ["skin", "eyes", "lashes", "hair", "top", "breeches", "boots", "soles", "gloves", "belt", "metal", "helmet", "strap"]


def occlusion(positions, normals, triangles, rays=40, reach=0.22):
    """Ambient occlusion per vertex from short rays; 1 where Blender's BVH is missing."""
    try:
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
    except ImportError:
        return np.ones(len(positions))
    tree = BVHTree.FromPolygons(positions.tolist(), triangles.tolist())
    rng = np.random.default_rng(7)
    directions = rng.normal(size=(rays, 3))
    directions /= np.linalg.norm(directions, axis=1, keepdims=True)
    result = np.zeros(len(positions))
    for i, (point, normal) in enumerate(zip(positions, normals)):
        origin = Vector(point + normal * 0.002)
        total = weight = 0.0
        for direction in directions:
            cosine = float(direction @ normal)
            if cosine < 0:
                direction, cosine = -direction, -cosine
            hit = tree.ray_cast(origin, Vector(direction), reach)
            weight += cosine
            if hit[0] is None:
                total += cosine
            else:
                total += cosine * (hit[3] / reach) ** 2
        result[i] = total / weight
    return result


def flatten(part):
    """Triangles over unique (vertex, UV) pairs, with smooth normals."""
    normals = meshops.vertex_normals(part.vertices, part.faces)
    lookup, vertices, triangles = {}, [], []
    for face, corners in zip(part.faces, part.uvs):
        ids = []
        for v, uv in zip(face, corners):
            key = (v, round(float(uv[0]), 5), round(float(uv[1]), 5))
            if key not in lookup:
                lookup[key] = len(vertices)
                vertices.append((v, uv))
            ids.append(lookup[key])
        for k in range(1, len(ids) - 1):
            triangles.append([ids[0], ids[k], ids[k + 1]])
    source = np.array([v for v, _ in vertices])
    uv = np.array([uv for _, uv in vertices], np.float64)
    return part.vertices[source], normals[source], uv, part.weights[source], np.array(triangles, np.uint32)


class Buffer:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def add(self, array, component, kind, target=None, normalized=False, bounds=False):
        while len(self.data) % 4:
            self.data.append(0)
        raw = np.ascontiguousarray(array).tobytes()
        view = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(raw)}
        if target:
            view["target"] = target
        self.data.extend(raw)
        self.views.append(view)
        accessor = {"bufferView": len(self.views) - 1, "componentType": component, "count": len(array), "type": kind}
        if normalized:
            accessor["normalized"] = True
        if bounds:
            accessor["min"] = array.min(axis=0).tolist()
            accessor["max"] = array.max(axis=0).tolist()
        self.accessors.append(accessor)
        return len(self.accessors) - 1


def write(name, character, mh, parts, rig, ends, marks, directory, scale):
    os.makedirs(directory, exist_ok=True)
    by_name = {}
    for part in parts:
        by_name.setdefault(part.material, []).append(part)
    skin_image, face_sheet = textures.face_textures(
        mh.assets, character, by_name["skin"][0], by_name["eyes"][0], by_name["lashes"][0], by_name["lashes"][1]
    )
    detail, normal_map = textures.paint_outfit(marks)
    skin_image.save(os.path.join(directory, "skin.webp"), quality=90, method=6)
    face_sheet.save(os.path.join(directory, "face.webp"), quality=92, method=6)
    detail.save(os.path.join(directory, "outfit.webp"), quality=88, method=6)
    normal_map.save(os.path.join(directory, "outfit-normal.webp"), quality=92, method=6)

    merged = [meshops.merge(by_name[material], material) for material in MATERIAL_ORDER if material in by_name]
    flat = [flatten(part) for part in merged]
    # Occlusion is cast against the whole dressed figure.
    offsets = np.cumsum([0] + [len(f[0]) for f in flat])
    everything = np.vstack([f[0] for f in flat])
    all_normals = np.vstack([f[1] for f in flat])
    all_triangles = np.vstack([f[4] + offset for f, offset in zip(flat, offsets)])
    ao = occlusion(everything, all_normals, all_triangles)

    bones = list(rig)
    buffer = Buffer()
    primitives, materials = [], []
    for index, (part, (positions, normals, uv, weights, triangles)) in enumerate(zip(merged, flat)):
        order = np.argsort(-weights, axis=1)[:, :4]
        top = np.take_along_axis(weights, order, axis=1)
        top = top / top.sum(axis=1, keepdims=True)
        quantised = np.round(top * 255).astype(np.int32)
        quantised[:, 0] += 255 - quantised.sum(axis=1)
        order = np.where(quantised > 0, order, 0)
        occluded = ao[offsets[index] : offsets[index + 1]]
        if part.material in ("eyes", "lashes"):
            # Eyes sit deep in their sockets but should still catch the light.
            occluded = 0.6 + 0.4 * occluded
        attributes = {
            "POSITION": buffer.add((positions * scale).astype(np.float32), 5126, "VEC3", 34962, bounds=True),
            "NORMAL": buffer.add(np.hstack([np.round(normals * 127), np.zeros((len(normals), 1))]).astype(np.int8)[:, :3].copy(), 5120, "VEC3", 34962, normalized=True),
            # glTF puts the UV origin at the top left of the image.
            "TEXCOORD_0": buffer.add(np.stack([uv[:, 0], 1 - uv[:, 1]], 1).astype(np.float32), 5126, "VEC2", 34962),
            "JOINTS_0": buffer.add(order.astype(np.uint8), 5121, "VEC4", 34962),
            "WEIGHTS_0": buffer.add(quantised.astype(np.uint8), 5121, "VEC4", 34962, normalized=True),
            "_AO": buffer.add(np.round(occluded * 255).astype(np.uint8), 5121, "SCALAR", 34962, normalized=True),
        }
        indices = triangles.astype(np.uint16 if len(positions) < 65536 else np.uint32)
        primitives.append(
            {
                "attributes": attributes,
                "indices": buffer.add(indices.ravel(), 5123 if indices.dtype == np.uint16 else 5125, "SCALAR", 34963),
                "material": index,
            }
        )
        materials.append({"name": part.material, "doubleSided": part.material in ("lashes", "strap", "hair")})

    def scaled(point):
        return [round(float(v) * scale, 5) for v in point]

    nodes = [{"name": name, "mesh": 0, "skin": 0}]
    node_of = {}
    for bone in bones:
        parent, position = rig[bone]
        local = position - rig[parent][1] if parent else position
        node_of[bone] = len(nodes)
        nodes.append({"name": bone, "translation": scaled(local)})
    for bone in bones:
        parent = rig[bone][0]
        if parent:
            nodes[node_of[parent]].setdefault("children", []).append(node_of[bone])
    inverse = np.tile(np.eye(4, dtype=np.float32), (len(bones), 1, 1))
    for i, bone in enumerate(bones):
        inverse[i, 3, :3] = -rig[bone][1] * scale
    skin = {"joints": [node_of[bone] for bone in bones], "inverseBindMatrices": buffer.add(inverse, 5126, "MAT4")}
    nodes[0]["extras"] = {
        "rig": {
            "bones": {bone: {"parent": rig[bone][0], "position": scaled(rig[bone][1])} for bone in bones},
            "ends": {bone: scaled(position) for bone, position in ends.items()},
            "eye": scaled(marks.eye + [0, marks.offset, 0]),
            "crown": round(float((marks.crown + marks.offset) * scale), 5),
            "scale": scale,
        }
    }
    roots = [0] + [node_of[bone] for bone in bones if rig[bone][0] is None]
    document = {
        "asset": {"version": "2.0", "generator": "alas-stable tools/rider"},
        "extensionsUsed": ["KHR_mesh_quantization"],
        "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0,
        "scenes": [{"nodes": roots}],
        "nodes": nodes,
        "meshes": [{"name": name, "primitives": primitives}],
        "materials": materials,
        "skins": [skin],
        "accessors": buffer.accessors,
        "bufferViews": buffer.views,
        "buffers": [{"byteLength": len(buffer.data)}],
    }
    text = json.dumps(document, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    binary = bytes(buffer.data) + b"\0" * (-len(buffer.data) % 4)
    path = os.path.join(directory, "rider.glb")
    with open(path, "wb") as file:
        file.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + 8 + len(binary)))
        file.write(struct.pack("<I4s", len(text), b"JSON") + text)
        file.write(struct.pack("<I4s", len(binary), b"BIN\0") + binary)
    print("wrote", path, f"{len(everything)} vertices, {len(all_triangles)} triangles")
    for file_name in sorted(os.listdir(directory)):
        print(f"  {file_name:20s} {os.path.getsize(os.path.join(directory, file_name)) / 1024:8.0f} kB")
