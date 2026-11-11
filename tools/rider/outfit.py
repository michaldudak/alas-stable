"""Dresses the figure: training top, breeches, tall boots, gloves, helmet and hair.

Everything is in real metres with bare feet on y = 0, +Y up, +Z forward and
the figure's left at +X. Fabric garments are cut from MakeHuman's smooth
`helper-tights` surface, so they follow any body the morph targets produce;
their UVs are cylinders around the trunk and limbs, laid out in `SLOTS` so
`textures.py` can paint each garment in its own coordinates.
"""

import math

import numpy as np

import meshops
import skeleton
from meshops import Part, smoothstep

TAU = 2 * math.pi

# Atlas rectangles (u0, v0, u1, v1) of the outfit texture.
SLOTS = {
    "torso": (0.0, 0.5, 0.5, 1.0),
    "sleeve": (0.5, 0.5, 0.75, 1.0),
    "leg": (0.75, 0.3, 1.0, 1.0),
    "shaft": (0.0, 0.0, 0.25, 0.5),
    "foot": (0.25, 0.0, 0.5, 0.25),
    "glove": (0.25, 0.25, 0.5, 0.5),
    "helmet": (0.5, 0.0, 0.75, 0.25),
    "hair": (0.5, 0.25, 0.75, 0.5),
    "belt": (0.75, 0.0, 1.0, 0.1),
    "strap": (0.75, 0.1, 1.0, 0.2),
    "sole": (0.75, 0.2, 1.0, 0.3),
}
# How far a cylinder's seam may overhang its slot, as a share of the turn.
OVERHANG = 0.06


def slot_uv(slot, s, t):
    """Maps (s, t) in 0-1 (s may overhang a little) into an atlas slot."""
    u0, v0, u1, v1 = SLOTS[slot]
    width = (u1 - u0) / (1 + 2 * OVERHANG)
    return (u0 + (s + OVERHANG) * width, v0 + t * (v1 - v0))


def _bones(*names):
    return [skeleton.NAMES.index(name) for name in names]


def _group(prefixes):
    return [i for i, name in enumerate(skeleton.NAMES) if name.rstrip("LR").rstrip("123") in prefixes]


ARM = _group({"clavicle", "arm", "armTwist", "forearm", "forearmTwist", "hand", "thumb", "index", "middle", "ring", "pinky"})
LEG = _group({"thigh", "thighTwist", "shin", "foot", "toe"})
HAND = _group({"hand", "thumb", "index", "middle", "ring", "pinky"})
SLEEVE = [i for i in ARM if not skeleton.NAMES[i].startswith("clavicle")]


class Landmarks:
    """Measurements the garments are cut from."""

    def __init__(self, joints, ends, body, eyes):
        self.joints = {name: position for name, (_, position) in joints.items()}
        self.ends = ends
        j = self.joints
        self.waist = j["spine"][1] + 0.035
        self.knee = j["shinL"][1]
        self.ankle = j["footL"][1]
        self.neck = j["neck"][1]
        self.eye = np.array([abs(eyes[:, 0]).mean(), eyes[:, 1].mean(), eyes[:, 2].mean()])
        skull = body[body[:, 1] > self.eye[1] + 0.02]
        self.crown = skull[:, 1].max()
        self.skull_front = skull[:, 2].max()
        self.skull_back = skull[:, 2].min()
        level = body[(abs(body[:, 1] - self.eye[1] - 0.045) < 0.012)]
        self.skull_half_width = abs(level[:, 0]).max()
        head = body[body[:, 1] > self.neck + 0.03]
        ear = head[abs(head[:, 0]) > abs(head[:, 0]).max() - 0.012]
        self.ear = np.array([abs(ear[:, 0]).max(), ear[:, 1].mean(), ear[:, 2].mean()])
        self.ear_top = ear[:, 1].max()
        self.ear_bottom = ear[:, 1].min()
        face = head[(abs(head[:, 0]) < 0.012) & (head[:, 2] > self.ear[2] + 0.03)]
        self.chin = face[face[:, 1].argmin()]


def _unwrap(angles):
    """Keeps the corners of one face on the same side of the cylinder seam."""
    angles = np.array(angles)
    return angles - TAU * np.round((angles - angles[0]) / TAU)


def cylinder_uvs(part, slot, centre, t_of, mirror_x=False, seam=math.pi):
    """UVs around a vertical-ish axis: `centre(points)` gives the axis point
    beside each vertex and `t_of(points)` its 0-1 position along the slot.
    Angles run from the front (+Z) towards +X; `seam` is where they wrap."""
    points = part.vertices.copy()
    if mirror_x:
        points[:, 0] *= -1
    offset = points - centre(points)
    angle = np.arctan2(offset[:, 0], offset[:, 2])
    turn = ((angle - seam) % TAU) / TAU
    along = t_of(points)
    for index, face in enumerate(part.faces):
        s = _unwrap(turn[face] * TAU) / TAU
        if s.mean() > 1:
            s -= 1
        elif s.mean() < 0:
            s += 1
        part.uvs[index] = [slot_uv(slot, a, b) for a, b in zip(s, along[face])]


