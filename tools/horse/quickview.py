"""Quick shaded views of the sculpture without Blender.

    python3 tools/horse/quickview.py OUT.png [--voxel 0.016]

Casts axis-aligned rays through the distance field and shades the first
surface they meet, so proportions can be compared with photographs in a few
seconds while editing `anatomy.py`.
"""

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import anatomy  # noqa: E402

LIGHT = np.array([0.45, 0.75, 0.5])


def shade(depth_axis, grid, voxel, flip=False):
    """Image of the surface seen along one grid axis (from the high end unless `flip`)."""
    inside = grid < 0
    volume = np.moveaxis(inside, depth_axis, 0)
    if not flip:
        volume = volume[::-1]
    first = volume.argmax(axis=0)
    hit = volume.any(axis=0)
    gradient = np.stack(np.gradient(grid, voxel), -1)
    gradient = np.moveaxis(gradient, depth_axis, 0)
    if not flip:
        gradient = gradient[::-1]
    normal = np.take_along_axis(gradient, first[None, ..., None], axis=0)[0]
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True) + 1e-9
    light = LIGHT.copy()
    if flip:
        light[depth_axis] *= -1
    tone = 0.25 + 0.75 * np.clip(normal @ (light / np.linalg.norm(light)), 0, 1)
    return np.where(hit, tone, 1.0)


def main(argv):
    voxel = float(argv[argv.index("--voxel") + 1]) if "--voxel" in argv else 0.016
    half, _ = anatomy.field(voxel=voxel)
    grid = anatomy.mirrored(half)  # axes: x, y, z
    side = shade(0, grid, voxel).T[::-1].T  # rows y, columns z
    side = shade(0, grid, voxel)[::-1, ::-1]  # y up, head to the left
    front = shade(2, grid, voxel).T[::-1]  # rows y, columns x
    rear = shade(2, grid, voxel, flip=True).T[::-1, ::-1]
    top = shade(1, grid, voxel)[:, ::-1]  # rows x, columns z
    height = side.shape[0]
    tiles = [side, front, rear]
    canvas = np.ones((height + top.shape[0] + 10, sum(t.shape[1] for t in tiles) + 20))
    x = 0
    for tile in tiles:
        canvas[: tile.shape[0], x : x + tile.shape[1]] = tile
        x += tile.shape[1] + 10
    canvas[height + 10 :, : top.shape[1]] = top
    Image.fromarray((canvas * 255).astype(np.uint8)).save(argv[0])


if __name__ == "__main__":
    main(sys.argv[1:])
