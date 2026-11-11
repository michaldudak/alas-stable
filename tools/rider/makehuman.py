"""Reads MakeHuman's CC0 base mesh, morph targets, fitted assets and rig.

Pure numpy, so it runs with or without Blender. Everything stays in
MakeHuman's own space (decimetres, +Y up, facing +Z, the figure's left at +X)
until `build_rider.py` scales it into game units.

`SOURCE` is a checkout of https://github.com/makehumancommunity/makehuman and
`ASSETS` the unpacked `makehuman_system_assets_cc0.zip`; see `README.md`.
"""

import itertools
import json
import os

import numpy as np

BODY_VERTICES = 13380


class Mesh:
    """Polygons with a UV per corner. `groups` names the source group of each face."""

    def __init__(self, vertices, uvs, faces, face_uvs, groups=None):
        self.vertices = vertices
        self.uvs = uvs
        self.faces = faces
        self.face_uvs = face_uvs
        self.groups = groups if groups is not None else [""] * len(faces)


def read_obj(path):
    vertices, uvs, faces, face_uvs, groups = [], [], [], [], []
    group = ""
    with open(path, encoding="utf-8") as file:
        for line in file:
            if line.startswith("v "):
                vertices.append([float(v) for v in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(v) for v in line.split()[1:3]])
            elif line.startswith("g "):
                group = line.split()[1]
            elif line.startswith("f "):
                corners = [corner.split("/") for corner in line.split()[1:]]
                faces.append([int(c[0]) - 1 for c in corners])
                face_uvs.append([int(c[1]) - 1 if len(c) > 1 and c[1] else 0 for c in corners])
                groups.append(group)
    return Mesh(
        np.array(vertices, np.float64),
        np.array(uvs, np.float64) if uvs else np.zeros((1, 2)),
        faces,
        face_uvs,
        groups,
    )


def _levels(value, names):
    """Splits a 0-1 slider into weights for its (low, middle, high) targets."""
    low, middle, high = names
    weights = {low: max(0.0, 1 - 2 * value), middle: 1 - abs(2 * value - 1), high: max(0.0, 2 * value - 1)}
    return {name: weight for name, weight in weights.items() if weight > 1e-6}


def _ages(age):
    """MakeHuman's age slider: baby 0, child 0.1875, young adult 0.5, old 1."""
    if age < 0.1875:
        t = age / 0.1875
        weights = {"baby": 1 - t, "child": t}
    elif age < 0.5:
        t = (age - 0.1875) / 0.3125
        weights = {"child": 1 - t, "young": t}
    else:
        t = (age - 0.5) * 2
        weights = {"young": 1 - t, "old": t}
    return {name: weight for name, weight in weights.items() if weight > 1e-6}


