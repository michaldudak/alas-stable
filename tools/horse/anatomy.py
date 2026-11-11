"""Signed-distance sculpture of the horse, in game coordinates.

Units are game metres (about 1.6x real size): +Y up, +Z forward, +X to the
horse's left. Paired structures are listed once for the +X side; the field is
mirrored across X = 0. Every primitive is smoothly blended into the running
field with its own blend radius, so large masses merge softly while joints,
lips and ears keep crisp edges.
"""

import math

import numpy as np

VOXEL = 0.009
BOUNDS = ((0.0, 0.62), (-0.03, 4.0), (-1.95, 2.62))

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


class Loft:
    """A body traced from its side outline.

    Each station gives a point on one outline and the opposite point on the
    other, as (y, z) pairs: for the trunk the topline and the underline, for a
    leg its front and back. `w` is the half-width across, `x` the centre line's
    offset from the midline, `e` (-1..1) moves the widest part towards the
    first (+) or second (-) outline, `peak` and `keel` narrow the section
    towards the first and second outline, and `n` squares it (2 is an ellipse).
    Stations are interpolated smoothly; `cap` rounds off both ends.
    """

    KEYS = ("w", "x", "e", "peak", "keel", "n")
    DEFAULTS = {"x": 0.0, "e": 0.0, "peak": 0.0, "keel": 0.0, "n": 2.0}

    def __init__(self, stations, k=0.06, cap=0.05, fine=8, subtract=False):
        self.k = k
        self.cap = cap
        self.subtract = subtract
        rows = []
        for first, second, w, *rest in stations:
            extra = dict(self.DEFAULTS, **(rest[0] if rest else {}))
            rows.append([*first, *second, w] + [extra[key] for key in self.KEYS[1:]])
        rows = np.array(rows, float)
        # Catmull-Rom through the stations, sampled densely.
        padded = np.vstack([2 * rows[0] - rows[1], rows, 2 * rows[-1] - rows[-2]])
        samples = []
        for i in range(len(rows) - 1):
            p0, p1, p2, p3 = padded[i : i + 4]
            for t in np.arange(fine) / fine:
                samples.append(
                    0.5
                    * (
                        2 * p1
                        + (p2 - p0) * t
                        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                        + (3 * p1 - p0 - 3 * p2 + p3) * t**3
                    )
                )
        samples.append(rows[-1])
        self.rows = np.array(samples)
        self.centres = (self.rows[:, 0:2] + self.rows[:, 2:4]) / 2
        # Sections are found along the straight line between the two ends.
        self.start = self.centres[0]
        self.chord = self.centres[-1] - self.centres[0]
        self.length = np.linalg.norm(self.chord)
        self.params = ((self.centres - self.start) @ self.chord) / self.length**2
        if np.any(np.diff(self.params) <= 0):
            raise ValueError("Loft stations must advance along the line between its ends.")

    def bounds(self):
        r = self.rows
        depth = np.linalg.norm(r[:, 0:2] - r[:, 2:4], axis=1).max() / 2 + self.cap
        lo = np.array([0.0, self.centres[:, 0].min() - depth, self.centres[:, 1].min() - depth])
        hi = np.array(
            [(np.abs(r[:, 5]) + r[:, 4]).max(), self.centres[:, 0].max() + depth, self.centres[:, 1].max() + depth]
        )
        return lo, hi

    def implicit(self, p):
        """Below 1 inside the body, 1 on its surface, growing outside."""
        x = p[..., 0]
        q = p[..., 1:3]
        raw = ((q - self.start) @ self.chord) / self.length**2
        t = np.clip(raw, 0, 1)
        over = np.abs(raw - t) * self.length
        row = [np.interp(t, self.params, self.rows[:, i]) for i in range(self.rows.shape[1])]
        cy, cz = (row[0] + row[2]) / 2, (row[1] + row[3]) / 2
        sy, sz = row[0] - row[2], row[1] - row[3]
        half2 = (sy * sy + sz * sz) / 4
        u = ((q[..., 0] - cy) * sy + (q[..., 1] - cz) * sz) / (2 * half2)
        w, x0, e, peak, keel, n = row[4:10]
        v = np.where(u > e, (u - e) / (1 - e), (u - e) / (1 + e))
        narrow = 1 - np.where(v > 0, peak, keel) * np.clip(np.abs(v), 0, 1) ** 2
        width = np.clip(w * narrow, 1e-4, None)
        rho = (np.abs((np.abs(x) - x0) / width) ** n + np.abs(v) ** n) ** (1 / n)
        return np.hypot(rho, over / self.cap), np.minimum(width, np.sqrt(half2))

    def distance(self, p):
        rho, scale = self.implicit(p)
        if p.ndim == 4 and min(p.shape[:3]) > 2:
            # On a grid the true distance is the value over its gradient.
            spacing = [p[1, 0, 0, 0] - p[0, 0, 0, 0], p[0, 1, 0, 1] - p[0, 0, 0, 1], p[0, 0, 1, 2] - p[0, 0, 0, 2]]
            gradient = np.sqrt(sum(g * g for g in np.gradient(rho, *spacing)))
            return (rho - 1) / np.maximum(gradient, 0.2 / np.maximum(scale, 1e-3))
        return (rho - 1) * scale


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# The head is laid out along its own axis: `s` runs from the poll to the lips,
# `t` from the forehead towards the jaw.
POLL = (3.42, 1.9)  # (y, z)
HEAD_TILT = 1.08  # radians below horizontal
HEAD_SCALE = 0.9  # length of one unit of `s` and `t`


