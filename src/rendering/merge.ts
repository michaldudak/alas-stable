import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const relative = new THREE.Matrix4(),
	inverse = new THREE.Matrix4();

/**
 * Bakes every static mesh under `root` into one mesh per material, so large
 * buildings cost a handful of draw calls instead of one per plank. Meshes in
 * `blockers` merge separately and the merged replacements are returned, so the
 * camera can still collide with walls and roofs.
 */
export function mergeStatic(
	root: THREE.Object3D,
	blockers: ReadonlySet<THREE.Object3D> = new Set(),
) {
	root.updateMatrixWorld(true);
	inverse.copy(root.matrixWorld).invert();
	const groups = new Map<
		string,
		{
			material: THREE.Material;
			blocker: boolean;
			shadow: boolean;
			parts: THREE.BufferGeometry[];
		}
	>();
	const merged: THREE.Mesh[] = [];
	root.traverse((object) => {
		if (
			!(object instanceof THREE.Mesh) ||
			object instanceof THREE.SkinnedMesh ||
			object.userData.dynamic ||
			Array.isArray(object.material)
		)
			return;
		const blocker = blockers.has(object);
		const material = object.material as THREE.Material;
		const key = `${material.uuid}:${blocker}:${object.castShadow}`;
		let group = groups.get(key);
		if (!group) {
			group = { material, blocker, shadow: object.castShadow, parts: [] };
			groups.set(key, group);
		}
		relative.multiplyMatrices(inverse, object.matrixWorld);
		const source = object.geometry as THREE.BufferGeometry;
		const part = source.clone();
		if (!part.index)
			part.setIndex(
				Array.from(
					{ length: part.getAttribute('position').count },
					(_, i) => i,
				),
			);
		part.applyMatrix4(relative);
		for (const name of Object.keys(part.attributes))
			if (!['position', 'normal', 'uv'].includes(name))
				part.deleteAttribute(name);
		if (!part.getAttribute('uv'))
			part.setAttribute(
				'uv',
				new THREE.Float32BufferAttribute(
					new Float32Array(part.getAttribute('position').count * 2),
					2,
				),
			);
		group.parts.push(part);
		merged.push(object);
	});
	for (const mesh of merged) {
		mesh.removeFromParent();
		mesh.geometry.dispose();
	}
	const results: THREE.Mesh[] = [];
	for (const group of groups.values()) {
		const geometry = mergeGeometries(group.parts);
		for (const part of group.parts) part.dispose();
		const mesh = new THREE.Mesh(geometry, group.material);
		mesh.castShadow = group.shadow;
		mesh.receiveShadow = true;
		mesh.userData.blocker = group.blocker;
		mesh.matrixAutoUpdate = false;
		root.add(mesh);
		results.push(mesh);
	}
	return results;
}
