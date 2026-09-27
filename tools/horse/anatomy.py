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
    "lower_x": 0.33,
    "root": (1.46, 0.62),  # elbow joint (y, z)
    "knee": (0.82, 0.66),  # carpus
    "fetlock": (0.34, 0.66),
    "hoof": (0.0, 0.79),  # ground contact below the toe
}
HIND = {
    "x": 0.25,
    "lower_x": 0.26,
    "root": (2.0, -1.0),  # hip joint; the whole thigh swings from here
    "stifle": (1.53, -0.64),
    "knee": (0.98, -1.4),  # hock, under the point of buttock
    "fetlock": (0.34, -1.42),
    "hoof": (0.0, -1.3),
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


def lower_leg(spec):
    """Cannon, fetlock, pastern and hoof, shared by all four legs."""
    cx = spec["lower_x"]
    ky, kz = spec["knee"]
    fy, fz = spec["fetlock"]
    hz = spec["hoof"][1]
    return [
        # Cannon: bone in front, tendons behind, giving a deep, narrow section.
        Cone((cx, ky - 0.02, kz + 0.012), (cx, fy + 0.03, fz + 0.015), 0.05, 0.047, k=0.04),
        Cone((cx, ky - 0.06, kz - 0.04), (cx, fy + 0.04, fz - 0.04), 0.042, 0.047, k=0.04),
        # Fetlock joint and ergot.
        Ellipsoid((cx, fy, fz - 0.01), (0.062, 0.07, 0.078), k=0.04),
        Ellipsoid((cx, fy - 0.025, fz - 0.07), (0.035, 0.035, 0.035), k=0.03),
        # Pastern slopes forward to the coronet.
        Cone((cx, fy - 0.01, fz + 0.005), (cx, 0.15, hz - 0.03), 0.05, 0.056, k=0.02),
    ] + hoof(cx, fz, hz)


def foreleg(spec):
    x, cx = spec["x"], spec["lower_x"]
    ry, rz = spec["root"]
    ky, kz = spec["knee"]
    # Upper arm, elbow and a forearm that is muscular above and bony at the knee.
    return [
        Cone((x - 0.07, 1.88, 0.94), (x - 0.02, 1.5, 0.62), 0.12, 0.13, k=0.09, squash=0.8),
        Ellipsoid((x - 0.04, 1.68, 0.7), (0.11, 0.24, 0.2), (0.35, 0, 0), k=0.09),
        Ellipsoid((x - 0.01, 1.47, 0.52), (0.07, 0.08, 0.075), k=0.05),
        Cone((x, ry - 0.02, rz - 0.02), (cx, ky + 0.07, kz), 0.15, 0.064, k=0.07, squash=0.8),
        Ellipsoid((cx, ky, kz + 0.005), (0.072, 0.1, 0.075), k=0.05),
    ] + lower_leg(spec)


# Bony landmarks of the hindquarters.
TUBER_COXAE = (0.33, 2.26, -0.56)  # point of hip
TUBER_ISCHII = (0.12, 1.97, -1.5)  # point of buttock


def hindquarters(spec):
    """Croup, thigh, gaskin and hock, following the pelvis and hind limb bones.

    From the side the rear outline curves from the tail head over the point of
    buttock and down the hamstrings to the gaskin, where the Achilles tendon
    runs back to the point of hock. From behind the quarters are widest over
    the thighs and taper evenly to hocks set under the points of buttock.
    """
    cx = spec["lower_x"]
    sy, sz = spec["stifle"]
    ky, kz = spec["knee"]
    return [
        # Pelvis and croup: a core over the hips, gluteal muscles on each side.
        Ellipsoid((0, 2.2, -0.9), (0.37, 0.38, 0.52), k=0.12),
        Ellipsoid((0, 2.44, -0.85), (0.26, 0.14, 0.45), k=0.14),
        Ellipsoid((0.2, 2.34, -0.9), (0.22, 0.22, 0.45), (0.1, 0, 0), k=0.18),
        Ellipsoid(TUBER_COXAE, (0.07, 0.08, 0.1), k=0.12),
        # The flank bridges the ribs and the thigh.
        Ellipsoid((0.17, 1.86, -0.6), (0.2, 0.3, 0.26), k=0.16),
        # Biceps femoris fans from the croup down to the stifle and gaskin.
        Ellipsoid((0.28, 1.86, -1.04), (0.14, 0.46, 0.3), (-0.46, 0, 0), k=0.16),
        # Hamstrings form the back of the thigh below the point of buttock.
        Cone((0.14, 2.0, -1.35), (0.24, 1.3, -1.28), 0.15, 0.075, k=0.13, squash=0.8),
        # Inner thighs meet under the tail, then part above the gaskins.
        Ellipsoid((0.1, 1.82, -1.3), (0.12, 0.3, 0.2), (-0.2, 0, 0), k=0.13),
        Ellipsoid((0, 2.0, -1.38), (0.1, 0.2, 0.1), k=0.12),
        # Quadriceps in front of the femur and the stifle joint.
        Ellipsoid((0.31, 1.78, -0.74), (0.13, 0.3, 0.17), (-0.66, 0, 0), k=0.14),
        Ellipsoid((0.34, sy, sz + 0.02), (0.08, 0.09, 0.08), k=0.09),
        # Gaskin: one deep, laterally flattened mass tapering from the stifle
        # to the hock, joined to the stifle in front.
        Cone((0.3, 1.52, -0.92), (cx, 1.1, -1.34), 0.19, 0.07, k=0.12, squash=0.62),
        Cone((0.33, sy - 0.06, sz - 0.06), (0.29, 1.3, -0.96), 0.1, 0.07, k=0.12, squash=0.7),
        Ellipsoid((0.28, 1.58, -1.02), (0.13, 0.22, 0.24), (-0.5, 0, 0), k=0.14),
        # Achilles tendon to the point of hock, then the hock itself.
        Cone((cx, 1.25, -1.4), (cx, ky + 0.07, kz - 0.09), 0.05, 0.038, k=0.07, squash=0.8),
        Ellipsoid((cx, ky, kz), (0.065, 0.1, 0.085), k=0.05),
        Ellipsoid((cx, ky + 0.05, kz - 0.09), (0.036, 0.05, 0.04), k=0.04),
    ] + lower_leg(spec)


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
        # Topline: withers, back and loin.
        Ellipsoid((0, 2.45, 0.5), (0.12, 0.18, 0.4), (0.1, 0, 0), k=0.1),
        Ellipsoid((0, 2.36, -0.4), (0.27, 0.18, 0.6), k=0.12),
        # Scapula lies flat against the ribs; point of shoulder in front.
        Ellipsoid((0.23, 2.06, 0.74), (0.1, 0.38, 0.16), (-0.5, 0, 0), k=0.12),
        Ellipsoid((0.19, 1.9, 1.0), (0.1, 0.12, 0.1), k=0.1),
        # Breast between the forelegs.
        Ellipsoid((0.1, 1.8, 0.96), (0.14, 0.2, 0.13), k=0.12),
        # Dock of the tail.
        Cone((0, 2.48, -1.28), (0, 2.18, -1.44), 0.085, 0.06, k=0.09),
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
    ps += foreleg(FORE) + hindquarters(HIND)
    return ps


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def axes(bounds=BOUNDS, voxel=VOXEL):
    return [np.arange(lo, hi + voxel, voxel) for lo, hi in bounds]


def field(parts=None, bounds=BOUNDS, voxel=VOXEL):
    """Evaluates the half field (x >= 0) on the voxel grid."""
    xs, ys, zs = axes(bounds, voxel)
    grid = np.full((len(xs), len(ys), len(zs)), 1.0, np.float32)
    origin = np.array([xs[0], ys[0], zs[0]])
    shape = np.array(grid.shape)
    for part in parts or primitives():
        lo, hi = part.bounds()
        margin = part.k + 3 * voxel
        i0 = np.maximum(np.floor((lo - margin - origin) / voxel).astype(int), 0)
        i1 = np.minimum(np.ceil((hi + margin - origin) / voxel).astype(int) + 1, shape)
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