def head_point(s, t, x=0.0):
    s, t = s * HEAD_SCALE, t * HEAD_SCALE
    u = (-math.sin(HEAD_TILT), math.cos(HEAD_TILT))  # (y, z) along the face
    n = (-math.cos(HEAD_TILT), -math.sin(HEAD_TILT))  # towards the jaw
    return (x, POLL[0] + s * u[0] + t * n[0], POLL[1] + s * u[1] + t * n[1])


def head_rot(extra=0.0):
    return (HEAD_TILT + extra, 0, 0)


def limb_stations(x, outline):
    return [((y, front), (y2, back), w, {"x": x if cx is None else cx, "n": n}) for y, front, y2, back, w, n, cx in outline]


def lower_details(spec):
    """Ergot, coronet band and the flat sole shared by all four legs."""
    cx = spec["lower_x"]
    hz = spec["hoof"][1]
    fy, fz = spec["fetlock"]
    return [
        Ellipsoid((cx, fy - 0.035, fz - 0.07), (0.02, 0.028, 0.022), k=0.035),
        Ellipsoid((cx, 0.135, hz - 0.045), (0.066, 0.02, 0.085), (0.42, 0, 0), k=0.015),
        Below(0.0, (cx - 0.15, -0.1, hz - 0.2), (cx + 0.15, 0.02, hz + 0.2)),
    ]


def foreleg(spec):
    x, cx = spec["x"], spec["lower_x"]
    ky, kz = spec["knee"]
    # One loft from the shoulder to the ground, traced along the front and
    # back of the leg: a muscular forearm tapering to a flat-fronted knee, a
    # cannon that is deep and narrow, a round fetlock, a sloping pastern and
    # a hoof that flares to the ground. Rows: y, front z, y, back z, half
    # width, squareness, x.
    leg = Loft(
        limb_stations(
            cx,
            [
                (1.8, 0.86, 1.8, 0.44, 0.1, 2.0, 0.24),
                (1.62, 0.86, 1.62, 0.42, 0.135, 2.0, x - 0.01),
                (1.48, 0.85, 1.48, 0.46, 0.126, 2.0, x),
                (1.3, 0.825, 1.3, 0.5, 0.11, 2.0, x + 0.01),
                (1.1, 0.785, 1.1, 0.555, 0.088, 2.0, None),
                (0.94, 0.75, 0.94, 0.59, 0.066, 2.0, None),
                (ky + 0.03, 0.752, ky + 0.03, 0.578, 0.073, 2.6, None),
                (ky - 0.06, 0.745, ky - 0.06, 0.59, 0.067, 2.6, None),
                (ky - 0.14, 0.726, ky - 0.14, 0.6, 0.05, 2.2, None),
                (0.58, 0.718, 0.58, 0.603, 0.047, 2.3, None),
                (0.44, 0.718, 0.44, 0.6, 0.048, 2.3, None),
                (0.35, 0.73, 0.35, 0.592, 0.053, 2.0, None),
                (0.28, 0.742, 0.28, 0.612, 0.05, 2.0, None),
                (0.2, 0.782, 0.2, 0.668, 0.047, 2.0, None),
                (0.14, 0.822, 0.14, 0.7, 0.06, 2.2, None),
                (0.07, 0.855, 0.07, 0.705, 0.072, 2.4, None),
                (0.0, 0.885, 0.0, 0.705, 0.082, 2.6, None),
            ],
        ),
        k=0.07,
        cap=0.2,
        fine=6,
    )
    return [
        leg,
        # Scapula under its muscles, sloping from the withers to the point of shoulder.
        Ellipsoid((0.2, 2.2, 0.72), (0.1, 0.44, 0.22), (-0.62, 0, 0), k=0.16),

        # Point of shoulder.
        Ellipsoid((0.2, 1.97, 1.04), (0.07, 0.08, 0.07), k=0.16),
        # Triceps fill the angle behind the shoulder down to the elbow.
        Ellipsoid((0.26, 1.8, 0.58), (0.1, 0.26, 0.22), (0.5, 0, 0), k=0.12),

        # Extensor muscles on the outside of the forearm.
        Ellipsoid((x + 0.05, 1.36, 0.72), (0.055, 0.2, 0.085), k=0.06),
        # Accessory carpal bone behind the knee.
        Ellipsoid((cx, ky + 0.01, kz - 0.07), (0.028, 0.045, 0.03), k=0.045),
        # The cannon's tendons stand apart from the bone.
        Cone((cx + 0.063, ky - 0.2, kz), (cx + 0.063, 0.47, 0.66), 0.014, 0.014, k=0.02, subtract=True),
        Cone((cx - 0.063, ky - 0.2, kz), (cx - 0.063, 0.47, 0.66), 0.014, 0.014, k=0.02, subtract=True),
    ] + lower_details(spec)


