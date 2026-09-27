import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vector3Tuple } from '../rendering/types.ts';

/** Written by `tools/rider/build_rider.py`; bones are listed parents first. */
export type RiderRig = {
	bones: Record<string, { parent: string | null; position: Vector3Tuple }>;
	ends: Record<'handL' | 'footL' | 'head', Vector3Tuple>;
	eye: Vector3Tuple;
	headCenter: Vector3Tuple;
	headRadii: Vector3Tuple;
};

/** One body geometry with a group per clothing material, named in `materials`. */
export type RiderAsset = {
	geometry: THREE.BufferGeometry;
	materials: string[];
	rig: RiderRig;
};

let current: RiderAsset | undefined;

/** Two bone influences per vertex become three.js skinning attributes. */
function skinned(source: THREE.BufferGeometry) {
	const geometry = new THREE.BufferGeometry();
	geometry.setIndex(source.getIndex());
	geometry.setAttribute('position', source.getAttribute('position'));
	geometry.setAttribute('normal', source.getAttribute('normal'));
	geometry.setAttribute('ao', source.getAttribute('_ao'));
	const joint = source.getAttribute('_joint'),
		blend = source.getAttribute('_blend');
	const joints = new Uint16Array(joint.count * 4),
		weights = new Float32Array(joint.count * 4);
	for (let i = 0; i < joint.count; i++) {
		joints.set(
			[Math.round(joint.getX(i)), Math.round(joint.getY(i)), 0, 0],
			i * 4,
		);
		weights.set([1 - blend.getX(i), blend.getX(i), 0, 0], i * 4);
	}
	geometry.setAttribute(
		'skinIndex',
		new THREE.Uint16BufferAttribute(joints, 4),
	);
	geometry.setAttribute(
		'skinWeight',
		new THREE.Float32BufferAttribute(weights, 4),
	);
	return geometry;
}

export async function parseRiderAsset(data: ArrayBuffer): Promise<RiderAsset> {
	const gltf = await new GLTFLoader().parseAsync(data, '');
	const node = gltf.scene.getObjectByName('RiderBody');
	if (!node) throw new Error('The rider asset has no RiderBody node.');
	const parts: THREE.Mesh[] = [];
	node.traverse((object) => {
		if (object instanceof THREE.Mesh) parts.push(object);
	});
	const geometries = parts.map((part) => skinned(part.geometry));
	const geometry = mergeGeometries(geometries, true);
	geometry.computeBoundingSphere();
	for (const part of parts) part.geometry.dispose();
	for (const piece of geometries) piece.dispose();
	const materials = parts.map((part) =>
		Array.isArray(part.material) ? '' : part.material.name,
	);
	current = {
		geometry,
		materials,
		rig: JSON.parse(String(node.userData.rig)) as RiderRig,
	};
	return current;
}

export async function loadRiderAsset(url: string) {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Rider asset failed to load: ${response.status}`);
	return parseRiderAsset(await response.arrayBuffer());
}

/** The loaded rider; call `loadRiderAsset` before creating horses or walkers. */
export function riderAsset() {
	if (!current) throw new Error('Load the rider asset before creating riders.');
	return current;
}
