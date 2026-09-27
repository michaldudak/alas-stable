import * as THREE from 'three';
import { riderAsset } from './rider-asset.ts';
import {
	hairSurface,
	locks,
	mesh,
	oval,
	seeded,
	surface,
	type Lock,
} from './geometry.ts';

export type BoneName =
	| 'pelvis'
	| 'spine'
	| 'head'
	| 'thighL'
	| 'shinL'
	| 'footL'
	| 'thighR'
	| 'shinR'
	| 'footR'
	| 'armL'
	| 'forearmL'
	| 'handL'
	| 'armR'
	| 'forearmR'
	| 'handR';

/** Each bone points at this child (or end point) in the rest pose. */
const CHAINS: Record<BoneName, BoneName | 'handEnd' | 'footEnd' | 'crown'> = {
	pelvis: 'spine',
	spine: 'head',
	head: 'crown',
	thighL: 'shinL',
	shinL: 'footL',
	footL: 'footEnd',
	thighR: 'shinR',
	shinR: 'footR',
	footR: 'footEnd',
	armL: 'forearmL',
	forearmL: 'handL',
	handL: 'handEnd',
	armR: 'forearmR',
	forearmR: 'handR',
	handR: 'handEnd',
};

const occlusionVertex = /* glsl */ `
attribute float ao;
varying float vOcclusion;`;

/** Applies the sculpt's baked occlusion to indirect light and, gently, to colour. */
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
				'#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, vOcclusion, 0.4);',
			)
			.replace(
				'#include <aomap_fragment>',
				'#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vOcclusion;',
			);
	};
	return material;
}

function clothing() {
	const skin = new THREE.MeshPhysicalMaterial({
		color: '#e8b896',
		roughness: 0.55,
		sheen: 0.4,
		sheenColor: new THREE.Color('#ffb59a'),
		sheenRoughness: 0.5,
	});
	return {
		skin: withOcclusion(skin),
		hair: withOcclusion(hairSurface('#5a3d2a', 0.55)),
		shirt: withOcclusion(surface('#2e4260', 0.8)),
		breeches: withOcclusion(surface('#ddd3bf', 0.85)),
		boots: withOcclusion(surface('#26211d', 0.38)),
		gloves: withOcclusion(surface('#4d4036', 0.7)),
	} as Record<string, THREE.MeshStandardMaterial>;
}

/** A ponytail below the back rim of the helmet, in head-bone space. */
function ponytail(center: THREE.Vector3, radii: THREE.Vector3): Lock[] {
	const next = seeded(31);
	const root = center.clone().add(new THREE.Vector3(0, -0.05, -radii.z * 0.85));
	const strands: Lock[] = [];
	for (let i = 0; i < 26; i++) {
		const angle = next() * Math.PI * 2,
			spread = 0.018 * Math.sqrt(next());
		const x = Math.cos(angle) * spread,
			z = Math.sin(angle) * spread;
		const length = 0.26 + next() * 0.08;
		strands.push({
			points: [
				[root.x + x * 0.5, root.y + 0.01, root.z + z * 0.5],
				[root.x + x, root.y - 0.03, root.z - 0.035 + z],
				[root.x + x * 2.2, root.y - length * 0.55, root.z - 0.05 + z * 1.6],
				[
					root.x + x * 1.8 + (next() - 0.5) * 0.03,
					root.y - length,
					root.z - 0.035 + z,
				],
			],
			radius: 0.011 + next() * 0.005,
			tip: 0.35,
		});
	}
	return strands;
}

/** Riding helmet: a shell over the cranium, a short peak and a harness. */
function helmet(
	parent: THREE.Object3D,
	center: THREE.Vector3,
	radii: THREE.Vector3,
) {
	const shell = surface('#2f4a43', 0.62),
		trim = surface('#1f2a27', 0.5);
	const dome = mesh(
		parent,
		new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.56),
		shell,
	);
	dome.scale.set(radii.x * 1.13, radii.y * 1.02, radii.z * 1.1);
	dome.position.copy(center).add(new THREE.Vector3(0, 0.005, -0.004));
	dome.rotation.x = -0.12;
	const peak = mesh(
		parent,
		new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2),
		shell,
	);
	peak.scale.set(radii.x * 0.95, 0.018, radii.z * 0.55);
	peak.position.copy(center).add(new THREE.Vector3(0, -0.005, radii.z * 0.72));
	peak.rotation.x = 0.12;
	const band = mesh(parent, new THREE.TorusGeometry(1, 0.012, 6, 40), trim);
	band.rotation.x = Math.PI / 2 - 0.12;
	band.scale.set(radii.x * 1.12, radii.z * 1.09, 1);
	band.position.copy(center).add(new THREE.Vector3(0, -0.002, -0.004));
	return [shell, trim];
}

export type Figure = ReturnType<typeof createFigure>;

/**
 * The rider's skinned body with bones in figure space (feet on the ground,
 * facing +Z). Poses are set by aiming bones at targets.
 */