# Bony landmarks of the hindquarters.
TUBER_COXAE = (0.3, 2.38, -0.62)  # point of hip
TUBER_ISCHII = (0.13, 2.05, -1.7)  # point of buttock


def hindquarters(spec):
    """Croup, thigh, gaskin and hock, following the pelvis and hind limb bones."""
    cx = spec["lower_x"]
    sy, sz = spec["stifle"]
    ky, kz = spec["knee"]
    # One loft from the thigh to the ground: a gaskin that is deep at the
    # stifle and tapers to the Achilles tendon, the point of hock jutting out
    # behind the joint, then cannon, fetlock, pastern and hoof.
    gaskin = Loft(
        limb_stations(
            cx,
            [
                (1.84, -0.92, 1.92, -1.5, 0.15, 2.0, 0.27),
                (1.58, -0.95, 1.63, -1.57, 0.15, 2.0, 0.29),
                (1.4, -1.0, 1.42, -1.56, 0.125, 2.0, 0.285),
                (1.24, -1.09, 1.26, -1.53, 0.098, 2.0, 0.275),
                (1.1, -1.17, 1.13, -1.52, 0.075, 2.0, None),
                (ky + 0.01, -1.3, ky + 0.04, -1.505, 0.07, 2.5, None),
                (ky - 0.09, -1.335, ky - 0.09, -1.485, 0.064, 2.5, None),
                (ky - 0.18, -1.35, ky - 0.18, -1.477, 0.052, 2.2, None),
                (0.62, -1.362, 0.62, -1.482, 0.049, 2.3, None),
                (0.45, -1.362, 0.45, -1.485, 0.05, 2.3, None),
                (0.35, -1.35, 0.35, -1.495, 0.055, 2.0, None),
                (0.28, -1.335, 0.28, -1.475, 0.052, 2.0, None),
                (0.2, -1.3, 0.2, -1.415, 0.048, 2.0, None),
                (0.14, -1.262, 0.14, -1.39, 0.06, 2.2, None),
                (0.07, -1.232, 0.07, -1.385, 0.07, 2.4, None),
                (0.0, -1.205, 0.0, -1.385, 0.078, 2.6, None),
            ],
        ),
        k=0.08,
        cap=0.28,
        fine=6,
    )
    return [
        gaskin,
        # Croup: gluteal muscles round the quarters from the point of hip back.
        Ellipsoid((0.2, 2.22, -1.12), (0.25, 0.32, 0.5), k=0.16),
        Ellipsoid(TUBER_COXAE, (0.03, 0.035, 0.055), k=0.14),
        # Biceps femoris fans from the croup down to the stifle and gaskin.
        Ellipsoid((0.28, 1.9, -1.2), (0.15, 0.48, 0.34), (-0.3, 0, 0), k=0.16),
        # Semitendinosus: the full, rounded buttock behind and below the tail.
        Ellipsoid((0.14, 1.92, -1.55), (0.13, 0.38, 0.19), (-0.08, 0, 0), k=0.12),
        # The buttocks meet under the tail and part above the gaskins.
        Ellipsoid((0, 1.98, -1.57), (0.14, 0.26, 0.14), k=0.12),
        # Quadriceps in front of the femur, the stifle and its fold to the flank.
        Ellipsoid((0.29, 1.86, -0.98), (0.12, 0.3, 0.17), (-0.12, 0, 0), k=0.14),
        Cone((0.3, 1.74, -0.84), (0.27, 1.68, -0.6), 0.06, 0.035, k=0.12),
        # Gaskin muscle on the outside of the leg.
        Ellipsoid((0.335, 1.4, -1.22), (0.055, 0.16, 0.12), (-0.45, 0, 0), k=0.06),
        # The cannon's tendons stand apart from the bone.
        Cone((cx + 0.066, ky - 0.22, kz + 0.002), (cx + 0.066, 0.48, -1.425), 0.014, 0.014, k=0.02, subtract=True),
        Cone((cx - 0.066, ky - 0.22, kz + 0.002), (cx - 0.066, 0.48, -1.425), 0.014, 0.014, k=0.02, subtract=True),
    ] + lower_details(spec)