def garments(mh, base, weights, marks):
    """Top, breeches and boots cut from the tights helper."""
    tights, source = mh.helper(base, "helper-tights")
    vertices, faces, skin = meshops.subdivide(tights.vertices, tights.faces, weights[source])
    normals = meshops.vertex_normals(vertices, faces)
    arm = skin[:, ARM].sum(axis=1) > 0.5
    leg = skin[:, LEG].sum(axis=1) > 0.5
    centroid = np.array([vertices[face].mean(axis=0) for face in faces])
    face_arm = np.array([arm[face].mean() > 0.5 for face in faces])
    face_leg = np.array([leg[face].mean() > 0.5 for face in faces])
    j = marks.joints

    # The boot top sits below the knee, higher on the outside (a Spanish top)
    # and dipping behind the knee so the leg can bend.
    def boot_top(points):
        side = np.sign(points[:, 0])
        knee = np.where(side[:, None] > 0, j["shinL"], j["shinR"])
        outward = (points[:, 0] - knee[:, 0]) * side
        forward = points[:, 2] - knee[:, 2]
        return marks.knee - 0.05 + 0.3 * np.clip(outward, -0.05, 0.05) + 0.25 * np.clip(forward, -0.06, 0.04)

    line = boot_top(centroid)
    is_top = face_arm | (~face_leg & (centroid[:, 1] > marks.waist - 0.05))
    is_top &= ~(face_leg & ~face_arm) & (centroid[:, 1] < marks.neck + 0.034)
    for side in ("L", "R"):
        # Sleeves end a little way inside the glove cuffs.
        start, end = j[f"forearm{side}"], j[f"hand{side}"]
        axis = (end - start) / np.linalg.norm(end - start)
        near = np.linalg.norm(centroid - end, axis=1) < 0.09
        is_top &= ~(near & ((centroid - end) @ axis > -0.03))
    is_boot = face_leg & (centroid[:, 1] < line)
    is_breeches = ~face_arm & (centroid[:, 1] < marks.waist) & (centroid[:, 1] > line - 0.07)

    def cut(keep, material):
        part = Part(material, vertices, faces, skin).subset(keep)
        used = sorted({v for face, flag in zip(faces, keep) if flag for v in face})
        return part, normals[used]

    # --- Top: a fitted long-sleeved training shirt with a stand collar.
    top, top_normals = cut(is_top, "top")
    trunk = top.weights[:, SLEEVE].sum(axis=1) < 0.5
    around = meshops.neighbours(len(top.vertices), top.faces)
    loops = meshops.boundary_loops(top.faces)
    fixed = np.zeros(len(top.vertices), bool)
    for loop in loops:
        fixed[loop] = True
    # Cloth spans hollows instead of clinging: smooth, but only ever outwards.
    position = top.vertices.copy()
    for _ in range(14):
        average = np.array([position[list(n)].mean(axis=0) if n else position[i] for i, n in enumerate(around)])
        push = np.einsum("ij,ij->i", average - position, top_normals)
        position += top_normals * np.where(trunk & ~fixed, np.clip(push, 0, None), 0)[:, None] * 0.6
    ease = 0.0045 * smoothstep(marks.waist - 0.01, marks.waist + 0.05, position[:, 1])
    top.vertices = position + top_normals * ease[:, None]
    for loop in loops:
        points = top.vertices[loop]
        if points[:, 1].mean() > marks.neck:
            # The collar stands a little off the neck and has a visible edge.
            top.vertices[loop, 1] = marks.neck + 0.036 + 0.1 * (points[:, 2] - points[:, 2].mean())
            points = top.vertices[loop]
            axis = points.mean(axis=0)
            radial = (points - axis) * [1, 0, 1]
            radial /= np.linalg.norm(radial, axis=1, keepdims=True)
            top.vertices[loop] += radial * 0.004
            meshops.add_lip(top, loop, -radial * [1, 0, 1] + [0, -1.2, 0], 0.006)
        elif abs(points[:, 0]).mean() > 0.3:
            pass
    # Sleeve ends narrow so they disappear into the glove cuffs.
    for side, sign in (("L", 1), ("R", -1)):
        wrist = j[f"hand{side}"]
        near = smoothstep(0.12, 0.05, np.linalg.norm(top.vertices[: len(top_normals)] - wrist, axis=1))
        top.vertices[: len(top_normals)] -= top_normals * (near * 0.005)[:, None]
    trunk_faces = np.array([top.weights[face][:, SLEEVE].sum(axis=1).mean() < 0.5 for face in top.faces])
    torso = top.subset(trunk_faces)
    z_axis = j["chest"][2] - 0.01
    y0, y1 = marks.waist - 0.08, marks.neck + 0.09
    cylinder_uvs(
        torso,
        "torso",
        lambda p: np.stack([np.zeros(len(p)), p[:, 1], np.full(len(p), z_axis)], 1),
        lambda p: (p[:, 1] - y0) / (y1 - y0),
    )
    sleeves = []
    for side, sign in (("L", 1), ("R", -1)):
        keep = ~trunk_faces & np.array([top.vertices[face][:, 0].mean() * sign > 0 for face in top.faces])
        sleeve = top.subset(keep)
        start, end = j["armL"], j["handL"]
        axis = (end - start) / np.linalg.norm(end - start)
        length = np.linalg.norm(end - start)

        def centre(p, start=start, axis=axis):
            return start + ((p - start) @ axis)[:, None] * axis

        # Turn the arm upright so the generic cylinder mapping applies.
        frame_x = np.cross([0, 0, 1], axis)
        frame_x /= np.linalg.norm(frame_x)
        frame_z = np.cross(frame_x, axis)
        mirrored = sleeve.vertices * [sign, 1, 1]
        local = mirrored - centre(mirrored)
        angle = np.arctan2(local @ frame_x, local @ frame_z)
        along = np.clip(((mirrored - start) @ axis) / length, -0.13, 1.02)
        for index, face in enumerate(sleeve.faces):
            s = _unwrap(((angle[face] - math.pi) % TAU)) / TAU
            s += 1 if s.mean() < 0 else (-1 if s.mean() > 1 else 0)
            sleeve.uvs[index] = [slot_uv("sleeve", a, 0.12 + 0.86 * b) for a, b in zip(s, along[face])]
        sleeves.append(sleeve)
    top = meshops.merge([torso] + sleeves, "top")

    def leg_centre(points):
        side = np.where(points[:, 0] >= 0, 1.0, -1.0)
        hip, knee, ankle = j["thighL"], j["shinL"], j["footL"]
        y = points[:, 1]
        upper = np.clip((hip[1] - y) / (hip[1] - knee[1]), 0, 1)[:, None]
        lower = np.clip((knee[1] - y) / (knee[1] - ankle[1]), 0, 1)[:, None]
        centre = hip + (knee - hip) * upper + (ankle - knee) * lower
        centre[:, 0] *= side
        centre[:, 1] = y
        return centre

    def leg_uvs(part, slot, low, high):
        pieces = []
        for sign in (1, -1):
            keep = np.array([part.vertices[face][:, 0].mean() * sign > 0 for face in part.faces])
            piece = part.subset(keep)
            mirrored = piece.vertices * [sign, 1, 1]
            # The pelvis crosses the midline; keep it on this side's cylinder.
            centre = leg_centre(np.abs(mirrored) * [1, 0, 0] + mirrored * [0, 1, 1])
            offset = mirrored - centre
            angle = np.arctan2(offset[:, 0], offset[:, 2])
            # The seam runs down the inside of the leg.
            turn = ((angle + math.pi / 2) % TAU) / TAU
            along = (mirrored[:, 1] - low) / (high - low)
            for index, face in enumerate(piece.faces):
                s = _unwrap(turn[face] * TAU) / TAU
                s += 1 if s.mean() < 0 else (-1 if s.mean() > 1 else 0)
                piece.uvs[index] = [slot_uv(slot, a, b) for a, b in zip(s, along[face])]
            pieces.append(piece)
        return meshops.merge(pieces, part.material)

    # --- Breeches: skin tight, with a firm waistband that the belt sits on.
    breeches, breeches_normals = cut(is_breeches, "breeches")
    band = smoothstep(marks.waist - 0.05, marks.waist - 0.03, breeches.vertices[:, 1])
    breeches.vertices += breeches_normals * (0.0015 + 0.004 * band)[:, None]
    for loop in meshops.boundary_loops(breeches.faces):
        points = breeches.vertices[loop]
        if points[:, 1].mean() > marks.waist - 0.03:
            breeches.vertices[loop, 1] = marks.waist
            radial = points * [1, 0, 1] - points.mean(axis=0) * [1, 0, 1]
            radial /= np.linalg.norm(radial, axis=1, keepdims=True)
            meshops.add_lip(breeches, loop, -radial, 0.008)
    breeches = leg_uvs(breeches, "leg", marks.knee - 0.14, marks.waist + 0.01)

    # --- Boots: the shaft follows the calf, the foot is reshaped below.
    boots, boot_normals = cut(is_boot, "boots")
    height = boots.vertices[:, 1]
    shaft = smoothstep(marks.ankle - 0.02, marks.ankle + 0.05, height)
    boots.vertices += boot_normals * (0.002 + 0.0035 * shaft)[:, None]
    for loop in meshops.boundary_loops(boots.faces):
        boots.vertices[loop, 1] = boot_top(boots.vertices[loop])
        points = boots.vertices[loop]
        radial = points * [1, 0, 1] - points.mean(axis=0) * [1, 0, 1]
        radial /= np.linalg.norm(radial, axis=1, keepdims=True)
        boots.vertices[loop] += radial * 0.003
        meshops.add_lip(boots, loop, -radial + [0, -0.6, 0], 0.012)
    shape_feet(boots, marks)
    foot_faces = np.array([boots.vertices[face][:, 1].mean() < marks.ankle + 0.015 for face in boots.faces])
    shafts = leg_uvs(boots.subset(~foot_faces), "shaft", 0.0, marks.knee)
    feet = boots.subset(foot_faces)
    for sign in (1, -1):
        mine = np.array([feet.vertices[face][:, 0].mean() * sign > 0 for face in feet.faces])
        points = feet.vertices * [sign, 1, 1]
        axis_x = j["footL"][0] + (j["toeL"][0] - j["footL"][0]) * 0.5
        angle = np.arctan2(points[:, 0] - axis_x, points[:, 1] - 0.035)
        along = (points[:, 2] - (j["footL"][2] - 0.07)) / 0.3
        for index, face in enumerate(feet.faces):
            if mine[index]:
                # The seam runs along the sole.
                s = _unwrap((angle[face] - math.pi) % TAU) / TAU
                s += 1 if s.mean() < 0 else (-1 if s.mean() > 1 else 0)
                feet.uvs[index] = [slot_uv("foot", a, b) for a, b in zip(s, along[face])]
    boots = meshops.merge([shafts, feet], "boots")
    return top, breeches, boots


