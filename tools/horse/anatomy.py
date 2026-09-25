"""Signed-distance sculpture of the horse, in game coordinates.

Units are game metres (about 1.6x real size): +Y up, +Z forward, +X to the
horse's left. Paired structures are listed once for the +X side; the field is
mirrored across X = 0. Every primitive is smoothly blended into the running
field with its own blend radius, so large masses merge softly while joints,
lips and ears keep crisp edges.
"""

import math

import numpy as np

VOXEL = 0.011
BOUNDS = ((0.0, 0.62), (-0.03, 3.95), (-1.62, 2.34))

# Rig landmarks shared with the skinning and the game's leg solver.
FORE = {
    "x": 0.3,
    "root": (1.46, 0.62),  # elbow joint (y, z)
    "knee": (0.82, 0.66),  # carpus
    "fetlock": (0.34, 0.66),
    "hoof": (0.0, 0.79),  # ground contact below the toe
}
HIND = {
    "x": 0.31,
    "root": (1.6, -0.72),  # stifle
    "knee": (1.0, -1.2),  # hock
    "fetlock": (0.34, -1.18),
    "hoof": (0.0, -1.06),
}


def rotation(rx=0.0, ry=0.0, rz=0.0):
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return mz @ my @ mx


class Ellipsoid:
    def __init__(self, center, radii, rot=(0, 0, 0), k=0.06, subtract=False):
        self.center = np.array(center, float)
        self.radii = np.array(radii, float)
        self.inverse = rotation(*rot).T
        self.k = k
        self.subtract = subtract

    def bounds(self):
        r = self.radii.max()
        return self.center - r, self.center + r

    def distance(self, p):
        q = (p - self.center) @ self.inverse.T
        k0 = np.linalg.norm(q / self.radii, axis=-1)
        k1 = np.linalg.norm(q / (self.radii * self.radii), axis=-1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


class Cone:
    """Round cone (tapered capsule) between two points; `squash` flattens it sideways."""

    def __init__(self, a, b, ra, rb, k=0.05, squash=1.0, subtract=False):
        self.a = np.array(a, float)
        self.b = np.array(b, float)
        self.ra = ra
        self.rb = rb
        self.k = k
        self.squash = squash
        self.subtract = subtract

    def bounds(self):
        r = max(self.ra, self.rb)
        return np.minimum(self.a, self.b) - r, np.maximum(self.a, self.b) + r

    def distance(self, p):
        p = p.copy()
        scale = np.array([1.0 / self.squash, 1.0, 1.0])
        a, b = self.a * scale, self.b * scale
        p = p * scale
        ba = b - a
        l2 = ba @ ba
        rr = self.ra - self.rb
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = p - a
        y = pa @ ba
        z = y - l2
        x = pa * l2 - y[..., None] * ba
        x2 = (x * x).sum(-1)
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        d = np.where(
            np.sign(z) * a2 * z2 > k,
            np.sqrt(x2 + z2) * il2 - self.rb,
            np.where(
                np.sign(y) * a2 * y2 < k,
                np.sqrt(x2 + y2) * il2 - self.ra,
                (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - self.ra,
            ),
        )
        return d * min(self.squash, 1.0)


class Below:
    """Everything below a horizontal plane; subtracting it flattens hoof soles."""

    def __init__(self, height, lo, hi, k=0.005, subtract=True):
        self.height = height
        self.lo = np.array(lo, float)
        self.hi = np.array(hi, float)
        self.k = k
        self.subtract = subtract

    def bounds(self):
        return self.lo, self.hi

    def distance(self, p):
        return p[..., 1] - self.height


def hoof(cx, fz, hz):
    """Hoof capsule sloping forward to the toe, with a flat sole at ground level."""
    return [
        Cone((cx, 0.13, hz - 0.035), (cx, 0.03, hz + 0.01), 0.058, 0.082, k=0.012),
        Below(0.0, (cx - 0.12, -0.1, hz - 0.15), (cx + 0.12, 0.02, hz + 0.15)),
    ]


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# The head is laid out along its own axis: `s` runs from the poll to the lips,
# `t` from the forehead towards the jaw.
POLL = (3.52, 1.52)  # (y, z)
HEAD_TILT = 0.8  # radians below horizontal


def head_point(s, t, x=0.0):
    u = (-math.sin(HEAD_TILT), math.cos(HEAD_TILT))  # (y, z) along the face
    n = (-math.cos(HEAD_TILT), -math.sin(HEAD_TILT))  # towards the jaw
    return (x, POLL[0] + s * u[0] + t * n[0], POLL[1] + s * u[1] + t * n[1])


def head_rot(extra=0.0):
    return (HEAD_TILT + extra, 0, 0)


def leg(spec, fore):
    x = spec["x"]
    ry, rz = spec["root"]
    ky, kz = spec["knee"]
    fy, fz = spec["fetlock"]
    hz = spec["hoof"][1]
    cx = x + 0.03
    parts = []
    if fore:
        # Upper arm, elbow and a forearm that is muscular above and bony at the knee.
        parts += [
            Cone((x - 0.07, 1.88, 0.94), (x - 0.02, 1.5, 0.62), 0.12, 0.13, k=0.09, squash=0.8),
            Ellipsoid((x - 0.04, 1.68, 0.7), (0.11, 0.24, 0.2), (0.35, 0, 0), k=0.09),
            Ellipsoid((x - 0.01, 1.47, 0.52), (0.07, 0.08, 0.075), k=0.05),
            Cone((x, ry - 0.02, rz - 0.02), (cx, ky + 0.07, kz), 0.15, 0.064, k=0.07, squash=0.8),
            Ellipsoid((cx, ky, kz + 0.005), (0.072, 0.1, 0.075), k=0.05),
        ]
    else:
        # Thigh over the stifle, gaskin, Achilles tendon and an angular hock.
        parts += [
            Ellipsoid((x - 0.01, 1.74, -0.7), (0.13, 0.36, 0.27), (0.25, 0, 0), k=0.1),
            Cone((x, ry - 0.06, rz - 0.14), (cx, ky + 0.1, kz + 0.06), 0.17, 0.07, k=0.1, squash=0.7),
            Cone((cx, ry - 0.12, rz - 0.36), (cx, ky + 0.06, kz - 0.1), 0.07, 0.034, k=0.05, squash=0.6),
            # Second thigh fills the space between the stifle and the hamstrings.
            Ellipsoid((x - 0.02, ry - 0.12, rz - 0.3), (0.14, 0.26, 0.24), (-0.3, 0, 0), k=0.12),
            Ellipsoid((x - 0.03, ry + 0.2, rz - 0.24), (0.14, 0.3, 0.3), k=0.12),
            Ellipsoid((cx, ky, kz + 0.01), (0.066, 0.11, 0.09), k=0.05),
            Ellipsoid((cx, ky + 0.04, kz - 0.085), (0.035, 0.05, 0.04), k=0.04),
        ]
    # Cannon: bone in front, tendons behind, giving a deep, narrow section.
    parts += [
        Cone((cx, ky - 0.02, kz + 0.012), (cx, fy + 0.03, fz + 0.015), 0.05, 0.047, k=0.04),
        Cone((cx, ky - 0.06, kz - 0.04), (cx, fy + 0.04, fz - 0.04), 0.042, 0.047, k=0.04),
        # Fetlock joint and ergot.
        Ellipsoid((cx, fy, fz - 0.01), (0.062, 0.07, 0.078), k=0.04),
        Ellipsoid((cx, fy - 0.025, fz - 0.07), (0.035, 0.035, 0.035), k=0.03),
        # Pastern slopes forward to the coronet.
        Cone((cx, fy - 0.01, fz + 0.005), (cx, 0.15, hz - 0.03), 0.05, 0.056, k=0.02),
    ]
    return parts + hoof(cx, fz, hz)


def head():
    h = head_point
    return [
        # Cranium and forehead.
        Ellipsoid(h(0.2, 0.14), (0.17, 0.16, 0.22), head_rot(), k=0.06),
        # Broad, round jowls at the back of the jaw.
        Ellipsoid(h(0.36, 0.32, 0.095), (0.09, 0.21, 0.21), head_rot(), k=0.05),
        # Face tapers to the nose; the lower jaw runs beneath it.
        Cone(h(0.32, 0.13), h(0.86, 0.13), 0.155, 0.1, k=0.06, squash=0.78),
        Cone(h(0.46, 0.3), h(0.93, 0.25), 0.1, 0.07, k=0.06, squash=0.75),
        # Muzzle, lips and chin.
        Ellipsoid(h(0.93, 0.15), (0.115, 0.13, 0.12), head_rot(), k=0.05),
        Ellipsoid(h(1.0, 0.2), (0.105, 0.075, 0.08), head_rot(0.2), k=0.03),
        Ellipsoid(h(0.96, 0.3), (0.07, 0.06, 0.08), head_rot(-0.2), k=0.03),
        # The mouth line is a groove along each side, not a slit through the muzzle.
        Ellipsoid(h(0.97, 0.255, 0.1), (0.03, 0.008, 0.07), head_rot(-0.1), k=0.012, subtract=True),
        # Nostril rims, then the nostrils.
        Ellipsoid(h(0.95, 0.1, 0.078), (0.045, 0.04, 0.066), head_rot(), k=0.02),
        Ellipsoid(h(0.975, 0.1, 0.09), (0.022, 0.026, 0.05), head_rot(0.15), k=0.015, subtract=True),
        # Brow ridge and the socket for the separate eyeball.
        Ellipsoid(h(0.26, 0.05, 0.14), (0.06, 0.035, 0.08), head_rot(), k=0.03),
        Ellipsoid(EYE, (0.048, 0.048, 0.056), head_rot(), k=0.02, subtract=True),
        # Ears stand up from the poll, hollow side forward.
        Ellipsoid(h(0.0, -0.04, 0.125), (0.055, 0.18, 0.04), (0.25, 0, -0.3), k=0.03),
        Ellipsoid(h(0.025, -0.05, 0.128), (0.034, 0.14, 0.022), (0.25, 0, -0.3), k=0.012, subtract=True),
    ]


EYE = head_point(0.27, 0.12, 0.175)


def primitives():
    ps = [
        # Barrel, belly, chest and hindquarters.
        Ellipsoid((0, 1.98, 0.0), (0.45, 0.56, 0.9), k=0.1),
        Ellipsoid((0, 1.6, 0.05), (0.38, 0.24, 0.6), k=0.14),
        Ellipsoid((0, 1.95, 0.72), (0.38, 0.45, 0.42), k=0.12),
        Ellipsoid((0, 2.14, -0.86), (0.44, 0.44, 0.5), k=0.12),
        # Topline: withers, back and loin.
        Ellipsoid((0, 2.45, 0.5), (0.12, 0.18, 0.4), (0.1, 0, 0), k=0.1),
        Ellipsoid((0, 2.36, -0.4), (0.27, 0.18, 0.6), k=0.12),
        # Hamstrings run from the point of buttock down to the gaskin.
        Cone((0.17, 2.18, -1.28), (0.3, 1.22, -1.24), 0.2, 0.075, k=0.14, squash=0.85),
        # Gluteal masses give the croup its rounded, heart-shaped rear view.
        Ellipsoid((0.2, 2.3, -0.98), (0.25, 0.26, 0.44), (0.15, 0, 0), k=0.14),
        # Scapula lies flat against the ribs; point of shoulder in front.
        Ellipsoid((0.23, 2.06, 0.74), (0.1, 0.38, 0.16), (-0.5, 0, 0), k=0.12),
        Ellipsoid((0.19, 1.9, 1.0), (0.1, 0.12, 0.1), k=0.1),
        # Breast between the forelegs.
        Ellipsoid((0.1, 1.8, 0.96), (0.14, 0.2, 0.13), k=0.12),
        # Dock of the tail.
        Cone((0, 2.5, -1.26), (0, 2.2, -1.42), 0.085, 0.055, k=0.09),
    ]
    # Neck: laterally flattened sections from the chest to the poll, plus the crest.
    neck = [
        ((0, 2.25, 0.8), (0.3, 0.46, 0.36), 0.75),
        ((0, 2.58, 1.02), (0.23, 0.36, 0.3), 0.7),
        ((0, 2.9, 1.2), (0.18, 0.3, 0.26), 0.65),
        ((0, 3.18, 1.36), (0.155, 0.25, 0.23), 0.6),
        ((0, 3.38, 1.47), (0.14, 0.2, 0.2), 0.6),
    ]
    for center, radii, tilt in neck:
        ps.append(Ellipsoid(center, radii, (tilt, 0, 0), k=0.12))
    ps.append(Ellipsoid((0, 3.02, 1.08), (0.1, 0.55, 0.12), (0.75, 0, 0), k=0.1))
    ps += head()
    ps += leg(FORE, True) + leg(HIND, False)
    return ps


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def axes():
    return [np.arange(lo, hi + VOXEL, VOXEL) for lo, hi in BOUNDS]


def field(parts=None):
    """Evaluates the half field (x >= 0) on the voxel grid."""
    xs, ys, zs = axes()
    grid = np.full((len(xs), len(ys), len(zs)), 1.0, np.float32)
    origin = np.array([xs[0], ys[0], zs[0]])
    shape = np.array(grid.shape)
    for part in parts or primitives():
        lo, hi = part.bounds()
        margin = part.k + 3 * VOXEL
        i0 = np.maximum(np.floor((lo - margin - origin) / VOXEL).astype(int), 0)
        i1 = np.minimum(np.ceil((hi + margin - origin) / VOXEL).astype(int) + 1, shape)
        if np.any(i1 <= i0):
            continue
        sub = np.stack(
            np.meshgrid(
                xs[i0[0] : i1[0]], ys[i0[1] : i1[1]], zs[i0[2] : i1[2]], indexing="ij"
            ),
            -1,
        )
        d = part.distance(sub).astype(np.float32)
        block = grid[i0[0] : i1[0], i0[1] : i1[1], i0[2] : i1[2]]
        if part.subtract:
            block[...] = smax(block, -d, part.k)
        else:
            block[...] = smin(block, d, part.k)
    return grid, origin


def mirrored(grid):
    """Full field across X = 0 (the x = 0 slice is shared)."""
    return np.concatenate([grid[:0:-1], grid], axis=0)
