import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from './noise.ts';

const COLORS = ['#f3f0e4', '#e9c341', '#a58fd0', '#d88aae', '#f3f0e4'];

/** Small wildflowers scattered in loose drifts; stems and blossoms are two instanced draws. */
export function createFlowers(spots: readonly { x: number; z: number }[]) {
	const next = random(1409);
	const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.34, 4, 1, true);
	stem.translate(0, 0.17, 0);
	const petals = new THREE.CylinderGeometry(0.075, 0.03, 0.025, 7);
	petals.translate(0, 0.35, 0);
	const heart = new THREE.SphereGeometry(0.028, 6, 4);
	heart.translate(0, 0.365, 0);
	const blossom = mergeGeometries([
		petals.toNonIndexed(),
		heart.toNonIndexed(),
	]);
	for (const geometry of [petals, heart]) geometry.dispose();
	const flowers: [THREE.Matrix4, THREE.Color][] = [];
	const quaternion = new THREE.Quaternion(),
		euler = new THREE.Euler();
	for (const spot of spots) {
		const color = new THREE.Color(COLORS[Math.floor(next() * COLORS.length)]);
		const count = 3 + Math.floor(next() * 6);
		for (let i = 0; i < count; i++) {
			const angle = next() * Math.PI * 2,
				distance = Math.sqrt(next()) * 1.4;
			const size = 0.7 + next() * 0.7;
			euler.set((next() - 0.5) * 0.35, next() * 6.3, (next() - 0.5) * 0.35);
			flowers.push([
				new THREE.Matrix4().compose(
					new THREE.Vector3(
						spot.x + Math.cos(angle) * distance,
						0,
						spot.z + Math.sin(angle) * distance,
					),
					quaternion.setFromEuler(euler),
					new THREE.Vector3(size, size, size),
				),
				color,
			]);
		}
	}
	const stems = new THREE.InstancedMesh(
		stem,
		new THREE.MeshStandardMaterial({ color: '#4d6a2c', roughness: 0.9 }),
		flowers.length,
	);
	const blossoms = new THREE.InstancedMesh(
		blossom,
		new THREE.MeshStandardMaterial({ roughness: 0.7 }),
		flowers.length,
	);
	flowers.forEach(([matrix, color], i) => {
		stems.setMatrixAt(i, matrix);
		blossoms.setMatrixAt(i, matrix);
		blossoms.setColorAt(i, color);
	});
	const group = new THREE.Group();
	group.name = 'flowers';
	for (const mesh of [stems, blossoms]) {
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		group.add(mesh);
	}
	return group;
}
