"""Compares the sculpture's side silhouette with a reference photograph.

    python3 tools/horse/overlay.py PHOTO OUT.png --hind X --fore X --ground Y

The photo must show a horse from the side, facing right, on a white
background. Give the pixel columns of the middle of the hind and fore cannons
and the row of the ground; the sculpture is scaled and placed to match. Blue
marks where the sculpture covers background, green where it misses the horse.
"""

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import anatomy  # noqa: E402


def main(argv):
    option = lambda name: float(argv[argv.index(name) + 1])  # noqa: E731
    photo = np.asarray(Image.open(argv[0]).convert("RGB")).astype(int)
    voxel = 0.008
    half, origin = anatomy.field(voxel=voxel)
    solid = (half < 0).any(axis=0)  # rows y, columns z
    hind_z, fore_z = anatomy.HIND["fetlock"][1], anatomy.FORE["fetlock"][1]
    per_unit = (option("--fore") - option("--hind")) / (fore_z - hind_z)
    height, width = photo.shape[:2]
    xs, ys = np.meshgrid(np.arange(width), np.arange(height))
    z = (xs - option("--hind")) / per_unit + hind_z
    y = (option("--ground") - ys) / per_unit
    row = np.round((y - origin[1]) / voxel).astype(int)
    column = np.round((z - origin[2]) / voxel).astype(int)
    inside = (row >= 0) & (row < solid.shape[0]) & (column >= 0) & (column < solid.shape[1])
    sculpture = np.zeros((height, width), bool)
    sculpture[inside] = solid[row[inside], column[inside]]
    horse = photo.min(axis=2) < 235
    photo[sculpture & ~horse] = (60, 90, 255)
    photo[horse & ~sculpture] = (0, 200, 0)
    Image.fromarray(photo.astype(np.uint8)).save(argv[1])


if __name__ == "__main__":
    main(sys.argv[1:])