export function createFigure() {
	const { geometry, materials: names, rig } = riderAsset();
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
	const mirror = (v: THREE.Vector3, name: string) =>
		name.endsWith('R') ? v.clone().setX(-v.x) : v.clone();
	// Rest directions from each joint to the next, in figure space.
	const directions = {} as Record<BoneName, THREE.Vector3>;
	for (const name of Object.keys(CHAINS) as BoneName[]) {
		const child = CHAINS[name];
		const end =
			child === 'handEnd'
				? mirror(new THREE.Vector3(...rig.ends.handL), name)
				: child === 'footEnd'
					? mirror(new THREE.Vector3(...rig.ends.footL), name)
					: child === 'crown'
						? new THREE.Vector3(...rig.ends.head)
						: rest[child];
		directions[name] = end.clone().sub(rest[name]).normalize();
	}
	const palette = clothing();
	const skin = new THREE.SkinnedMesh(
		geometry,
		names.map((name) => palette[name] ?? palette.shirt),
	);
	skin.name = 'rider-body';
	skin.castShadow = true;
	skin.receiveShadow = true;
	skin.frustumCulled = false;
	root.add(skin);
	root.updateMatrixWorld(true);
	skin.bind(new THREE.Skeleton(Object.values(bones)));

	// Head details ride on the head bone, in its rest-relative frame.
	const head = bones.head,
		headRest = rest.head;
	const center = new THREE.Vector3(...rig.headCenter).sub(headRest),
		radii = new THREE.Vector3(...rig.headRadii);
	const white = surface('#f2eee6', 0.25),
		iris = new THREE.MeshPhysicalMaterial({
			color: '#4a3322',
			roughness: 0.15,
			clearcoat: 1,
		});
	for (const side of [-1, 1]) {
		const eye = new THREE.Vector3(
			side * rig.eye[0],
			rig.eye[1],
			rig.eye[2],
		).sub(headRest);
		oval(head, white, [0.016, 0.014, 0.015], [eye.x, eye.y, eye.z - 0.004]);
		oval(head, iris, [0.0078, 0.0078, 0.005], [eye.x, eye.y, eye.z + 0.008]);
	}
	helmet(head, center, radii);
	locks(head, palette.hair, ponytail(center, radii), 10);

	const figureQuaternion = (bone: THREE.Object3D, out: THREE.Quaternion) => {
		out.identity();
		const chain: THREE.Object3D[] = [];
		for (
			let node: THREE.Object3D | null = bone;
			node && node !== root;
			node = node.parent
		)
			chain.unshift(node);
		for (const node of chain) out.multiply(node.quaternion);
		return out;
	};
	const figurePosition = (bone: THREE.Object3D, out: THREE.Vector3) => {
		const chain: THREE.Object3D[] = [];
		for (
			let node: THREE.Object3D | null = bone;
			node && node !== root;
			node = node.parent
		)
			chain.unshift(node);
		out.set(0, 0, 0);
		const q = new THREE.Quaternion();
		for (const node of chain) {
			out.add(node.position.clone().applyQuaternion(q));
			q.multiply(node.quaternion);
		}
		return out;
	};
	const parentQuaternion = new THREE.Quaternion(),
		desired = new THREE.Quaternion(),
		twist = new THREE.Quaternion(),
		forward = new THREE.Vector3(0, 0, 1);

	/**
	 * Points `name` along `direction` (figure space). `hint` picks the twist:
	 * the bone's rest `reference` axis (forward by default) turns towards it.
	 */
	function aim(
		name: BoneName,
		direction: THREE.Vector3,
		hint?: THREE.Vector3,
		reference = forward,
	) {
		const dir = direction.clone().normalize();
		desired.setFromUnitVectors(directions[name], dir);
		if (hint) {
			const turned = reference
				.clone()
				.applyQuaternion(desired)
				.projectOnPlane(dir);
			const target = hint.clone().projectOnPlane(dir);
			if (turned.lengthSq() > 1e-6 && target.lengthSq() > 1e-6) {
				turned.normalize();
				target.normalize();
				const angle = Math.atan2(
					turned.clone().cross(target).dot(dir),
					turned.dot(target),
				);
				desired.premultiply(twist.setFromAxisAngle(dir, angle));
			}
		}
		const parent = bones[name].parent!;
		figureQuaternion(parent, parentQuaternion);
		bones[name].quaternion.copy(parentQuaternion.invert().multiply(desired));
	}

	const lengths = (upper: BoneName, lower: BoneName) => [
		rest[lower].distanceTo(rest[upper]),
		rest[CHAINS[lower] as BoneName].distanceTo(rest[lower]),
	];

	/** Two-bone IK: `end` joint of the lower bone reaches `target`, bending towards `pole`. */
	function reach(
		upper: BoneName,
		lower: BoneName,
		target: THREE.Vector3,
		pole: THREE.Vector3,
		hint?: THREE.Vector3,
	) {
		const [a, b] = lengths(upper, lower);
		const start = figurePosition(bones[upper], new THREE.Vector3());
		const toTarget = target.clone().sub(start);
		const distance = THREE.MathUtils.clamp(
			toTarget.length(),
			Math.abs(a - b) + 1e-4,
			a + b - 1e-4,
		);
		const axis = toTarget.normalize();
		const side = pole.clone().projectOnPlane(axis).normalize();
		const cos = (a * a + distance * distance - b * b) / (2 * a * distance);
		const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
		const joint = start
			.clone()
			.addScaledVector(axis, a * cos)
			.addScaledVector(side, a * sin);
		const end = start.clone().addScaledVector(axis, distance);
		aim(upper, joint.clone().sub(start), hint ?? pole);
		aim(lower, end.sub(joint), hint ?? pole);
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

	return {
		root,
		bones,
		rest,
		directions,
		aim,
		reach,
		resetPose,
		snapshot,
		figurePosition,
	};
}
