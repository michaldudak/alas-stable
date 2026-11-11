import * as THREE from 'three';
import {
	DEFAULT_RIDER_MODEL,
	riderAsset,
	type RiderModelId,
	type RiderTextures,
} from './rider-asset.ts';
import { hairSurface, surface } from './geometry.ts';

type Side = 'L' | 'R';
type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
type SideBone =
	| 'clavicle'
	| 'arm'
	| 'armTwist'
	| 'forearm'
	| 'forearmTwist'
	| 'hand'
	| 'thigh'
	| 'thighTwist'
	| 'shin'
	| 'foot'
	| 'toe'
	| `${Finger}${1 | 2 | 3}`;
export type BoneName =
	| 'hips'
	| 'spine'
	| 'chest'
	| 'neck'
	| 'head'
	| 'tail1'
	| 'tail2'
	| 'tail3'
	| `${SideBone}${Side}`;

const FINGERS: Finger[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const SIDES: Side[] = ['L', 'R'];

/** The bone each bone points at in the rest pose; others point at a chain end. */
const NEXT: Partial<Record<string, string>> = {
	hips: 'spine',
	spine: 'chest',
	chest: 'neck',
	neck: 'head',
	tail1: 'tail2',
	tail2: 'tail3',
};
/** Bones that pass part of their twist on to a child bone lying along them. */
const TWIST_CHILD: Partial<Record<string, string>> = {};
/** Bones whose own twist is shared with the twist bone they hang from. */
const TWIST_PARENT: Partial<Record<string, string>> = {};
for (const side of SIDES) {
	// Twist bones sit part-way along a limb; each limb bone points at the
	// limb's next real joint so that lengths and hinges stay exact.
	const chain = [
		['clavicle', 'arm'],
		['arm', 'forearm'],
		['armTwist', 'forearm'],
		['forearm', 'hand'],
		['forearmTwist', 'hand'],
		['thigh', 'shin'],
		['thighTwist', 'shin'],
		['shin', 'foot'],
		['foot', 'toe'],
	];
	for (const [from, to] of chain) NEXT[from + side] = to + side;
	for (const finger of FINGERS) {
		NEXT[`${finger}1${side}`] = `${finger}2${side}`;
		NEXT[`${finger}2${side}`] = `${finger}3${side}`;
	}
	TWIST_CHILD[`arm${side}`] = `armTwist${side}`;
	TWIST_CHILD[`thigh${side}`] = `thighTwist${side}`;
	TWIST_PARENT[`hand${side}`] = `forearmTwist${side}`;
}
/** The joint a two-bone limb reaches with: its lower bone ends there. */
const LIMB_END: Partial<Record<string, string>> = {
	forearmL: 'handL',
	forearmR: 'handR',
	shinL: 'footL',
	shinR: 'footR',
};

const occlusionVertex = /* glsl */ `
attribute float ao;
varying float vOcclusion;`;

/** Applies the model's baked occlusion to indirect light and, gently, to colour. */
function withOcclusion<T extends THREE.MeshStandardMaterial>(material: T) {
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${occlusionVertex}`)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvOcclusion = ao;',
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				'#include <common>\nvarying float vOcclusion;',
			)
			.replace(
				'#include <map_fragment>',
				'#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, vOcclusion, 0.45);',
			)
			.replace(
				'#include <aomap_fragment>',
				'#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vOcclusion;',
			);
	};
	return material;
}

/** Colours worn by a rider; unset parts keep the default outfit. */
export interface Outfit {
	jacket?: string;
	breeches?: string;
	helmet?: string;
	hair?: string;
	boots?: string;
	gloves?: string;
}

const DEFAULT_OUTFIT: Required<Outfit> = {
	jacket: '#2e4260',
	breeches: '#ddd3bf',
	helmet: '#26302f',
	hair: '#5a3d2a',
	boots: '#1d1916',
	gloves: '#3b2f27',
};
/** The asset material each outfit colour dyes. */
const OUTFIT_MATERIAL: Record<keyof Outfit, string> = {
	jacket: 'top',
	breeches: 'breeches',
	helmet: 'helmet',
	hair: 'hair',
	boots: 'boots',
	gloves: 'gloves',
};

function clothing(textures: RiderTextures) {
	const cloth = (colour: string, roughness: number, bump = 1) => {
		const material = surface(colour, roughness);
		material.map = textures.outfit ?? null;
		material.normalMap = textures.outfitNormal ?? null;
		material.normalScale.set(bump, bump);
		return material;
	};
	const skin = new THREE.MeshPhysicalMaterial({
		color: '#ffffff',
		map: textures.skin ?? null,
		roughness: 0.52,
		sheen: 0.35,
		sheenColor: new THREE.Color('#ff9d85'),
		sheenRoughness: 0.5,
	});
	if (!textures.skin) skin.color.set('#e2b193');
	const eyes = new THREE.MeshPhysicalMaterial({
		color: '#ffffff',
		map: textures.face ?? null,
		roughness: 0.12,
		clearcoat: 1,
		clearcoatRoughness: 0.05,
	});
	const lashes = new THREE.MeshStandardMaterial({
		color: '#ffffff',
		map: textures.face ?? null,
		roughness: 0.8,
		transparent: true,
		alphaTest: 0.04,
		depthWrite: false,
		side: THREE.DoubleSide,
	});
	lashes.visible = !!textures.face;
	const hair = hairSurface(DEFAULT_OUTFIT.hair, 0.5);
	hair.map = textures.outfit ?? null;
	hair.normalMap = textures.outfitNormal ?? null;
	hair.side = THREE.DoubleSide;
	const boots = cloth(DEFAULT_OUTFIT.boots, 0.3);
	const strap = cloth('#17181a', 0.8);
	strap.side = THREE.DoubleSide;
	const metal = surface('#c8c9cc', 0.3);
	metal.metalness = 1;
	const palette: Record<string, THREE.MeshStandardMaterial> = {
		skin,
		eyes,
		lashes,
		hair,
		top: cloth(DEFAULT_OUTFIT.jacket, 0.78),
		breeches: cloth(DEFAULT_OUTFIT.breeches, 0.82),
		boots,
		soles: cloth('#100f0e', 0.85),
		gloves: cloth(DEFAULT_OUTFIT.gloves, 0.62),
		belt: cloth('#5b3a22', 0.5),
		metal,
		helmet: cloth(DEFAULT_OUTFIT.helmet, 0.55),
		strap,
	};
	for (const [name, material] of Object.entries(palette)) {
		material.name = name;
		withOcclusion(material);
	}
	return palette;
}

/** Splits `q` into a twist about the unit `axis` (written to `twist`) and the remaining swing. */
function splitTwist(
	q: THREE.Quaternion,
	axis: THREE.Vector3,
	swing: THREE.Quaternion,
	twist: THREE.Quaternion,
) {
	const along = q.x * axis.x + q.y * axis.y + q.z * axis.z;
	twist.set(axis.x * along, axis.y * along, axis.z * along, q.w);
	if (twist.lengthSq() < 1e-10) twist.identity();
	else twist.normalize();
	swing.copy(q).multiply(scratchInverse.copy(twist).invert());
}
const scratchInverse = new THREE.Quaternion(),
	identity = new THREE.Quaternion();

export type Figure = ReturnType<typeof createFigure>;

/**
 * A rider's skinned body with bones in figure space (soles on the ground,
 * facing +Z, left at +X). Rest rotations are all identity, so poses are set by
 * aiming bones along directions given in figure space.
 */
export function createFigure(model: RiderModelId = DEFAULT_RIDER_MODEL) {
	const { geometry, materials: names, rig, textures } = riderAsset(model);
	const root = new THREE.Group();
	root.name = 'figure';
	const bones = {} as Record<BoneName, THREE.Bone>;
	const rest = {} as Record<BoneName, THREE.Vector3>;
	for (const [name, { parent, position }] of Object.entries(rig.bones) as [
		BoneName,
		{ parent: BoneName | null; position: [number, number, number] },
	][]) {
		const bone = new THREE.Bone();
		bone.name = name;
		const world = new THREE.Vector3(...position);
		if (parent) {
			bone.position.copy(world).sub(rest[parent]);
			bones[parent].add(bone);
		} else {
			bone.position.copy(world);
			root.add(bone);
		}
		bones[name] = bone;
		rest[name] = world;
	}
	// Rest directions from each joint to the next, in figure space.
	const directions = {} as Record<BoneName, THREE.Vector3>;
	const ends = {} as Record<BoneName, THREE.Vector3>;
	for (const name of Object.keys(bones) as BoneName[]) {
		const next = NEXT[name] as BoneName | undefined;
		const end = next
			? rest[next]
			: rig.ends[name]
				? new THREE.Vector3(...rig.ends[name])
				: undefined;
		if (end) {
			ends[name] = end.clone();
			directions[name] = end.clone().sub(rest[name]).normalize();
		} else {
			// The last bone of a chain continues its parent's line.
			const parent = rig.bones[name].parent as BoneName;
			directions[name] = directions[parent].clone();
			ends[name] = rest[name].clone().addScaledVector(directions[name], 0.1);
		}
	}
	const palette = clothing(textures);
	const skin = new THREE.SkinnedMesh(
		geometry,
		names.map((name) => palette[name] ?? palette.top),
	);
	skin.name = 'rider-body';
	skin.castShadow = true;
	skin.receiveShadow = true;
	skin.frustumCulled = false;
	root.add(skin);
	root.updateMatrixWorld(true);
	skin.bind(new THREE.Skeleton(Object.values(bones)));

	const chain: THREE.Object3D[] = [];
	function ancestry(bone: THREE.Object3D) {
		chain.length = 0;
		for (
			let node: THREE.Object3D | null = bone;
			node && node !== root;
			node = node.parent
		)
			chain.push(node);
		return chain;
	}
	/** Orientation of a bone in figure space. */
	const figureQuaternion = (bone: THREE.Object3D, out: THREE.Quaternion) => {
		out.identity();
		const nodes = ancestry(bone);
		for (let i = nodes.length - 1; i >= 0; i--)
			out.multiply(nodes[i].quaternion);
		return out;
	};
	const walk = new THREE.Quaternion(),
		step = new THREE.Vector3();
	/** Position of a bone's joint in figure space. */
	const figurePosition = (bone: THREE.Object3D, out: THREE.Vector3) => {
		const nodes = ancestry(bone);
		out.set(0, 0, 0);
		walk.identity();
		for (let i = nodes.length - 1; i >= 0; i--) {
			out.add(step.copy(nodes[i].position).applyQuaternion(walk));
			walk.multiply(nodes[i].quaternion);
		}
		return out;
	};
	const parentQuaternion = new THREE.Quaternion(),
		desired = new THREE.Quaternion(),
		twist = new THREE.Quaternion(),
		swing = new THREE.Quaternion(),
		local = new THREE.Quaternion(),
		forward = new THREE.Vector3(0, 0, 1),
		dir = new THREE.Vector3(),
		turned = new THREE.Vector3(),
		wanted = new THREE.Vector3(),
		cross = new THREE.Vector3();

	/**
	 * Points `name` along `direction` (figure space). `hint` picks the twist:
	 * the bone's rest `reference` axis (forward by default) turns towards it.
	 * Upper arms and thighs hand part of their twist to the twist bone below
	 * them, and a hand shares its twist with the lower forearm, so the skin
	 * turns gradually along the limb.
	 */
	function aim(
		name: BoneName,
		direction: THREE.Vector3,
		hint?: THREE.Vector3,
		reference = forward,
	) {
		dir.copy(direction).normalize();
		desired.setFromUnitVectors(directions[name], dir);
		if (hint) {
			turned.copy(reference).applyQuaternion(desired).projectOnPlane(dir);
			wanted.copy(hint).projectOnPlane(dir);
			if (turned.lengthSq() > 1e-6 && wanted.lengthSq() > 1e-6) {
				turned.normalize();
				wanted.normalize();
				const angle = Math.atan2(
					cross.crossVectors(turned, wanted).dot(dir),
					turned.dot(wanted),
				);
				desired.premultiply(twist.setFromAxisAngle(dir, angle));
			}
		}
		const bone = bones[name];
		const twistParent = TWIST_PARENT[name] as BoneName | undefined;
		if (twistParent) {
			// Measure against the forearm itself, then share the twist.
			const carrier = bones[twistParent];
			carrier.quaternion.identity();
			figureQuaternion(carrier, parentQuaternion);
			local.copy(parentQuaternion.invert()).multiply(desired);
			splitTwist(local, directions[twistParent], swing, twist);
			carrier.quaternion.slerpQuaternions(identity, twist, 0.75);
			bone.quaternion.copy(carrier.quaternion).invert().multiply(local);
			return;
		}
		figureQuaternion(bone.parent!, parentQuaternion);
		bone.quaternion.copy(parentQuaternion.invert()).multiply(desired);
		const twistChild = TWIST_CHILD[name] as BoneName | undefined;
		if (twistChild) {
			splitTwist(bone.quaternion, directions[name], swing, twist);
			local.slerpQuaternions(identity, twist, 0.45);
			bones[twistChild].quaternion.copy(local).invert().multiply(twist);
			bone.quaternion.copy(swing).multiply(local);
		}
	}

	const start = new THREE.Vector3(),
		toTarget = new THREE.Vector3(),
		bendSide = new THREE.Vector3(),
		joint = new THREE.Vector3(),
		segment = new THREE.Vector3();

	/**
	 * Two-bone IK: the end joint of `lower` (wrist or ankle) reaches `target`,
	 * bending towards `pole`. Twist bones between the joints stay in line.
	 */
	function reach(
		upper: BoneName,
		lower: BoneName,
		target: THREE.Vector3,
		pole: THREE.Vector3,
	) {
		const a = rest[lower].distanceTo(rest[upper]),
			b = rest[LIMB_END[lower] as BoneName].distanceTo(rest[lower]);
		figurePosition(bones[upper], start);
		toTarget.copy(target).sub(start);
		const distance = THREE.MathUtils.clamp(
			toTarget.length(),
			Math.abs(a - b) + 1e-4,
			a + b - 1e-4,
		);
		toTarget.normalize();
		bendSide.copy(pole).projectOnPlane(toTarget).normalize();
		const cos = (a * a + distance * distance - b * b) / (2 * a * distance);
		const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
		joint
			.copy(start)
			.addScaledVector(toTarget, a * cos)
			.addScaledVector(bendSide, a * sin);
		bend(
			upper,
			lower,
			segment.copy(joint).sub(start),
			lowerSegment.copy(start).addScaledVector(toTarget, distance).sub(joint),
		);
	}

	const upperDirection = new THREE.Vector3(),
		lowerDirection = new THREE.Vector3(),
		lowerSegment = new THREE.Vector3(),
		hintA = new THREE.Vector3(),
		hintB = new THREE.Vector3(),
		referenceA = new THREE.Vector3(),
		referenceB = new THREE.Vector3();

	/**
	 * Lays a limb's two bones along the given directions. Each bone twists so
	 * that the elbow or knee keeps hinging about the same axis as at rest.
	 */
	function bend(
		upper: BoneName,
		lower: BoneName,
		upperTo: THREE.Vector3,
		lowerTo: THREE.Vector3,
	) {
		upperDirection.copy(upperTo).normalize();
		lowerDirection.copy(lowerTo).normalize();
		aim(
			upper,
			upperDirection,
			hintA.copy(lowerDirection),
			referenceA.copy(directions[lower]),
		);
		aim(
			lower,
			lowerDirection,
			hintB.copy(upperDirection).negate(),
			referenceB.copy(directions[upper]).negate(),
		);
	}

	// Fingers curl about the axis across the palm.
	const curlAxes = {} as Record<string, THREE.Vector3>;
	for (const side of SIDES) {
		const sign = side === 'L' ? 1 : -1;
		const hand = rest[`hand${side}`];
		const palm = new THREE.Vector3()
			.subVectors(rest[`index1${side}`], hand)
			.cross(new THREE.Vector3().subVectors(rest[`pinky1${side}`], hand))
			.normalize();
		// In the rest pose the palms face the thighs.
		if (palm.x * sign > 0) palm.negate();
		for (const finger of FINGERS)
			for (const joint of [1, 2, 3] as const) {
				const name = `${finger}${joint}${side}` as BoneName;
				const axis = new THREE.Vector3().crossVectors(directions[name], palm);
				if (finger === 'thumb')
					// The thumb folds across the palm rather than into it.
					axis
						.crossVectors(directions[name], directions[`index1${side}`])
						.multiplyScalar(-1)
						.addScaledVector(
							new THREE.Vector3().crossVectors(directions[name], palm),
							0.6,
						);
				curlAxes[name] = axis.normalize();
			}
	}
	const CURL = [1.25, 1.5, 1.05];
	// The direction across each hand towards its thumb, to roll hands by.
	const thumbward = {
		L: new THREE.Vector3()
			.subVectors(rest.index1L, rest.pinky1L)
			.projectOnPlane(directions.handL)
			.normalize(),
		R: new THREE.Vector3()
			.subVectors(rest.index1R, rest.pinky1R)
			.projectOnPlane(directions.handR)
			.normalize(),
	};

	/**
	 * Closes the fingers of one hand: 0 is the flat rest pose, 1 a fist.
	 * `thumb` defaults to a little less than the fingers.
	 */
	function grip(side: number, curl: number, thumb = curl * 0.55) {
		const letter = side > 0 ? 'L' : 'R';
		for (const finger of FINGERS)
			for (let joint = 0; joint < 3; joint++) {
				const name = `${finger}${joint + 1}${letter}` as BoneName;
				const amount =
					finger === 'thumb'
						? thumb * [0.5, 0.55, 0.7][joint]
						: curl * CURL[joint] * (finger === 'pinky' ? 1.08 : 1);
				bones[name].quaternion.setFromAxisAngle(curlAxes[name], amount);
			}
	}

	function resetPose() {
		for (const bone of Object.values(bones)) bone.quaternion.identity();
	}

	function snapshot() {
		return Object.fromEntries(
			Object.entries(bones).map(([name, bone]) => [
				name,
				bone.quaternion.clone(),
			]),
		) as Record<BoneName, THREE.Quaternion>;
	}

	// The ponytail is a short pendulum hanging from the back of the head.
	const tailRoot = new THREE.Vector3(),
		tailTip = new THREE.Vector3(),
		tailBefore = new THREE.Vector3(),
		tailDirection = new THREE.Vector3(),
		rootQuaternion = new THREE.Quaternion(),
		headQuaternion = new THREE.Quaternion();
	const tailLength = bones.tail1 ? rest.tail3.distanceTo(rest.tail1) * 1.6 : 0;
	let tailLive = false;

	/**
	 * Lets the ponytail swing behind the head. Call once per frame after the
	 * pose is set and the figure has been placed in the world.
	 */
	function swingHair(dt: number) {
		if (!bones.tail1 || dt <= 0) return;
		bones.tail1.quaternion.identity();
		bones.tail2.quaternion.identity();
		bones.tail3.quaternion.identity();
		bones.head.updateWorldMatrix(true, false);
		bones.tail1.updateWorldMatrix(false, false);
		tailRoot.setFromMatrixPosition(bones.tail1.matrixWorld);
		root.getWorldQuaternion(rootQuaternion);
		if (!tailLive || tailTip.distanceTo(tailRoot) > tailLength * 3) {
			tailTip
				.copy(directions.tail1)
				.applyQuaternion(rootQuaternion)
				.multiplyScalar(tailLength)
				.add(tailRoot);
			tailBefore.copy(tailTip);
			tailLive = true;
		}
		// Verlet step: keep some momentum, fall, then stay on the hair's length.
		const damping = Math.exp(-dt * 5);
		step.copy(tailTip).sub(tailBefore).multiplyScalar(damping);
		tailBefore.copy(tailTip);
		tailTip.add(step);
		tailTip.y -= 26 * dt * dt;
		tailDirection.copy(tailTip).sub(tailRoot).normalize();
		// In figure space the hair stays behind the neck and off the shoulders.
		tailDirection.applyQuaternion(rootQuaternion.invert());
		tailDirection.z = Math.min(tailDirection.z, -0.2);
		tailDirection.x = THREE.MathUtils.clamp(tailDirection.x, -0.45, 0.45);
		tailDirection.y = Math.min(tailDirection.y, -0.35);
		tailDirection.normalize();
		rootQuaternion.invert();
		tailTip
			.copy(tailDirection)
			.applyQuaternion(rootQuaternion)
			.multiplyScalar(tailLength)
			.add(tailRoot);
		// Bend gradually: each bone covers a share of the way to the direction.
		figureQuaternion(bones.head, headQuaternion);
		desired.setFromUnitVectors(directions.tail1, tailDirection);
		local.copy(headQuaternion).invert().multiply(desired);
		bones.tail1.quaternion.slerpQuaternions(identity, local, 0.5);
		bones.tail2.quaternion.slerpQuaternions(identity, local, 0.35);
		bones.tail3.quaternion.slerpQuaternions(identity, local, 0.2);
	}

	return {
		model,
		root,
		bones,
		rest,
		ends,
		directions,
		materials: palette,
		aim,
		reach,
		bend,
		grip,
		thumbward,
		resetPose,
		snapshot,
		swingHair,
		figurePosition,
		figureQuaternion,
	};
}

/** Re-dresses every figure under `root`; unset colours keep what is worn. */
export function dressFigure(root: THREE.Object3D, outfit: Outfit) {
	const colours = new Map<string, string>();
	for (const key of Object.keys(OUTFIT_MATERIAL) as (keyof Outfit)[]) {
		const colour = outfit[key];
		if (colour) colours.set(OUTFIT_MATERIAL[key], colour);
	}
	const seen = new Set<THREE.Material>();
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		const materials = Array.isArray(object.material)
			? object.material
			: [object.material];
		for (const material of materials) {
			if (
				seen.has(material) ||
				!(material instanceof THREE.MeshStandardMaterial)
			)
				continue;
			seen.add(material);
			const colour = colours.get(material.name);
			if (colour) material.color.set(colour);
		}
	});
}