def head():
    h = head_point

    def outline(s, top, bottom, w, **shape):
        return (h(s, top)[1:], h(s, bottom)[1:], w, shape)

    return [
        # Skull: broad and deep between the eyes and jowls, long and tapering
        # to the muzzle. The forehead and nasal bones are flat on top; the
        # lower jaw narrows to the bars.
        Loft(
            [
                outline(-0.03, 0.0, 0.25, 0.12, e=0.2, n=2.3),
                outline(0.1, -0.035, 0.37, 0.158, e=0.4, n=2.5, keel=0.45),
                outline(0.27, -0.045, 0.5, 0.175, e=0.5, n=2.6, keel=0.6),
                outline(0.44, -0.025, 0.47, 0.15, e=0.45, n=2.5, keel=0.62),
                outline(0.6, -0.005, 0.36, 0.118, e=0.35, n=2.4, keel=0.5),
                outline(0.76, 0.015, 0.29, 0.096, e=0.25, n=2.3, keel=0.3),
                outline(0.9, 0.02, 0.275, 0.098, e=0.1, n=2.4, keel=0.1),
                outline(1.0, 0.03, 0.29, 0.104, e=0.0, n=2.5),
                outline(1.05, 0.07, 0.275, 0.085, e=0.0, n=2.3),
            ],
            k=0.04,
            cap=0.05,
        ),
        # Jowls: the flat, round plate of the cheek muscle on each side.
        Ellipsoid(h(0.33, 0.27, 0.105), (0.055, 0.19, 0.19), head_rot(), k=0.035),
        # Facial crest, a ridge from below the eye towards the nostril.
        Cone(h(0.34, 0.15, 0.14), h(0.56, 0.17, 0.11), 0.02, 0.012, k=0.045),
        # Brow: the bony rim over each eye, and the hollow above it.
        Ellipsoid(h(0.215, 0.045, 0.15), (0.045, 0.035, 0.085), head_rot(0.25), k=0.03),
        Ellipsoid(h(0.13, 0.02, 0.15), (0.02, 0.02, 0.04), head_rot(), k=0.05, subtract=True),
        # Eye socket for the separate eyeball, with lids above and below it.
        Ellipsoid(EYE, (0.05, 0.046, 0.058), head_rot(), k=0.02, subtract=True),
        Ellipsoid(h(0.255, 0.085, 0.158), (0.022, 0.017, 0.068), head_rot(0.18), k=0.014),
        Ellipsoid(h(0.29, 0.165, 0.156), (0.02, 0.015, 0.06), head_rot(-0.12), k=0.014),
        # Muzzle: nostril rims, upper lip and chin.
        Ellipsoid(h(0.95, 0.085, 0.07), (0.045, 0.045, 0.075), head_rot(0.1), k=0.025),
        Ellipsoid(h(0.985, 0.095, 0.082), (0.02, 0.03, 0.055), head_rot(0.25), k=0.018, subtract=True),
        Ellipsoid(h(1.04, 0.19), (0.085, 0.07, 0.07), head_rot(0.2), k=0.03),
        Ellipsoid(h(0.95, 0.295), (0.055, 0.035, 0.07), head_rot(-0.2), k=0.04),
        # The mouth is a groove along each side, not a slit through the muzzle.
        Ellipsoid(h(0.97, 0.262, 0.095), (0.03, 0.008, 0.085), head_rot(-0.1), k=0.012, subtract=True),
        # Ears: pointed leaves on the poll, open to the front and a little outwards.
        Ellipsoid(h(-0.02, -0.115, 0.1), (0.05, 0.15, 0.034), (0.28, 0.4, -0.16), k=0.03),
        Ellipsoid(h(0.005, -0.125, 0.11), (0.03, 0.11, 0.022), (0.28, 0.4, -0.16), k=0.012, subtract=True),
    ]


