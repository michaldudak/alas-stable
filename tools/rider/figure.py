"""Signed-distance sculpture of the rider, a teenage girl in riding clothes.

Game coordinates (1.6x real size): +Y up, +Z forward, +X to her left, feet on
the ground. She is sculpted standing in a relaxed A-pose so every limb can be
posed by rotating bones: seated in the saddle, walking or mounting.
Paired parts are listed for the +X side and mirrored.
"""

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "horse"))

from anatomy import Below, Cone, Ellipsoid  # noqa: E402

VOXEL = 0.006
BOUNDS = ((0.0, 0.66), (-0.02, 2.6), (-0.2, 0.34))

ARM_ANGLE = math.radians(20)


def _along(start, direction, length):
    return tuple(start[i] + direction[i] * length for i in range(3))


def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


# Joints of the +X side and the midline, shared with skinning and the game rig.
HIP = (0.12, 1.31, 0.0)
KNEE = (0.12, 0.72, 0.02)
ANKLE = (0.115, 0.11, -0.03)
TOE = (0.115, 0.03, 0.26)
SHOULDER = (0.24, 2.05, -0.02)
UPPER_ARM = _unit((math.sin(ARM_ANGLE), -math.cos(ARM_ANGLE), 0.0))
FOREARM = _unit((math.sin(ARM_ANGLE * 0.75), -math.cos(ARM_ANGLE * 0.75), 0.05))
ELBOW = _along(SHOULDER, UPPER_ARM, 0.46)
WRIST = _along(ELBOW, FOREARM, 0.4)
FINGERTIP = _along(WRIST, FOREARM, 0.29)
PELVIS = (0.0, 1.31, 0.0)
WAIST = (0.0, 1.52, 0.0)
NECK = (0.0, 2.13, -0.02)
CROWN = (0.0, 2.56, 0.0)
EYE = (0.045, 2.382, 0.1)
HEAD_CENTER = (0.0, 2.405, -0.01)
HEAD_RADII = (0.122, 0.14, 0.14)

# Bones as (name, parent, start joint, end joint, typical radius).
BONES = [
    ("pelvis", None, PELVIS, WAIST, 0.2),
    ("spine", "pelvis", WAIST, NECK, 0.14),
    ("head", "spine", NECK, CROWN, 0.12),
    ("thighL", "pelvis", HIP, KNEE, 0.09),
    ("shinL", "thighL", KNEE, ANKLE, 0.055),
    ("footL", "shinL", ANKLE, TOE, 0.045),
    ("thighR", "pelvis", HIP, KNEE, 0.09),
    ("shinR", "thighR", KNEE, ANKLE, 0.055),
    ("footR", "shinR", ANKLE, TOE, 0.045),
    ("armL", "spine", SHOULDER, ELBOW, 0.05),
    ("forearmL", "armL", ELBOW, WRIST, 0.04),
    ("handL", "forearmL", WRIST, FINGERTIP, 0.03),
    ("armR", "spine", SHOULDER, ELBOW, 0.05),
    ("forearmR", "armR", ELBOW, WRIST, 0.04),
    ("handR", "forearmR", WRIST, FINGERTIP, 0.03),
]


def mirror(point):
    return (-point[0], point[1], point[2])


def bone_segments():
    """Segments in world space; bones ending in R use the mirrored joints."""
    segments = []
    for name, _, start, end, radius in BONES:
        if name.endswith("R"):
            start, end = mirror(start), mirror(end)
        segments.append((name, np.array(start), np.array(end), radius))
    return segments