class MakeHuman:
    def __init__(self, source, assets):
        self.data = os.path.join(source, "makehuman", "data")
        self.assets = assets
        self.base = read_obj(os.path.join(self.data, "3dobjs", "base.obj"))
        with open(os.path.join(self.data, "rigs", "default.mhskel"), encoding="utf-8") as file:
            self.skeleton = json.load(file)
        with open(os.path.join(self.data, "rigs", "default_weights.mhw"), encoding="utf-8") as file:
            self.weights = json.load(file)["weights"]

    def target(self, name):
        """Sparse offsets of one morph target as (indices, deltas), or None."""
        path = os.path.join(self.data, "targets", name + ".target")
        if not os.path.exists(path):
            return None
        rows = [line.split() for line in open(path, encoding="utf-8") if line[:1].isdigit()]
        if not rows:
            return None
        rows = np.array(rows, np.float64)
        return rows[:, 0].astype(int), rows[:, 1:4]

    def macro_targets(self, macros):
        """The weighted targets behind MakeHuman's main sliders."""
        gender = {"female": 1 - macros.get("gender", 0.0), "male": macros.get("gender", 0.0)}
        gender = {name: weight for name, weight in gender.items() if weight > 1e-6}
        ages = _ages(macros.get("age", 0.5))
        muscle = _levels(macros.get("muscle", 0.5), ("minmuscle", "averagemuscle", "maxmuscle"))
        weight = _levels(macros.get("weight", 0.5), ("minweight", "averageweight", "maxweight"))
        height = _levels(macros.get("height", 0.5), ("minheight", "", "maxheight"))
        proportions = _levels(macros.get("proportions", 0.5), ("uncommonproportions", "", "idealproportions"))
        cup = _levels(macros.get("cup", 0.5), ("mincup", "averagecup", "maxcup"))
        firmness = _levels(macros.get("firmness", 0.5), ("minfirmness", "averagefirmness", "maxfirmness"))
        races = macros.get("race", {"caucasian": 1.0})

        def combos(*axes):
            for parts in itertools.product(*(axis.items() for axis in axes)):
                yield [name for name, _ in parts], float(np.prod([weight for _, weight in parts]))

        result = []
        for names, amount in combos(races, gender, ages):
            result.append(("macrodetails/" + "-".join(names), amount))
        for names, amount in combos(gender, ages, muscle, weight):
            result.append(("macrodetails/universal-" + "-".join(names), amount))
        for names, amount in combos(gender, ages, muscle, weight, height):
            if names[-1]:
                result.append(("macrodetails/height/" + "-".join(names), amount))
        for names, amount in combos(gender, ages, muscle, weight, proportions):
            if names[-1]:
                result.append(("macrodetails/proportions/" + "-".join(names), amount))
        if "female" in gender:
            for names, amount in combos({"female": gender["female"]}, ages, muscle, weight, cup, firmness):
                if "averagecup-averagefirmness" not in "-".join(names):
                    result.append(("breast/" + "-".join(names), amount))
        return result

    def morph(self, macros, details=()):
        """Base mesh vertices (helpers included) for a character."""
        vertices = self.base.vertices.copy()
        for name, amount in list(self.macro_targets(macros)) + list(details):
            target = self.target(name)
            if target is None:
                if not name.startswith(("macrodetails/", "breast/")):
                    raise FileNotFoundError(name)
                continue
            indices, deltas = target
            vertices[indices] += deltas * amount
        return vertices

    def joints(self, vertices):
        """Joint positions of the default rig: the mean of each joint's helper vertices."""
        return {
            name: vertices[indices].mean(axis=0) for name, indices in self.skeleton["joints"].items()
        }

    def bones(self, vertices):
        """name -> (parent, head, tail) of the default rig for these vertices."""
        joints = self.joints(vertices)
        return {
            name: (bone["parent"], joints[bone["head"]], joints[bone["tail"]])
            for name, bone in self.skeleton["bones"].items()
        }

    def bone_weights(self, names):
        """Dense (vertices, bones) weight matrix of the default rig."""
        matrix = np.zeros((len(self.base.vertices), len(names)), np.float32)
        index = {name: i for i, name in enumerate(names)}
        for name, pairs in self.weights.items():
            if pairs:
                pairs = np.array(pairs)
                matrix[pairs[:, 0].astype(int), index[name]] += pairs[:, 1]
        return matrix

    def body(self, vertices):
        """The body without helper geometry, as a Mesh sharing vertex indices with the base."""
        keep = [i for i, group in enumerate(self.base.groups) if group == "body"]
        return Mesh(
            vertices[:BODY_VERTICES],
            self.base.uvs,
            [self.base.faces[i] for i in keep],
            [self.base.face_uvs[i] for i in keep],
        )

    def helper(self, vertices, group):
        """One helper group (for example `helper-tights`) with compact vertex indices.

        Returns the mesh and, per vertex, its index in the base mesh.
        """
        keep = [i for i, name in enumerate(self.base.groups) if name == group]
        used = sorted({v for i in keep for v in self.base.faces[i]})
        remap = {v: i for i, v in enumerate(used)}
        mesh = Mesh(
            vertices[used],
            self.base.uvs,
            [[remap[v] for v in self.base.faces[i]] for i in keep],
            [self.base.face_uvs[i] for i in keep],
        )
        return mesh, np.array(used)

    def fitted(self, folder, name, vertices):
        """An asset (hair, eyes, shoes...) fitted to the morphed base through its .mhclo.

        Returns the mesh, the three base vertices and weights each vertex hangs
        from (to carry skin weights across) and the asset's directory.
        """
        directory = os.path.join(self.assets, folder)
        scales, rows, obj, reading = {}, [], None, False
        with open(os.path.join(directory, name + ".mhclo"), encoding="utf-8") as file:
            for line in file:
                words = line.split()
                if not words or words[0].startswith("#"):
                    continue
                if words[0] in ("x_scale", "y_scale", "z_scale"):
                    scales["xyz".index(words[0][0])] = (int(words[1]), int(words[2]), float(words[3]))
                elif words[0] == "obj_file":
                    obj = words[1]
                elif words[0] == "verts":
                    reading = True
                elif words[0] == "delete_verts":
                    reading = False
                elif reading and words[0][0].isdigit():
                    if len(words) == 1:
                        v = int(words[0])
                        rows.append([v, v, v, 1, 0, 0, 0, 0, 0])
                    else:
                        rows.append([float(w) for w in words[:9]])
        mesh = read_obj(os.path.join(directory, obj))
        rows = np.array(rows)[: len(mesh.vertices)]
        anchors = rows[:, :3].astype(int)
        weights = rows[:, 3:6]
        scale = np.ones(3)
        for axis, (a, b, size) in scales.items():
            scale[axis] = abs(vertices[a][axis] - vertices[b][axis]) / size
        mesh.vertices = (vertices[anchors] * weights[:, :, None]).sum(axis=1) + rows[:, 6:9] * scale
        return mesh, anchors, weights, directory