HEEL = 0.022
SOLE = 0.009


def shape_feet(boots, marks):
    """Turns the sock-shaped foot into a boot foot: flat sole, raised heel, firmer toe."""
    j = marks.joints
    vertices = boots.vertices
    foot = vertices[:, 1] < marks.ankle + 0.02
    ball = j["toeL"][2]
    heel = j["footL"][2] - 0.045
    # Standing on a heel pitches the foot: the ball drops below the heel.
    drop = (HEEL - SOLE) * smoothstep(heel + 0.07, ball, vertices[:, 2])
    weight = smoothstep(marks.ankle + 0.03, marks.ankle - 0.02, vertices[:, 1])
    vertices[:, 1] -= drop * weight
    # Press the underside flat against the insole.
    floor = -drop * weight
    low = foot & (vertices[:, 1] < floor + 0.012)
    vertices[low, 1] = floor[low] + (vertices[low, 1] - floor[low]).clip(0, None) * 0.35 + 0.001
    # A slightly longer, squarer toe box than a bare foot.
    toe = smoothstep(ball - 0.01, ball + 0.06, vertices[:, 2]) * foot
    vertices[:, 2] += toe * 0.012
    vertices[:, 1] += toe * 0.004 * (vertices[:, 1] > floor + 0.012)


def soles(boots, marks):
    """Welted soles with a heel block, built from each foot's outline."""
    j = marks.joints
    parts = []
    for sign in (1, -1):
        mine = (boots.vertices[:, 0] * sign > 0) & (boots.vertices[:, 1] < marks.ankle - 0.03)
        points = boots.vertices[mine]
        low = points[points[:, 1] < points[:, 1].min() + 0.03]
        centre = np.array([low[:, 0].mean(), 0, (low[:, 2].min() + low[:, 2].max()) / 2])
        bins = 64
        angle = np.arctan2(low[:, 0] - centre[0], low[:, 2] - centre[2])
        index = np.floor((angle % TAU) / TAU * bins).astype(int) % bins
        radius = np.zeros(bins)
        np.maximum.at(radius, index, np.hypot(low[:, 0] - centre[0], low[:, 2] - centre[2]))
        filled = np.where(radius > 0)[0]
        radius = np.interp(np.arange(bins), np.r_[filled - bins, filled, filled + bins], np.tile(radius[filled], 3))
        radius = np.convolve(np.r_[radius[-3:], radius, radius[:3]], np.ones(5) / 5, mode="same")[3:-3] + 0.004
        theta = (np.arange(bins) + 0.5) / bins * TAU
        outline = np.stack([centre[0] + np.sin(theta) * radius, np.zeros(bins), centre[2] + np.cos(theta) * radius], 1)
        ball, heel = j["toeL"][2], j["footL"][2] - 0.045
        pitch = -(HEEL - SOLE) * smoothstep(heel + 0.07, ball, outline[:, 2])
        nearest_foot = points[meshops.nearest(outline, points)]
        weights = boots.weights[mine][meshops.nearest(outline, points)]
        del nearest_foot
        heel_front = heel + 0.085
        rings = []
        # Welt edge, sole edge, and the underside: flat at the heel and ball,
        # lifted under the arch.
        arch = smoothstep(heel_front - 0.004, heel_front + 0.004, outline[:, 2]) * (
            1 - smoothstep(ball - 0.06, ball - 0.01, outline[:, 2])
        )
        for inset, level in ((0.0, pitch + 0.006), (0.0, pitch - 0.003), (0.0, -HEEL + arch * (HEEL - SOLE) * 0.9)):
            ring = outline.copy()
            ring[:, 1] = level
            ring[:, [0, 2]] = centre[[0, 2]] + (ring[:, [0, 2]] - centre[[0, 2]]) * (1 - inset)
            rings.append(ring)
        under = rings[-1].copy()
        under[:, [0, 2]] = centre[[0, 2]] + (under[:, [0, 2]] - centre[[0, 2]]) * 0.45
        rings.append(under)
        vertices = np.vstack(rings + [[[centre[0], -HEEL, centre[2]]]])
        faces, uvs = [], []
        for ring in range(3):
            for i in range(bins):
                a, b = ring * bins + i, ring * bins + (i + 1) % bins
                quad = [a, b, b + bins, a + bins]
                faces.append(quad if sign > 0 else quad[::-1])
        last = 3 * bins
        for i in range(bins):
            tri = [last + i, last + (i + 1) % bins, 4 * bins]
            faces.append(tri if sign > 0 else tri[::-1])
        for face in faces:
            uvs.append([slot_uv("sole", (v % bins) / bins if v < 4 * bins else 0.5, min(v // bins, 4) / 4) for v in face])
        parts.append(Part("soles", vertices, faces, np.vstack([np.tile(weights, (4, 1)), weights.mean(axis=0, keepdims=True)]), uvs))
    return meshops.merge(parts, "soles")


def gloves(mh, base, weights, marks):
    """Thin riding gloves over the hands, with a cuff over the sleeve ends."""
    body = mh.body(base)
    hand = weights[: len(body.vertices)][:, HAND].sum(axis=1)
    j = marks.joints
    reach = np.zeros(len(body.vertices))
    for side, sign in (("L", 1), ("R", -1)):
        start, end = j[f"forearm{side}"], j[f"hand{side}"]
        axis = (end - start) / np.linalg.norm(end - start)
        along = (body.vertices - end) @ axis
        radial = np.linalg.norm((body.vertices - end) - along[:, None] * axis, axis=1)
        near = (radial < 0.06) & (body.vertices[:, 0] * sign > 0)
        reach = np.where(near, np.maximum(reach, smoothstep(-0.075, -0.05, along)), reach)
    inside = (hand > 0.5) | (reach > 0)
    keep = [all(inside[v] for v in face) for face in body.faces]
    normals = meshops.vertex_normals(body.vertices, body.faces)
    offset = 0.0016 + 0.0095 * reach * (hand < 0.6)
    # Leather hides nails and knuckle creases: smooth the hands, then let the
    # glove out again by what the smoothing took off the fingers.
    smooth = body.vertices.copy()
    around = meshops.neighbours(len(smooth), body.faces)
    hands = np.where(hand > 0.5)[0]
    for _ in range(6):
        average = np.array([smooth[list(around[v])].mean(axis=0) for v in hands])
        smooth[hands] += (average - smooth[hands]) * 0.5
    offset = offset + 0.0016 * (hand > 0.5)
    moved = Part("gloves", smooth + normals * offset[:, None], body.faces, weights[: len(body.vertices)])
    uv = mh.base.uvs
    moved.uvs = [[tuple(uv[i]) for i in corners] for corners in body.face_uvs]
    part = moved.subset(keep)
    # Straighten each cuff edge onto a plane across the forearm.
    for loop in meshops.boundary_loops(part.faces):
        points = part.vertices[loop]
        side = "L" if points[:, 0].mean() > 0 else "R"
        start, end = j[f"forearm{side}"], j[f"hand{side}"]
        axis = (end - start) / np.linalg.norm(end - start)
        part.vertices[loop] -= (((points - end) @ axis) + 0.062)[:, None] * axis
    corners = np.array([c for face in part.uvs for c in face])
    low, high = corners.min(axis=0), corners.max(axis=0)
    part.uvs = [[slot_uv("glove", *((np.array(c) - low) / (high - low)) * [1, 1]) for c in face] for face in part.uvs]
    for loop in meshops.boundary_loops(part.faces):
        points = part.vertices[loop]
        radial = points - points.mean(axis=0)
        radial /= np.linalg.norm(radial, axis=1, keepdims=True)
        meshops.add_lip(part, loop, -radial, 0.006)
    return part


def skin(mh, base, weights, marks):
    """Head and neck; the rest of the body is covered."""
    body = mh.body(base)
    keep = [all(body.vertices[v][1] > marks.neck - 0.025 for v in face) for face in body.faces]
    part = Part("skin", body.vertices, body.faces, weights[: len(body.vertices)])
    part.uvs = [[tuple(mh.base.uvs[i]) for i in corners] for corners in body.face_uvs]
    return part.subset(keep)


def head_bone(count):
    weights = np.zeros((count, len(skeleton.NAMES)), np.float32)
    weights[:, skeleton.NAMES.index("head")] = 1
    return weights


def fitted_asset(mh, base, folder, name, material):
    mesh, _, _, _ = mh.fitted(folder, name, base)
    part = Part(material, mesh.vertices, mesh.faces, head_bone(len(mesh.vertices)))
    part.uvs = [[tuple(mesh.uvs[i]) for i in corners] for corners in mesh.face_uvs]
    return part


def helmet(marks):
    """A modern riding helmet: rounded shell, fixed peak, rim and harness."""
    eye = marks.eye
    centre = np.array([0.0, eye[1] + 0.05, (marks.skull_front + marks.skull_back) / 2 - 0.004])
    side = marks.skull_half_width + 0.027
    depth = (marks.skull_front - marks.skull_back) / 2 + 0.03
    top = marks.crown - centre[1] + 0.028
    columns, rows = 64, 16

    def rim_drop(theta):
        # Above the brow in front, clear of the ears, low over the back of the skull.
        back = (1 - np.cos(theta)) / 2
        return 0.012 + 0.05 * back**1.5 - 0.004 * np.sin(theta) ** 2

    equator = 0.24

    def shell(theta, v):
        """A point of the shell; v runs from 0 at the rim to 1 at the crown."""
        theta, v = np.asarray(theta, np.float64), np.asarray(v, np.float64)
        power = 2.35
        ring = (np.abs(np.sin(theta)) ** power + np.abs(np.cos(theta)) ** power) ** (-1 / power)
        latitude = np.clip((v - equator) / (1 - equator), 0, 1) * (math.pi / 2)
        skirt = np.clip((equator - v) / equator, 0, 1)
        spread = np.cos(latitude) ** 0.85 * (1 - 0.07 * skirt**2)
        x = np.sin(theta) * ring * side * spread
        z = np.cos(theta) * ring * depth * spread
        y = np.sin(latitude) * top - rim_drop(theta) * skirt
        # A raised centre strip from front to back.
        strip = 0.0035 * (1 - smoothstep(0.012, 0.03, np.abs(x)))
        point = np.stack([x, y, z], -1)
        length = np.linalg.norm(point, axis=-1, keepdims=True)
        return centre + point + point / length * strip[..., None]

    theta = (np.arange(columns) / columns) * TAU
    grid_v = np.linspace(0, 1, rows + 1)[:-1]
    vertices = [shell(theta, np.full(columns, v)) for v in grid_v]
    vertices = np.vstack(vertices + [shell(np.array([0.0]), np.array([1.0]))])
    faces, uvs = [], []

    def uv(index):
        if index == columns * rows:
            return slot_uv("helmet", 0.5, 0.5)
        ring, column = divmod(index, columns)
        radius = 0.48 * (1 - grid_v[ring])
        angle = column / columns * TAU
        return slot_uv("helmet", 0.5 + radius * math.sin(angle), 0.5 + radius * math.cos(angle))

    for ring in range(rows - 1):
        for column in range(columns):
            a, b = ring * columns + column, ring * columns + (column + 1) % columns
            faces.append([a, b, b + columns, a + columns])
    last = (rows - 1) * columns
    for column in range(columns):
        faces.append([last + column, last + (column + 1) % columns, columns * rows])
    uvs = [[uv(v) for v in face] for face in faces]
    part = Part("helmet", vertices, faces, head_bone(len(vertices)), uvs)
    rim = list(range(columns))
    rim_points = part.vertices[rim]
    inward = (centre - rim_points) * [1, 0, 1]
    inward /= np.linalg.norm(inward, axis=1, keepdims=True)
    meshops.add_lip(part, rim, inward + [0, 0.15, 0], 0.024)

    # The peak: a short fixed brim curving out of the front of the shell.
    span = math.radians(66)
    steps, reach = 22, 5
    peak_vertices, peak_faces = [], []
    for layer, lift in ((0, 0.0), (1, -0.007)):
        for i in range(steps + 1):
            angle = -span + 2 * span * i / steps
            base = shell(np.array([angle]), np.array([0.07 if layer == 0 else 0.0]))[0]
            outward = np.array([math.sin(angle) * 0.55, 0, math.cos(angle)])
            outward /= np.linalg.norm(outward)
            profile = math.cos(angle / span * math.pi / 2) ** 0.8
            for k in range(reach + 1):
                t = k / reach
                point = base + outward * 0.058 * profile * t + np.array([0, -0.014 * t**1.5 * profile + lift * (1 - 0.5 * t), 0])
                peak_vertices.append(point)
    row = reach + 1
    per_layer = (steps + 1) * row
    for layer in (0, 1):
        for i in range(steps):
            for k in range(reach):
                a = layer * per_layer + i * row + k
                quad = [a, a + 1, a + row + 1, a + row]
                peak_faces.append(quad if layer == 0 else quad[::-1])
    for i in range(steps):
        a, b = i * row + reach, (i + 1) * row + reach
        peak_faces.append([a, a + per_layer, b + per_layer, b])
    for k in range(reach):
        for i, flip in ((0, False), (steps, True)):
            a = i * row + k
            quad = [a, a + per_layer, a + 1 + per_layer, a + 1]
            peak_faces.append(quad[::-1] if flip else quad)
    peak_uv = slot_uv("helmet", 0.06, 0.06)
    peak = Part("helmet", np.array(peak_vertices), peak_faces, head_bone(len(peak_vertices)), [[peak_uv] * len(f) for f in peak_faces])
    return meshops.merge([part, peak], "helmet"), shell, centre


def ribbon(points, normals, width, material, slot, weights_of):
    """A flat strap along `points`, lying on the surface described by `normals`."""
    points, normals = np.asarray(points), np.asarray(normals)
    tangent = np.gradient(points, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    across = np.cross(tangent, normals)
    across /= np.linalg.norm(across, axis=1, keepdims=True)
    left, right = points - across * width / 2, points + across * width / 2
    vertices = np.vstack([left, right])
    n = len(points)
    length = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    faces, uvs = [], []
    for i in range(n - 1):
        faces.append([i, i + 1, n + i + 1, n + i])
        # Straps repeat their weave every 12 cm.
        a, b = length[i] / 0.12, length[i + 1] / 0.12
        uvs.append([slot_uv(slot, a % 1 if b % 1 > a % 1 else 0, t) for a, t in ((a, 0.1), (b, 0.1), (b, 0.9), (a, 0.9))])
    return Part(material, vertices, faces, weights_of(len(vertices)), uvs)


def harness(marks, skin_part, shell):
    """Helmet straps: two on each side meeting under the ear, and a chin strap."""
    normals = meshops.vertex_normals(skin_part.vertices, skin_part.faces)

    def on_skin(points, lift=0.0035):
        index = meshops.nearest(points, skin_part.vertices)
        snapped, normal = skin_part.vertices[index] + normals[index] * lift, normals[index].copy()
        # Nearest vertices zigzag; a strap under tension runs smoothly.
        for _ in range(3):
            snapped[1:-1] = (snapped[:-2] + 2 * snapped[1:-1] + snapped[2:]) / 4
            normal[1:-1] = (normal[:-2] + 2 * normal[1:-1] + normal[2:]) / 4
        return snapped, normal / np.linalg.norm(normal, axis=1, keepdims=True)

    def curve(a, b, c, count=12):
        t = np.linspace(0, 1, count)[:, None]
        return (1 - t) ** 2 * a + 2 * t * (1 - t) * b + t**2 * c

    parts = []
    ear = marks.ear
    for sign in (1, -1):
        junction = np.array([sign * (ear[0] - 0.016), marks.ear_bottom - 0.012, ear[2] + 0.004])
        front = shell(np.array([sign * math.radians(58)]), np.array([0.0]))[0]
        rear = shell(np.array([sign * math.radians(128)]), np.array([0.0]))[0]
        for start, bend in ((front, [sign * 0.004, 0, 0.012]), (rear, [sign * 0.004, 0, -0.012])):
            middle = (start + junction) / 2 + bend
            points = curve(start + [0, 0.01, 0], middle, junction)
            snapped, normal = on_skin(points)
            # Near the rim the strap hangs from the helmet, then lies on the cheek.
            blend = smoothstep(0.0, 0.5, np.linspace(0, 1, len(points)))[:, None]
            outward = (points - [0, points[0][1], ear[2]]) * [1, 0, 1]
            outward /= np.linalg.norm(outward, axis=1, keepdims=True)
            parts.append(ribbon(points * (1 - blend) + snapped * blend, outward * (1 - blend) + normal * blend, 0.016, "strap", "strap", head_bone))
    chin = marks.chin + [0, -0.004, -0.03]
    left = np.array([ear[0] - 0.016, marks.ear_bottom - 0.012, ear[2] + 0.004])
    path = np.vstack([curve(left, (left + chin) / 2 + [0.012, -0.012, 0], chin, 10)[:-1], curve(chin, (left + chin) / 2 * [-1, 1, 1] + [-0.012, -0.012, 0], left * [-1, 1, 1], 10)])
    snapped, normal = on_skin(path, 0.004)
    parts.append(ribbon(snapped, normal, 0.016, "strap", "strap", head_bone))
    return meshops.merge(parts, "strap")


def belt(breeches, marks):
    """A leather belt over the waistband with a plain buckle."""
    level = marks.waist - 0.022
    band = breeches.vertices[abs(breeches.vertices[:, 1] - level) < 0.02]
    centre = np.array([0, level, band[:, 2].mean()])
    bins = 72
    angle = np.arctan2(band[:, 0], band[:, 2] - centre[2])
    index = np.floor((angle % TAU) / TAU * bins).astype(int) % bins
    radius = np.zeros(bins)
    np.maximum.at(radius, index, np.hypot(band[:, 0], band[:, 2] - centre[2]))
    filled = np.where(radius > 0)[0]
    radius = np.interp(np.arange(bins), np.r_[filled - bins, filled, filled + bins], np.tile(radius[filled], 3))
    radius = np.convolve(np.r_[radius[-2:], radius, radius[:2]], np.ones(5) / 5, mode="same")[2:-2]
    radius = (radius + radius[(-np.arange(bins) - 1) % bins]) / 2
    theta = (np.arange(bins) + 0.5) / bins * TAU
    direction = np.stack([np.sin(theta), np.zeros(bins), np.cos(theta)], 1)
    profile = [(0.0015, -0.015), (0.005, -0.015), (0.005, 0.015), (0.0015, 0.015)]
    vertices = np.vstack([centre + direction * (radius + out)[:, None] + [0, up, 0] for out, up in profile])
    faces, uvs = [], []
    for ring in range(3):
        for i in range(bins):
            a, b = ring * bins + i, ring * bins + (i + 1) % bins
            faces.append([a, b, b + bins, a + bins])
            uvs.append([slot_uv("belt", (i + k) / bins, ring / 3 + r / 3) for k, r in ((0, 0), (1, 0), (1, 1), (0, 1))])
    weights = breeches.weights[meshops.nearest(vertices, breeches.vertices)]
    strap = Part("belt", vertices, faces, weights, uvs)
    # Buckle: a small rounded frame at the front.
    front = centre + [0, 0, radius[0] + 0.0055]
    ring_points, ring_faces = [], []
    sides, around = 16, 6
    for i in range(sides):
        a = i / sides * TAU
        middle = front + [0.016 * math.copysign(abs(math.sin(a)) ** 0.6, math.sin(a)), 0.02 * math.copysign(abs(math.cos(a)) ** 0.6, math.cos(a)), 0]
        out = np.array([math.sin(a), math.cos(a), 0])
        for k in range(around):
            b = k / around * TAU
            ring_points.append(middle + out * 0.0028 * math.cos(b) + np.array([0, 0, 0.0022 * math.sin(b)]))
    for i in range(sides):
        for k in range(around):
            a = i * around + k
            b = i * around + (k + 1) % around
            c = ((i + 1) % sides) * around + (k + 1) % around
            d = ((i + 1) % sides) * around + k
            ring_faces.append([a, d, c, b])
    ring_points = np.array(ring_points)
    buckle = Part("metal", ring_points, ring_faces, breeches.weights[meshops.nearest(ring_points, breeches.vertices)])
    return strap, buckle


TAIL_BONES = ["tail1", "tail2", "tail3"]


def hair(mh, base, weights, marks, shell, centre):
    """Hair drawn back under the helmet into a low ponytail.

    Returns the hair part and the ponytail's joints; its weights use three
    extra bone columns appended after the body skeleton.
    """
    body = mh.body(base)
    normals = meshops.vertex_normals(body.vertices, body.faces)
    y, z = body.vertices[:, 1], body.vertices[:, 2]
    ear_z = marks.ear[2]
    # The hairline: across the forehead under the helmet, down in front of the
    # ear as a short sideburn, over the ear and low across the nape.
    rising = marks.ear_top + 1.3 * (z - ear_z - 0.03)
    front = np.clip(rising, marks.ear[1] - 0.005, marks.eye[1] + 0.078)
    over_ear = smoothstep(ear_z + 0.004, ear_z + 0.02, z)
    behind = smoothstep(ear_z - 0.006, ear_z - 0.03, z)
    line = marks.ear_top + (front - marks.ear_top) * over_ear + (marks.ear_bottom - 0.034 - marks.ear_top) * behind
    scalp = y > line
    ear = (
        (abs(body.vertices[:, 0]) > marks.skull_half_width * 0.9)
        & (body.vertices[:, 1] > marks.ear_bottom - 0.006)
        & (body.vertices[:, 1] < marks.ear_top + 0.008)
        & (body.vertices[:, 2] > marks.ear[2] - 0.014)
        & (body.vertices[:, 2] < marks.ear[2] + 0.03)
    )
    scalp &= ~ear
    keep = [any(scalp[v] for v in face) and not any(ear[v] for v in face) for face in body.faces]
    # Pull the ragged lower edge up onto the hairline itself.
    lifted = body.vertices + normals * 0.004
    below = (lifted[:, 1] < line) & ~ear
    lifted[below, 1] = line[below]
    cap = Part("hair", lifted, body.faces, head_bone(len(body.vertices)))
    cap = cap.subset(keep)
    spot = cap.vertices - centre
    turn = (np.arctan2(spot[:, 0], spot[:, 2]) % TAU) / TAU
    rise = np.arctan2(spot[:, 1], np.hypot(spot[:, 0], spot[:, 2])) / math.pi + 0.5
    for index, face in enumerate(cap.faces):
        s = _unwrap(turn[face] * TAU) / TAU
        cap.uvs[index] = [slot_uv("hair", a % 1 if abs(a % 1 - s[0] % 1) < 0.5 else s[0] % 1, 0.55 + 0.45 * b) for a, b in zip(s, rise[face])]

    # The ponytail leaves under the back of the rim and hangs between the shoulders.
    # It grows out of the scalp at the nape: start a little inside the head.
    rim = shell(np.array([math.pi]), np.array([0.0]))[0]
    nape = body.vertices[(abs(body.vertices[:, 0]) < 0.02) & (abs(body.vertices[:, 1] - (rim[1] - 0.022)) < 0.012)]
    scalp_point = np.array([0.0, rim[1] - 0.022, nape[:, 2].min()])
    root = scalp_point + [0, 0.004, 0.02]
    path_control = [
        root,
        scalp_point + [0, -0.006, -0.03],
        scalp_point + [0, -0.09, -0.052],
        scalp_point + [0, -0.19, -0.034],
        scalp_point + [0, -0.265, -0.03],
    ]
    samples = 14
    t = np.linspace(0, 1, samples)
    path = np.zeros((samples, 3))
    n = len(path_control) - 1
    for i, control in enumerate(path_control):
        path += (math.comb(n, i) * t**i * (1 - t) ** (n - i))[:, None] * control
    radius = 0.026 * (0.75 + 0.5 * np.sin(np.clip(t * 2.2, 0, math.pi / 2))) * (1 - smoothstep(0.55, 1.0, t) * 0.8)
    # Wide where the hair is gathered off the scalp, tight at the band.
    radius *= 1 + 0.5 * (1 - smoothstep(0.0, 0.14, t))
    around = 12
    tangent = np.gradient(path, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    side = np.array([1.0, 0, 0])
    vertices, faces, uvs = [], [], []
    for i in range(samples):
        up = np.cross(tangent[i], side)
        for k in range(around):
            a = k / around * TAU
            # A few thick locks rather than a smooth tube.
            lumps = 1 + 0.1 * math.sin(a * 5 + i * 0.5) * min(1, i / 3)
            vertices.append(path[i] + (side * math.cos(a) * 1.25 + up * math.sin(a) * 0.85) * radius[i] * lumps)
    vertices.append(path[-1] + tangent[-1] * 0.012)
    for i in range(samples - 1):
        for k in range(around):
            a, b = i * around + k, i * around + (k + 1) % around
            faces.append([a, a + around, b + around, b])
            uvs.append([slot_uv("hair", (k + dk) / around, 0.5 * (1 - (i + di) / (samples - 1))) for dk, di in ((0, 0), (0, 1), (1, 1), (1, 0))])
    tip = (samples - 1) * around
    for k in range(around):
        faces.append([tip + k, samples * around, tip + (k + 1) % around])
        uvs.append([slot_uv("hair", k / around, 0.0)] * 3)
    vertices = np.array(vertices)
    bones = len(skeleton.NAMES)
    joints = [path[1], path[5], path[9]]
    tail_weights = np.zeros((len(vertices), bones + 3), np.float32)
    position = np.r_[np.repeat(t, around), 1.0]
    starts = [t[1], t[5], t[9]]
    tail_weights[:, skeleton.NAMES.index("head")] = 1 - smoothstep(starts[0] - 0.04, starts[0] + 0.06, position)
    for index in range(3):
        rise_in = smoothstep(starts[index] - 0.04, starts[index] + 0.06, position)
        fall = 1 - smoothstep(starts[index + 1] - 0.04, starts[index + 1] + 0.06, position) if index < 2 else 1
        tail_weights[:, bones + index] = rise_in * fall
    tail = Part("hair", vertices, faces, tail_weights, uvs)
    # A band where the hair is gathered.
    band_at = path[2]
    band_vertices, band_faces = [], []
    up = np.cross(tangent[2], side)
    for i in range(16):
        a = i / 16 * TAU
        middle = band_at + (side * math.cos(a) * 1.25 + up * math.sin(a) * 0.85) * (radius[2] + 0.002)
        out = side * math.cos(a) + up * math.sin(a)
        for k in range(6):
            b = k / 6 * TAU
            band_vertices.append(middle + out * 0.005 * math.cos(b) + tangent[2] * 0.006 * math.sin(b))
    for i in range(16):
        for k in range(6):
            band_faces.append([i * 6 + k, ((i + 1) % 16) * 6 + k, ((i + 1) % 16) * 6 + (k + 1) % 6, i * 6 + (k + 1) % 6])
    band_weights = np.zeros((len(band_vertices), bones + 3), np.float32)
    band_weights[:] = tail_weights[2 * around]
    band = Part("strap", np.array(band_vertices), band_faces, band_weights, [[slot_uv("strap", 0.5, 0.5)] * 4 for _ in band_faces])
    cap.weights = np.hstack([cap.weights, np.zeros((len(cap.vertices), 3), np.float32)])
    return meshops.merge([cap, tail], "hair"), band, joints