def head():
    """Head in classical proportions: eyes halfway down, nose and mouth in thirds."""
    return [
        # Cranium, lower face, a rounded chin and the jaw.
        Ellipsoid(HEAD_CENTER, HEAD_RADII, k=0.03),
        Ellipsoid((0, 2.3, 0.02), (0.09, 0.08, 0.09), k=0.04),
        Ellipsoid((0, 2.238, 0.07), (0.038, 0.03, 0.04), k=0.03),
        Ellipsoid((0.05, 2.27, 0.03), (0.04, 0.035, 0.06), (0, -0.5, 0), k=0.04),
        # Cheeks and brow.
        Ellipsoid((0.058, 2.34, 0.07), (0.045, 0.04, 0.045), k=0.04),
        Ellipsoid((0, 2.405, 0.1), (0.09, 0.018, 0.035), k=0.025),
        # Nose: bridge, tip and nostril wings.
        Cone((0, 2.378, 0.12), (0, 2.33, 0.142), 0.009, 0.013, k=0.012),
        Ellipsoid((0, 2.322, 0.14), (0.016, 0.013, 0.014), k=0.008),
        Ellipsoid((0.011, 2.321, 0.133), (0.012, 0.01, 0.011), k=0.014),
        # Eye sockets hold separate eyeballs.
        Ellipsoid(EYE, (0.022, 0.015, 0.026), k=0.012, subtract=True),
        # Lips rest on the curve of the teeth.
        Ellipsoid((0, 2.283, 0.07), (0.05, 0.04, 0.045), k=0.03),
        Ellipsoid((0, 2.288, 0.108), (0.03, 0.008, 0.012), k=0.012),
        Ellipsoid((0, 2.271, 0.105), (0.027, 0.008, 0.012), k=0.012),
        # Ears.
        Ellipsoid((0.122, 2.37, -0.01), (0.016, 0.036, 0.026), k=0.012),
        # Neck and a jacket collar around it.
        Cone((0, 2.1, -0.02), (0, 2.27, -0.015), 0.075, 0.064, k=0.03),
        Cone((0, 2.12, -0.03), (0, 2.18, -0.03), 0.09, 0.083, k=0.01),
    ]


def torso():
    return [
        # Shoulder girdle, ribcage, a slight bust, waist and pelvis.
        Ellipsoid((0, 2.03, -0.02), (0.23, 0.08, 0.11), k=0.05),
        Ellipsoid((0, 1.88, -0.01), (0.19, 0.25, 0.15), k=0.06),
        Ellipsoid((0.065, 1.9, 0.08), (0.06, 0.05, 0.045), k=0.07),
        Ellipsoid((0, 1.72, 0.0), (0.162, 0.14, 0.132), k=0.06),
        Ellipsoid((0, 1.6, -0.005), (0.155, 0.1, 0.128), k=0.06),
        Ellipsoid((0, 1.43, -0.015), (0.19, 0.15, 0.14), k=0.07),
        Ellipsoid((0.11, 1.36, -0.015), (0.11, 0.13, 0.12), k=0.06),
        Ellipsoid((0.07, 1.37, -0.08), (0.09, 0.1, 0.09), k=0.05),
        # Shoulders.
        Ellipsoid((0.232, 2.035, -0.02), (0.07, 0.065, 0.07), k=0.05),
    ]


def arm():
    palm = _along(WRIST, FOREARM, 0.085)
    fingers = _along(WRIST, FOREARM, 0.2)
    tilt = (0, 0, ARM_ANGLE * 0.75)
    return [
        Cone(SHOULDER, ELBOW, 0.066, 0.05, k=0.03),
        Ellipsoid(_along(SHOULDER, UPPER_ARM, 0.16), (0.066, 0.12, 0.07), (0, 0, ARM_ANGLE), k=0.04),
        Cone(ELBOW, WRIST, 0.052, 0.036, k=0.025),
        Ellipsoid(_along(ELBOW, FOREARM, 0.1), (0.056, 0.1, 0.054), (0, 0, ARM_ANGLE * 0.75), k=0.03),
        # Gloved hand: palm, fingers held together and the thumb.
        Ellipsoid(palm, (0.03, 0.07, 0.05), tilt, k=0.025),
        Ellipsoid(fingers, (0.025, 0.08, 0.046), tilt, k=0.025),
        Cone(_along(WRIST, FOREARM, 0.04), (palm[0] - 0.012, palm[1] - 0.055, palm[2] + 0.05), 0.02, 0.016, k=0.015),
    ]


