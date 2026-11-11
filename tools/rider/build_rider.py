"""Builds a rider asset from MakeHuman's CC0 base mesh.

    python3 tools/rider/build_rider.py --makehuman DIR --assets DIR [--character adult-female] [--preview DIR]

See `tools/rider/README.md` for where the two source directories come from.
The figure is morphed, dressed (`outfit.py`), given the game skeleton
(`skeleton.py`) and painted textures (`textures.py`), then written to
`src/assets/riders/<character>/`.
"""

import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import makehuman  # noqa: E402
import meshops  # noqa: E402
import outfit  # noqa: E402
import skeleton  # noqa: E402
from characters import CHARACTERS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
# The game world is 1.6 times life size.
GAME_SCALE = 1.6


def assemble(mh, character):
    """All parts of the figure in metres, with the soles of the boots on y = 0."""
    base = mh.morph(character["macros"], character.get("details", ())) * 0.1
    base[:, 1] -= base[: makehuman.BODY_VERTICES, 1].min()
    joints, ends, weights = skeleton.build(mh, base)
    body = base[: makehuman.BODY_VERTICES]
    eyes, _ = mh.helper(base, "helper-l-eye")
    marks = outfit.Landmarks(joints, ends, body, eyes.vertices)
    top, breeches, boots = outfit.garments(mh, base, weights, marks)
    skin = outfit.skin(mh, base, weights, marks)
    helmet, shell, centre = outfit.helmet(marks)
    hair, band, tail = outfit.hair(mh, base, weights, marks, shell, centre)
    strap, buckle = outfit.belt(breeches, marks)
    parts = [
        skin,
        outfit.fitted_asset(mh, base, "eyes/low-poly", "low-poly", "eyes"),
        outfit.fitted_asset(mh, base, f"eyebrows/{character['eyebrows']}", character["eyebrows"], "lashes"),
        outfit.fitted_asset(mh, base, f"eyelashes/{character['eyelashes']}", character["eyelashes"], "lashes"),
        top,
        breeches,
        boots,
        outfit.soles(boots, marks),
        outfit.gloves(mh, base, weights, marks),
        strap,
        buckle,
        helmet,
        outfit.harness(marks, skin, shell),
        hair,
        band,
    ]
    names = skeleton.NAMES + outfit.TAIL_BONES
    for part in parts:
        missing = len(names) - part.weights.shape[1]
        if missing:
            part.weights = np.hstack([part.weights, np.zeros((len(part.vertices), missing), np.float32)])
        part.vertices[:, 1] += outfit.HEEL
    rig = {name: (parent, position + [0, outfit.HEEL, 0]) for name, (parent, position) in joints.items()}
    parent = "head"
    for name, position in zip(outfit.TAIL_BONES, tail):
        rig[name] = (parent, position + [0, outfit.HEEL, 0])
        parent = name
    ends = {name: position + [0, outfit.HEEL, 0] for name, position in ends.items()}
    marks.offset = outfit.HEEL
    return parts, rig, ends, marks


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--makehuman", required=True, help="checkout of makehumancommunity/makehuman")
    parser.add_argument("--assets", required=True, help="unpacked makehuman_system_assets_cc0.zip")
    parser.add_argument("--character", default="adult-female", choices=sorted(CHARACTERS))
    parser.add_argument("--preview", help="directory for Blender preview renders (needs bpy)")
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args()
    character = CHARACTERS[args.character]
    mh = makehuman.MakeHuman(args.makehuman, args.assets)
    parts, rig, ends, marks = assemble(mh, character)
    for part in parts:
        print(f"{part.material:10s} {len(part.vertices):6d} vertices {len(part.faces):6d} faces")
    if args.preview:
        import preview

        preview.render(parts, args.preview, args.character)
    if args.no_export:
        return
    import export

    export.write(args.character, character, mh, parts, rig, ends, marks, os.path.join(ROOT, "src", "assets", "riders", args.character), GAME_SCALE)


if __name__ == "__main__":
    main()
