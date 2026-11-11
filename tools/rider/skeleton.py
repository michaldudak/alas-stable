"""The game skeleton, reduced from MakeHuman's default rig.

Each game bone starts at the head joint of one MakeHuman bone and collects
the skin weights of the bones listed for it; anything unlisted falls to its
nearest listed ancestor (so the whole face follows `head`). `.L` bones are on
the figure's left (+X); the right side mirrors the table.
"""

import numpy as np

FINGERS = ["thumb", "index", "middle", "ring", "pinky"]

# name, parent, MakeHuman bone whose head is the joint, further bones merged in.
_CENTRE = [
    ("hips", None, "root", ["pelvis.L", "pelvis.R", "spine05"]),
    ("spine", "hips", "spine04", ["spine03"]),
    ("chest", "spine", "spine02", ["spine01", "breast.L", "breast.R"]),
    ("neck", "chest", "neck01", ["neck02"]),
    ("head", "neck", "neck03", ["head"]),
]
_SIDE = [
    ("clavicle", "chest", "clavicle", ["shoulder01"]),
    ("arm", "clavicle", "upperarm01", []),
    ("armTwist", "arm", "upperarm02", []),
    ("forearm", "armTwist", "lowerarm01", []),
    ("forearmTwist", "forearm", "lowerarm02", []),
    ("hand", "forearmTwist", "wrist", ["metacarpal1", "metacarpal2", "metacarpal3", "metacarpal4"]),
    ("thigh", "hips", "upperleg01", []),
    ("thighTwist", "thigh", "upperleg02", []),
    ("shin", "thighTwist", "lowerleg01", ["lowerleg02"]),
    ("foot", "shin", "foot", []),
    ("toe", "foot", "toe1-1", []),
]
# Where each chain ends, as the tail of a MakeHuman bone.
_ENDS = {"head": "head", "toeL": "toe1-2.L", "toeR": "toe1-2.R"}


def _table():
    rows = [(name, parent, source, list(extra)) for name, parent, source, extra in _CENTRE]
    for side in ("L", "R"):
        for name, parent, source, extra in _SIDE:
            rows.append(
                (
                    name + side,
                    parent if parent in ("chest", "hips") else parent + side,
                    f"{source}.{side}",
                    [f"{bone}.{side}" for bone in extra],
                )
            )
        for digit, finger in enumerate(FINGERS, start=1):
            for joint in (1, 2, 3):
                rows.append(
                    (
                        f"{finger}{joint}{side}",
                        f"hand{side}" if joint == 1 else f"{finger}{joint - 1}{side}",
                        f"finger{digit}-{joint}.{side}",
                        [],
                    )
                )
    return rows


TABLE = _table()
NAMES = [row[0] for row in TABLE]


def build(mh, vertices):
    """Joint positions and the merged weight matrix for morphed base vertices.

    Returns (joints, ends, weights): joints maps bone -> (parent, position),
    ends maps the last bone of each chain to its tip, and weights is
    (base vertices, bones).
    """
    bones = mh.bones(vertices)
    joints = {name: (parent, bones[source][1]) for name, parent, source, _ in TABLE}
    ends = {name: bones[source][2] for name, source in _ENDS.items()}
    for side in ("L", "R"):
        ends[f"hand{side}"] = bones[f"finger3-1.{side}"][1]
        for digit, finger in enumerate(FINGERS, start=1):
            ends[f"{finger}3{side}"] = bones[f"finger{digit}-3.{side}"][2]

    owner = {}
    for name, _, source, extra in TABLE:
        for bone in [source] + extra:
            owner[bone] = name

    def resolve(bone):
        while bone not in owner:
            bone = bones[bone][0]
        return owner[bone]

    source_names = list(bones)
    source = mh.bone_weights(source_names)
    weights = np.zeros((source.shape[0], len(NAMES)), np.float32)
    for column, bone in enumerate(source_names):
        weights[:, NAMES.index(resolve(bone))] += source[:, column]
    total = weights.sum(axis=1, keepdims=True)
    weights /= np.where(total > 0, total, 1)
    return joints, ends, weights
