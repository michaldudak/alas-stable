"""Draws the sculpture's side outline over a reference photograph.

    python3 tools/horse/overlay.py PHOTO OUT.png --hind X --fore X --ground Y --withers Y

The photo must show a horse from the side, facing right. Give the pixel
columns of the middle of the hind and fore cannons and the rows of the ground
and the top of the withers; the outline is scaled and placed to match.
"""

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import anatomy  # noqa: E402


def main(argv):
    option = lambda name: float(argv[argv.index(name) + 1])  # noqa: E731
    photo = Image.open(argv[0]).convert("RGB")
    voxel = 0.008
    half, origin = anatomy.field(voxel=voxel)
    solid = (half < 0).any(axis=0)  # rows y, columns z
    hind_z, fore_z = anatomy.HIND["fetlock"][1], anatomy.FORE["fetlock"][1]
    per_unit = (option("--fore") - option("--hind")) / (fore_z - hind_z)
    width, height = photo.size
    xs, ys = np.meshgrid(np.arange(width), np.arange(height))
    z = (xs - option("--hind")) / per_unit + hind_z
    y = (option("--ground") - ys) / per_unit
    row = np.round((y - origin[1]) / voxel).astype(int)
    column = np.round((z - origin[2]) / voxel).astype(int)
    inside = (row >= 0) & (row < solid.shape[0]) & (column >= 0) & (column < solid.shape[1])
    mask = np.zeros((height, width), bool)
    mask[inside] = solid[row[inside], column[inside]]
    edge = mask ^ np.roll(mask, 1, axis=0) | mask ^ np.roll(mask, 1, axis=1)
    for shift in (1, -1):
        edge |= np.roll(edge, shift, axis=0) | np.roll(edge, shift, axis=1)
    pixels = np.asarray(photo).copy()
    pixels[edge] = (255, 0, 0)
    Image.fromarray(pixels).save(argv[1])


if __name__ == "__main__":
    main(sys.argv[1:])
