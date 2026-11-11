"""Paints the outfit's detail and normal maps, and crops the face textures.

Each garment has a slot of the atlas (`outfit.SLOTS`) whose axes are the
garment's own coordinates: the turn around a limb and the distance along it.
The detail map is a grey multiplier for the material colour, so garments can
be dyed in the game; seams, zips, wrinkles and weave also go into a height
field that becomes the tangent-space normal map.
"""

import math
import os

import numpy as np
from PIL import Image

import outfit
from meshops import smoothstep

SIZE = 2048


def noise(shape, cells, seed, stretch=(1, 1)):
    """Smooth value noise in 0-1 with about `cells` features across the slot."""
    rng = np.random.default_rng(seed)
    grid = (max(2, int(cells * stretch[0])), max(2, int(cells * stretch[1])))
    image = Image.fromarray((rng.random(grid) * 255).astype(np.uint8))
    return np.asarray(image.resize((shape[1], shape[0]), Image.BICUBIC), np.float64) / 255


def line(distance, width):
    """1 on a line of the given half-width, fading to 0 at its edge."""
    return 1 - smoothstep(width * 0.5, width, np.abs(distance))


class Canvas:
    def __init__(self):
        self.colour = np.full((SIZE, SIZE), 0.9)
        self.height = np.zeros((SIZE, SIZE))
        # Metres per pixel along each axis, for turning height into slope.
        self.scale = np.full((SIZE, SIZE, 2), 0.001)

    def slot(self, name, width, length):
        """Coordinates of a slot: (s, t, view) with s the turn (0-1 between
        seams, overhanging a little), t the position along, and `view` the
        row/column slices. `width`/`length` are the slot's size in metres."""
        u0, v0, u1, v1 = outfit.SLOTS[name]
        columns = slice(int(u0 * SIZE), int(u1 * SIZE))
        rows = slice(int((1 - v1) * SIZE), int((1 - v0) * SIZE))
        nu, nv = columns.stop - columns.start, rows.stop - rows.start
        u = (np.arange(nu) + 0.5) / nu
        v = 1 - (np.arange(nv) + 0.5) / nv
        s = u * (1 + 2 * outfit.OVERHANG) - outfit.OVERHANG
        self.scale[rows, columns, 0] = width * (1 + 2 * outfit.OVERHANG) / nu
        self.scale[rows, columns, 1] = length / nv
        return np.meshgrid(s, v)[0], np.meshgrid(s, v)[1], (rows, columns)

    def paint(self, view, colour, height):
        self.colour[view] = np.clip(colour, 0, 1)
        self.height[view] = height

    def normal_map(self):
        dy, dx = np.gradient(self.height)
        slope_u = dx / self.scale[..., 0]
        # Rows run downwards while v runs upwards.
        slope_v = -dy / self.scale[..., 1]
        normal = np.stack([-slope_u, -slope_v, np.ones_like(slope_u)], -1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
        return ((normal * 0.5 + 0.5) * 255).round().astype(np.uint8)


def paint_outfit(marks):
    canvas = Canvas()
    j = marks.joints

    # --- Torso of the training top.
    y0, y1 = marks.waist - 0.08, marks.neck + 0.09
    s, t, view = canvas.slot("torso", 0.86, y1 - y0)
    y = y0 + t * (y1 - y0)
    across = (s - 0.5) * 0.86
    knit = noise(s.shape, 220, 1) - 0.5
    colour = 0.92 + 0.035 * knit + 0.03 * (noise(s.shape, 9, 2) - 0.5)
    height = 0.00012 * knit
    zipped = y > marks.neck - 0.15
    teeth = 0.5 + 0.5 * np.sin(y * TAU_PER_METRE(0.0022))
    zip_line = line(across, 0.0032) * zipped
    colour -= zip_line * (0.42 + 0.14 * teeth)
    height += 0.0009 * zip_line
    for offset in (-0.011, 0.011):
        stitch = line(across - offset, 0.0011) * zipped
        colour -= 0.13 * stitch
        height -= 0.0004 * stitch
    # A zip pull at the collar.
    pull = (np.abs(across) < 0.0045) & (np.abs(y - (marks.neck + 0.012)) < 0.011)
    colour = np.where(pull, 0.32, colour)
    height += 0.0018 * pull
    collar = line(y - (marks.neck - 0.006), 0.0016)
    colour -= 0.14 * collar
    height -= 0.0007 * collar
    # Side panels of a lighter mesh, joined by flat seams.
    side = np.minimum(np.abs(s - 0.25), np.abs(s - 0.75)) * 0.86
    panel = 1 - smoothstep(0.036, 0.04, side)
    mesh = 0.5 + 0.5 * np.sin(across * TAU_PER_METRE(0.0035)) * np.sin(y * TAU_PER_METRE(0.0035))
    colour -= panel * (0.07 + 0.05 * mesh)
    seam = line(side - 0.04, 0.0014)
    colour -= 0.16 * seam
    height += 0.0005 * line(side - 0.04, 0.003) - 0.0005 * seam
    # Soft folds where the shirt is tucked in at the waist and under the arms.
    waist = smoothstep(marks.waist + 0.13, marks.waist + 0.02, y) * smoothstep(marks.waist - 0.03, marks.waist + 0.02, y)
    wobble = noise(s.shape, 5, 3, (3, 1)) * 5
    folds = np.sin(y * TAU_PER_METRE(0.03) + wobble) * (0.45 + 0.55 * noise(s.shape, 7, 4))
    height += 0.0022 * folds * waist
    colour += 0.03 * folds * waist
    armpit = np.exp(-((y - (j["armL"][1] - 0.08)) / 0.05) ** 2) * np.exp(-(side / 0.07) ** 2)
    pulls = np.sin((y + side * 0.9) * TAU_PER_METRE(0.022) + wobble)
    height += 0.0016 * pulls * armpit
    canvas.paint(view, colour, height)

    # --- Sleeves.
    s, t, view = canvas.slot("sleeve", 0.27, 0.62)
    along = (t - 0.12) / 0.86
    knit = noise(s.shape, 160, 5) - 0.5
    colour = 0.92 + 0.035 * knit + 0.03 * (noise(s.shape, 6, 6) - 0.5)
    height = 0.00012 * knit
    under = np.minimum(s, 1 - s) * 0.27
    seam = line(under, 0.0014)
    colour -= 0.14 * seam
    height -= 0.0005 * seam
    elbow = np.exp(-((along - 0.5) / 0.1) ** 2)
    wobble = noise(s.shape, 4, 7, (1, 3)) * 5
    creases = np.sin(along * 0.6 * TAU_PER_METRE(0.024) + wobble) * (0.4 + 0.6 * noise(s.shape, 6, 8))
    height += 0.002 * creases * elbow
    colour += 0.03 * creases * elbow
    cuff = line(along - 0.9, 0.004)
    colour -= 0.12 * cuff
    height -= 0.0005 * cuff
    shoulder = line(along - 0.02, 0.004)
    colour -= 0.1 * shoulder
    canvas.paint(view, colour, height)

    # --- Breeches.
    low, high = marks.knee - 0.14, marks.waist + 0.01
    s, t, view = canvas.slot("leg", 0.56, high - low)
    y = low + t * (high - low)
    twill = np.sin((s * 0.56 + y) * TAU_PER_METRE(0.0016))
    cloth = noise(s.shape, 200, 9, (1, 2)) - 0.5
    colour = 0.93 + 0.02 * twill + 0.03 * cloth + 0.03 * (noise(s.shape, 6, 10) - 0.5)
    height = 0.00006 * twill + 0.0001 * cloth
    outer = (s - 0.5) * 0.56
    inner = np.minimum(s, 1 - s) * 0.56
    for distance in (outer, inner):
        seam = line(distance, 0.0013)
        colour -= 0.15 * seam
        height += 0.0004 * line(distance, 0.004) - 0.0006 * seam
    band = line(y - (marks.waist - 0.042), 0.0014)
    colour -= 0.13 * band
    height -= 0.0005 * band
    # A slanted front pocket, running from the waistband to the side seam.
    front = (0.5 - s) * 0.56
    depth = marks.waist - 0.042 - y
    pocket = line(front - 0.105 * (1 - np.clip(depth / 0.13, 0, 1)) ** 0.7, 0.0013) * (depth > 0) * (depth < 0.13)
    colour -= 0.14 * pocket
    height -= 0.0005 * pocket
    # Grip patches on the inside of the knee.
    knee_y = y - marks.knee
    patch = (1 - smoothstep(0.075, 0.08, inner)) * smoothstep(-0.15, -0.14, knee_y) * (1 - smoothstep(0.07, 0.085, knee_y + inner * 0.5))
    dots = (np.sin(s * 0.56 * TAU_PER_METRE(0.007)) * np.sin(y * TAU_PER_METRE(0.007)) > 0.55)
    colour -= patch * (0.045 + 0.06 * dots)
    height += patch * (0.0003 + 0.0003 * dots)
    edge = line(inner - 0.0775, 0.0013) * smoothstep(-0.15, -0.14, knee_y)
    colour -= 0.1 * edge * (knee_y + inner * 0.5 < 0.078)
    # Creases behind the knee and across the top of the thigh.
    back = np.exp(-(((s - 0.78) * 0.56) / 0.07) ** 2) * np.exp(-(knee_y / 0.045) ** 2)
    wobble = noise(s.shape, 4, 11, (3, 1)) * 4
    creases = np.sin(y * TAU_PER_METRE(0.017) + wobble)
    height += 0.0016 * creases * back
    colour += 0.035 * creases * back
    hip = np.exp(-(((s - 0.3) * 0.56) / 0.09) ** 2) * np.exp(-((y - (j["thighL"][1] - 0.035)) / 0.045) ** 2)
    slanted = np.sin((y + front * 0.55) * TAU_PER_METRE(0.024) + wobble)
    height += 0.0013 * slanted * hip
    colour += 0.025 * slanted * hip
    canvas.paint(view, colour, height)

    # --- Boot shafts: smooth leather that creases at the ankle.
    s, t, view = canvas.slot("shaft", 0.4, marks.knee)
    y = t * marks.knee
    grain = noise(s.shape, 260, 12) - 0.5
    colour = 0.9 + 0.035 * grain + 0.06 * (noise(s.shape, 7, 13) - 0.5)
    height = 0.00008 * grain
    back = (s - 0.75) * 0.4
    zip_line = line(back, 0.0022) * (y > marks.ankle + 0.02)
    colour -= 0.3 * zip_line
    height -= 0.0008 * zip_line
    for offset in (-0.009, 0.009):
        stitch = line(back - offset, 0.001) * (y > marks.ankle + 0.02)
        colour -= 0.12 * stitch
        height -= 0.0003 * stitch
    cuff = line(y - (marks.knee - 0.092), 0.0013)
    colour -= 0.13 * cuff
    height -= 0.0005 * cuff
    ankle = np.exp(-((y - (marks.ankle + 0.045)) / 0.05) ** 2)
    wobble = noise(s.shape, 5, 14, (3, 1)) * 5
    creases = np.sin(y * TAU_PER_METRE(0.021) + wobble) * (0.35 + 0.65 * noise(s.shape, 6, 15))
    height += 0.0028 * creases * ankle
    colour += 0.05 * creases * ankle
    canvas.paint(view, colour, height)

    # --- Boot feet.
    s, t, view = canvas.slot("foot", 0.3, 0.3)
    z = j["footL"][2] - 0.07 + t * 0.3
    grain = noise(s.shape, 200, 16) - 0.5
    colour = 0.9 + 0.035 * grain + 0.05 * (noise(s.shape, 6, 17) - 0.5)
    height = 0.00008 * grain
    top = np.abs(s - 0.5) * 0.3
    cap = line(z - (j["toeL"][2] + 0.035) + top * 0.35, 0.0013) * (top < 0.09)
    colour -= 0.14 * cap
    height -= 0.0005 * cap
    vamp = np.exp(-((z - (j["toeL"][2] - 0.012)) / 0.022) ** 2) * (top < 0.08)
    creases = np.sin(z * TAU_PER_METRE(0.013) + noise(s.shape, 4, 18, (3, 1)) * 4)
    height += 0.0012 * creases * vamp
    colour += 0.03 * creases * vamp
    counter = line(z - (j["footL"][2] - 0.012) - top * 0.2, 0.0013) * (top > 0.02)
    colour -= 0.1 * counter
    canvas.paint(view, colour, height)

    # --- Gloves, belt, straps, soles: plain grained surfaces.
    s, t, view = canvas.slot("glove", 0.25, 0.25)
    grain = noise(s.shape, 150, 19) - 0.5
    canvas.paint(view, 0.9 + 0.05 * grain + 0.04 * (noise(s.shape, 10, 20) - 0.5), 0.0001 * grain)
    s, t, view = canvas.slot("belt", 0.8, 0.03)
    grain = noise(s.shape, 120, 21, (4, 1)) - 0.5
    stitch = (line(t - 0.14, 0.035) + line(t - 0.86, 0.035)) * (np.sin(s * 0.8 * TAU_PER_METRE(0.005)) > -0.3)
    canvas.paint(view, 0.92 + 0.05 * grain - 0.22 * stitch, 0.0001 * grain - 0.0003 * stitch)
    s, t, view = canvas.slot("strap", 0.12, 0.016)
    weave = np.sin((s * 0.12 + t * 0.016) * TAU_PER_METRE(0.002)) * np.sin((s * 0.12 - t * 0.016) * TAU_PER_METRE(0.002))
    canvas.paint(view, 0.85 + 0.1 * weave, 0.00012 * weave)
    s, t, view = canvas.slot("sole", 0.6, 0.04)
    canvas.paint(view, 0.85 + 0.08 * (noise(s.shape, 60, 22) - 0.5) - 0.2 * line(t - 0.3, 0.02), 0 * s)

    # --- Helmet, seen from above: matt shell, glossy centre strip with vents.
    u0, v0, u1, v1 = outfit.SLOTS["helmet"]
    s, t, view = canvas.slot("helmet", 0.5, 0.5)
    u = (s + outfit.OVERHANG) / (1 + 2 * outfit.OVERHANG)
    x, z = (u - 0.5) / 0.48, (t - 0.5) / 0.48
    radius = np.hypot(x, z)
    flock = noise(s.shape, 240, 23) - 0.5
    colour = 0.9 + 0.05 * flock
    height = 0.00006 * flock
    strip = 1 - smoothstep(0.09, 0.1, np.abs(x) * (1 + 0.3 * radius))
    colour = np.where(strip > 0.5, 0.62, colour)
    edge = line(np.abs(x) * (1 + 0.3 * radius) - 0.1, 0.012)
    colour -= 0.25 * edge
    height -= 0.0006 * edge
    for position, length in ((0.42, 0.11), (0.62, 0.08), (-0.4, 0.1), (-0.62, 0.07)):
        for column in (-0.045, 0.045):
            vent = (np.abs(x - column) < 0.016) & (np.abs(z - position) < length / 2)
            colour = np.where(vent, 0.2, colour)
            height -= 0.0012 * vent
    rim = smoothstep(0.86, 0.88, radius)
    colour = np.where(rim > 0.5, 0.5 + 0.04 * flock, colour)
    height += 0.0006 * rim
    canvas.paint(view, colour, height)

    # --- Hair: fine strands running along the ponytail and back over the scalp.
    s, t, view = canvas.slot("hair", 0.15, 0.3)
    strands = noise(s.shape, 150, 24, (1, 0.03))
    locks = noise(s.shape, 14, 25, (1, 0.05))
    colour = 0.72 + 0.3 * strands * (0.6 + 0.4 * locks) + 0.14 * (locks - 0.5)
    canvas.paint(view, colour, 0.0006 * (strands - 0.5) + 0.0015 * (locks - 0.5))

    detail = (canvas.colour * 255).round().astype(np.uint8)
    return Image.fromarray(detail).convert("RGB"), Image.fromarray(canvas.normal_map())


def TAU_PER_METRE(period):
    """Angular frequency of a pattern that repeats every `period` metres."""
    return 2 * math.pi / period


def crop_to_uvs(image, parts, size):
    """Crops a texture to the UVs the parts use and remaps those UVs to the crop."""
    corners = np.array([corner for part in parts for face in part.uvs for corner in face])
    low = np.floor(corners.min(axis=0) * 64) / 64 - 1 / 128
    high = np.ceil(corners.max(axis=0) * 64) / 64 + 1 / 128
    low, high = np.clip(low, 0, 1), np.clip(high, 0, 1)
    width, height = image.size
    box = (int(low[0] * width), int((1 - high[1]) * height), int(high[0] * width), int((1 - low[1]) * height))
    for part in parts:
        part.uvs = [[tuple((np.array(corner) - low) / (high - low)) for corner in face] for face in part.uvs]
    return image.crop(box).resize(size, Image.LANCZOS)


def dye_iris(image, colour):
    """Recolours the iris (the saturated part of the eye texture) to `colour` (r, g, b in 0-1)."""

    pixels = np.asarray(image, np.float64) / 255
    rgb = pixels[..., :3]
    brightness = rgb.max(axis=-1)
    saturation = (brightness - rgb.min(axis=-1)) / np.clip(brightness, 1e-6, None)
    iris = smoothstep(0.3, 0.55, saturation)[..., None]
    # Keep the texture's own light and dark fibres, change only the colour.
    tinted = brightness[..., None] ** 0.8 * np.array(colour) * 1.5
    pixels[..., :3] = np.clip(rgb * (1 - iris) + tinted * iris, 0, 1)
    return Image.fromarray((pixels * 255).round().astype(np.uint8), "RGBA")


def face_textures(assets, character, skin, eyes, brows, lashes):
    """The skin of the head, and one sheet holding eyes, eyebrows and lashes."""
    skin_image = crop_to_uvs(Image.open(os.path.join(assets, character["skin"])).convert("RGB"), [skin], (1024, 1024))
    sheet = Image.new("RGBA", (1024, 512), (0, 0, 0, 0))
    tiles = [
        (eyes, character["eyes"], (0, 0, 512, 512)),
        (brows, f"eyebrows/{character['eyebrows']}/{character['eyebrows']}.png", (512, 0, 1024, 256)),
        (lashes, f"eyelashes/{character['eyelashes']}/{character['eyelashes']}.png", (512, 256, 1024, 512)),
    ]
    for part, path, (x0, y0, x1, y1) in tiles:
        image = Image.open(os.path.join(assets, path)).convert("RGBA")
        if part is eyes and character.get("iris"):
            image = dye_iris(image, character["iris"])
        tile = crop_to_uvs(image, [part], (x1 - x0 - 8, y1 - y0 - 8))
        sheet.paste(tile, (x0 + 4, y0 + 4))
        low = np.array([(x0 + 4) / 1024, 1 - (y1 - 4) / 512])
        size = np.array([(x1 - x0 - 8) / 1024, (y1 - y0 - 8) / 512])
        part.uvs = [[tuple(low + np.array(corner) * size) for corner in face] for face in part.uvs]
    return skin_image, sheet