def leg():
    x = KNEE[0]
    return [
        # Thigh in breeches, knee, and the calf inside a tall riding boot.
        Cone(HIP, KNEE, 0.108, 0.062, k=0.05),
        Ellipsoid((x + 0.005, 1.06, 0.01), (0.1, 0.24, 0.1), k=0.05),
        Ellipsoid(KNEE, (0.06, 0.06, 0.062), k=0.03),
        Cone((x, 0.66, 0.005), ANKLE, 0.068, 0.052, k=0.03),
        Ellipsoid((x, 0.46, -0.035), (0.068, 0.15, 0.072), k=0.04),
        # Boot top rim.
        Cone((x, 0.62, 0.0), (x, 0.66, 0.0), 0.074, 0.074, k=0.01),
        # Foot, heel and flat sole.
        Ellipsoid((x, 0.06, 0.1), (0.048, 0.052, 0.165), k=0.03),
        Ellipsoid((x, 0.055, -0.05), (0.045, 0.055, 0.05), k=0.03),
        Below(0.0, (x - 0.12, -0.1, -0.2), (x + 0.12, 0.02, 0.34)),
    ]


def primitives():
    return head() + torso() + arm() + leg()


# Garment edges: horizontal cuts at the collar, waist and boot tops, and a cut
# across each forearm where the gloves begin.
COLLAR = 2.165
WAISTBAND = 1.53
BOOT_TOP = 0.655
CUFF = _along(WRIST, FOREARM, -0.03)


def cuts():
    """Planes (point, normal) the mesh is split along so garment edges are straight."""
    planes = [((0, COLLAR, 0), (0, 1, 0)), ((0, WAISTBAND, 0), (0, 1, 0)), ((0, BOOT_TOP, 0), (0, 1, 0))]
    for point, normal in ((CUFF, FOREARM), (mirror(CUFF), mirror(FOREARM))):
        planes.append((point, normal))
    return planes


def gloved(center):
    x = abs(center[0])
    local = (x - CUFF[0], center[1] - CUFF[1], center[2] - CUFF[2])
    return sum(local[i] * FOREARM[i] for i in range(3)) > 0


def region(center, bone):
    """Material of a face from its centre and the bone that moves it."""
    x, y, z = center
    # The collar line separates head and torso regardless of blending.
    if bone in ("head", "spine") and y > COLLAR:
        bone = "head"
    elif bone == "head":
        bone = "spine"
    if bone == "head":
        if y < COLLAR:
            return "shirt"
        if y > 2.43 or (z < -0.05 and y > 2.3):
            return "hair"
        return "skin"
    if bone in ("spine", "pelvis") or bone[:4] in ("thig", "shin", "foot"):
        if y > WAISTBAND:
            return "shirt"
        return "breeches" if y > BOOT_TOP else "boots"
    if bone.startswith("hand") or (bone.startswith("forearm") and gloved(center)):
        return "gloves" if gloved(center) else "shirt"
    return "shirt"


def rig():
    """Joint positions and head landmarks for the game."""
    joints = {}
    for name, parent, start, _, _ in BONES:
        point = mirror(start) if name.endswith("R") else start
        joints[name] = {"parent": parent, "position": [round(v, 4) for v in point]}
    return {
        "bones": joints,
        "ends": {
            "handL": [round(v, 4) for v in FINGERTIP],
            "footL": [round(v, 4) for v in TOE],
            "head": [round(v, 4) for v in CROWN],
        },
        "eye": [round(v, 4) for v in EYE],
        "headCenter": list(HEAD_CENTER),
        "headRadii": list(HEAD_RADII),
    }
