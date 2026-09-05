import * as THREE from 'three';
import type { Vector3Tuple } from '../rendering/types.ts';

const sphere = new THREE.SphereGeometry(1, 20, 14);
const up = new THREE.Vector3(0, 1, 0);
export const surface = (color: THREE.ColorRepresentation, roughness = 0.85) =>
	new THREE.MeshStandardMaterial({ color, roughness });

export function mesh(
	parent: THREE.Object3D,
	geometry: THREE.BufferGeometry,
	material: THREE.Material,
	position: Vector3Tuple = [0, 0, 0],
) {
	const object = new THREE.Mesh(geometry, material);
	object.position.set(...position);
	object.castShadow = true;
	object.receiveShadow = true;
	parent.add(object);
	return object;
}

export function oval(
	parent: THREE.Object3D,
	material: THREE.Material,
	scale: Vector3Tuple,
	position: Vector3Tuple,
) {
	const object = mesh(parent, sphere, material, position);
	object.scale.set(...scale);
	return object;
}

export function limb(
	parent: THREE.Object3D,
	material: THREE.Material,
	start: Vector3Tuple,
	end: Vector3Tuple,
	radius: number,
	endRadius = radius,
) {
	const a = new THREE.Vector3(...start),
		b = new THREE.Vector3(...end);
	const object = mesh(
		parent,
		new THREE.CylinderGeometry(endRadius, radius, a.distanceTo(b), 14),
		material,
	);
	object.position.copy(a).add(b).multiplyScalar(0.5);
	object.quaternion.setFromUnitVectors(up, b.sub(a).normalize());
	return object;
}

export function cord(
	parent: THREE.Object3D,
	material: THREE.Material,
	points: Vector3Tuple[],
	radius = 0.025,
) {
	const curve = new THREE.CatmullRomCurve3(
		points.map((point) => new THREE.Vector3(...point)),
	);
	return mesh(
		parent,
		new THREE.TubeGeometry(curve, 32, radius, 6, false),
		material,
	);
}

// Smooth connected elliptical sections, instead of intersecting polygonal blocks.
export function form(
	parent: THREE.Object3D,
	material: THREE.Material,
	sections: [Vector3Tuple, number, number][],
	axis: 'y' | 'z' = 'z',
	segments = 24,
) {
	const positions: number[] = [],
		indices: number[] = [];
	// Interpolate longitudinal sections so cheeks, neck and clothing have soft contours.
	const centerCurve = new THREE.CatmullRomCurve3(
		sections.map(([center]) => new THREE.Vector3(...center)),
	);
	const profileCurve = new THREE.CatmullRomCurve3(
		sections.map(([, width, depth], i) => new THREE.Vector3(width, depth, i)),
		false,
		'catmullrom',
		0.35,
	);
	const rings = (sections.length - 1) * 4;
	for (let ring = 0; ring <= rings; ring++) {
		const t = ring / rings;
		const center = centerCurve.getPoint(t).toArray();
		const profile = profileCurve.getPoint(t);
		const width = Math.max(0.005, profile.x),
			depth = Math.max(0.005, profile.y);
		for (let j = 0; j <= segments; j++) {
			const angle = (j / segments) * Math.PI * 2;
			positions.push(
				center[0] + Math.cos(angle) * width,
				center[1] + (axis === 'z' ? Math.sin(angle) * depth : 0),
				center[2] + (axis === 'y' ? Math.sin(angle) * depth : 0),
			);
			if (ring && j < segments) {
				const a = ring * (segments + 1) + j,
					b = a - segments - 1;
				if (axis === 'z') indices.push(b, b + 1, a, b + 1, a + 1, a);
				else indices.push(b, a, b + 1, b + 1, a, a + 1);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return mesh(parent, geometry, material);
}
