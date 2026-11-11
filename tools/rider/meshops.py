"""Small mesh toolkit for the rider build: parts, subdivision, loops and normals."""

from collections import defaultdict

import numpy as np


class Part:
    """A piece of the figure drawn with one material.

    `faces` are triangles or quads over `vertices`; `uvs` holds one UV per
    face corner (same nesting as `faces`); `weights` is (vertices, bones).
    """

    def __init__(self, material, vertices, faces, weights, uvs=None):
        self.material = material
        self.vertices = np.asarray(vertices, np.float64)
        self.faces = [list(face) for face in faces]
        self.weights = np.asarray(weights, np.float32)
        self.uvs = uvs if uvs is not None else [[(0.0, 0.0)] * len(face) for face in self.faces]

    def subset(self, keep, material=None):
        """The faces flagged in `keep`, with unused vertices dropped."""
        faces = [face for face, flag in zip(self.faces, keep) if flag]
        uvs = [uv for uv, flag in zip(self.uvs, keep) if flag]
        used = sorted({v for face in faces for v in face})
        remap = {v: i for i, v in enumerate(used)}
        return Part(
            material or self.material,
            self.vertices[used],
            [[remap[v] for v in face] for face in faces],
            self.weights[used],
            uvs,
        )


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, np.float64) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def face_normals(vertices, faces):
    result = np.zeros((len(faces), 3))
    for i, face in enumerate(faces):
        points = vertices[face]
        # Newell's method copes with slightly bent quads.
        result[i] = np.cross(points - np.roll(points, 1, axis=0), points + np.roll(points, 1, axis=0)).sum(axis=0)
    return -result / 2


def vertex_normals(vertices, faces):
    """Area-weighted normals; vertices at the same position share one."""
    keys = np.round(vertices / 1e-5).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    inverse = inverse.ravel()
    total = np.zeros((inverse.max() + 1, 3))
    areas = face_normals(vertices, faces)
    for face, normal in zip(faces, areas):
        total[inverse[face]] += normal
    normals = total[inverse]
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    return normals / np.where(length > 1e-12, length, 1)


def neighbours(count, faces):
    """Edge-connected vertex neighbours as a list of sets."""
    result = [set() for _ in range(count)]
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            result[a].add(b)
            result[b].add(a)
    return result


def boundary_loops(faces):
    """Ordered vertex loops along open edges."""
    count = defaultdict(int)
    directed = {}
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            count[(min(a, b), max(a, b))] += 1
            directed[(a, b)] = True
    following = {a: b for (a, b) in directed if count[(min(a, b), max(a, b))] == 1}
    loops = []
    while following:
        start = next(iter(following))
        loop = [start]
        current = following.pop(start)
        while current != start and current in following:
            loop.append(current)
            current = following.pop(current)
        loops.append(loop)
    return loops


def subdivide(vertices, faces, weights):
    """One round of Catmull-Clark; weights follow the same stencils."""
    count = len(vertices)
    edge_faces = defaultdict(list)
    for index, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edge_faces[(min(a, b), max(a, b))].append(index)
    edges = list(edge_faces)
    edge_index = {edge: i for i, edge in enumerate(edges)}
    face_start = count
    edge_start = count + len(faces)
    total = edge_start + len(edges)
    rows, cols, values = [], [], []

    def stencil(row, entries):
        for col, value in entries:
            rows.append(row)
            cols.append(col)
            values.append(value)

    for index, face in enumerate(faces):
        stencil(face_start + index, [(v, 1 / len(face)) for v in face])
    face_stencils = [[(v, 1 / len(face)) for v in face] for face in faces]
    for edge, around in edge_faces.items():
        row = edge_start + edge_index[edge]
        if len(around) == 2:
            stencil(row, [(edge[0], 0.25), (edge[1], 0.25)])
            for f in around:
                stencil(row, [(v, w * 0.25) for v, w in face_stencils[f]])
        else:
            stencil(row, [(edge[0], 0.5), (edge[1], 0.5)])
    vertex_faces = defaultdict(list)
    vertex_edges = defaultdict(list)
    for index, face in enumerate(faces):
        for v in face:
            vertex_faces[v].append(index)
    for edge, around in edge_faces.items():
        for v in edge:
            vertex_edges[v].append((edge, len(around)))
    for v in range(count):
        around = vertex_edges[v]
        border = [edge for edge, uses in around if uses == 1]
        if border:
            stencil(v, [(v, 0.75)])
            for edge in border:
                stencil(v, [(edge[0] if edge[1] == v else edge[1], 0.125)])
            continue
        n = len(around)
        if n == 0:
            stencil(v, [(v, 1.0)])
            continue
        stencil(v, [(v, (n - 3) / n)])
        for f in vertex_faces[v]:
            stencil(v, [(u, w / (n * len(vertex_faces[v]))) for u, w in face_stencils[f]])
        for edge, _ in around:
            stencil(v, [(edge[0], 1 / (n * n)), (edge[1], 1 / (n * n))])
    rows, cols, values = np.array(rows), np.array(cols), np.array(values)

    def apply(attribute):
        out = np.zeros((total,) + attribute.shape[1:], np.float64)
        np.add.at(out, rows, attribute[cols] * values[:, None])
        return out

    quads = []
    for index, face in enumerate(faces):
        n = len(face)
        for i, v in enumerate(face):
            before, after = face[i - 1], face[(i + 1) % n]
            quads.append(
                [
                    v,
                    edge_start + edge_index[(min(v, after), max(v, after))],
                    face_start + index,
                    edge_start + edge_index[(min(v, before), max(v, before))],
                ]
            )
    return apply(vertices), quads, apply(weights.astype(np.float64)).astype(np.float32)


def nearest(points, targets, chunk=512):
    """Index of the closest target for every point (brute force)."""
    result = np.empty(len(points), np.int64)
    for start in range(0, len(points), chunk):
        block = points[start : start + chunk]
        distance = ((block[:, None, :] - targets[None, :, :]) ** 2).sum(axis=2)
        result[start : start + chunk] = distance.argmin(axis=1)
    return result


def add_lip(part, loop, inward, depth):
    """Folds an open edge inwards so the garment shows some thickness.

    `inward` gives each loop vertex a direction (rows match `loop`); the new
    ring sits `depth` along it and reuses the loop's weights and UVs.
    """
    start = len(part.vertices)
    part.vertices = np.vstack([part.vertices, part.vertices[loop] + inward * depth])
    part.weights = np.vstack([part.weights, part.weights[loop]])
    corner_uv = {}
    for face, uv in zip(part.faces, part.uvs):
        for v, coordinate in zip(face, uv):
            corner_uv.setdefault(v, coordinate)
    n = len(loop)
    for i in range(n):
        a, b = loop[i], loop[(i + 1) % n]
        # Boundary loops run with the surface on their left, so this faces outwards.
        part.faces.append([b, a, start + i, start + (i + 1) % n])
        part.uvs.append([corner_uv[b], corner_uv[a], corner_uv[a], corner_uv[b]])


def merge(parts, material=None):
    """Joins parts into one."""
    vertices, faces, weights, uvs = [], [], [], []
    offset = 0
    for part in parts:
        vertices.append(part.vertices)
        weights.append(part.weights)
        faces.extend([[v + offset for v in face] for face in part.faces])
        uvs.extend(part.uvs)
        offset += len(part.vertices)
    return Part(material or parts[0].material, np.vstack(vertices), faces, np.vstack(weights), uvs)