EYE = head_point(0.27, 0.125, 0.152)


def primitives():
    ps = [
        # Trunk from the breast to the buttocks, traced along the topline and
        # the underline: deep through the girth, widest behind it, rising to
        # the flank and rounding over the croup.
        Loft(
            [
                ((2.2, 1.06), (1.92, 1.08), 0.16, {"e": -0.1}),
                ((2.45, 0.88), (1.62, 0.96), 0.3, {"e": -0.15, "peak": 0.4}),
                ((2.57, 0.6), (1.44, 0.64), 0.36, {"e": -0.2, "peak": 0.55, "n": 2.2}),
                ((2.6, 0.38), (1.4, 0.4), 0.4, {"e": -0.18, "peak": 0.55, "n": 2.2}),
                ((2.56, 0.1), (1.385, 0.1), 0.44, {"e": -0.12, "peak": 0.35, "n": 2.2}),
                ((2.53, -0.2), (1.39, -0.2), 0.46, {"e": -0.05, "peak": 0.25, "n": 2.2}),
                ((2.63, -0.6), (1.46, -0.55), 0.45, {"e": 0.1, "peak": 0.15, "keel": 0.2, "n": 2.2}),
                ((2.67, -0.95), (1.6, -0.88), 0.44, {"e": 0.22, "peak": 0.12, "keel": 0.3, "n": 2.3}),
                ((2.62, -1.28), (1.78, -1.22), 0.41, {"e": 0.22, "peak": 0.12, "keel": 0.3, "n": 2.3}),
                ((2.45, -1.58), (1.82, -1.54), 0.3, {"e": 0.2, "peak": 0.15, "keel": 0.3}),
                ((2.25, -1.71), (1.9, -1.7), 0.16, {"e": 0.1}),
            ],
            k=0.08,
            cap=0.08,
        ),
        # Withers: the spines of the vertebrae between the shoulder blades.
        Ellipsoid((0, 2.57, 0.4), (0.07, 0.1, 0.3), (0.1, 0, 0), k=0.08),
        # Long back muscles on each side of the spine.
        # Breast muscles between and in front of the forelegs.
        Ellipsoid((0.1, 1.86, 1.0), (0.11, 0.18, 0.11), (0.25, 0, 0), k=0.16),
        # Dock of the tail.
        Cone((0, 2.4, -1.64), (0, 2.18, -1.79), 0.07, 0.05, k=0.09),
        # Neck from the shoulders to the poll, traced along the crest and the
        # underline: deep at the base, fine at the throat, the crest arched.
        Loft(
            [
                ((2.42, 0.25), (1.72, 0.92), 0.3, {"e": -0.15, "peak": 0.5}),
                ((2.58, 0.5), (1.9, 1.14), 0.28, {"e": -0.15, "peak": 0.5}),
                ((2.78, 0.82), (2.15, 1.36), 0.23, {"e": -0.2, "peak": 0.5, "keel": 0.2}),
                ((2.98, 1.14), (2.42, 1.56), 0.19, {"e": -0.2, "peak": 0.5, "keel": 0.25}),
                ((3.17, 1.44), (2.68, 1.74), 0.16, {"e": -0.15, "peak": 0.45, "keel": 0.3}),
                ((3.33, 1.7), (2.9, 1.9), 0.142, {"e": -0.1, "peak": 0.4, "keel": 0.3}),
                ((3.44, 1.88), (3.05, 2.02), 0.13, {"e": 0.0, "peak": 0.3, "keel": 0.3}),
            ],
            k=0.1,
            cap=0.1,
        ),
        # Windpipe along the underside of the neck.
        Cone((0, 2.1, 1.25), (0, 2.92, 1.88), 0.075, 0.055, k=0.08),
        # The long muscle from the shoulder to the jaw rounds each side of the neck.
        Cone((0.15, 2.15, 1.08), (0.09, 2.95, 1.78), 0.09, 0.055, k=0.09),
    ]
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
