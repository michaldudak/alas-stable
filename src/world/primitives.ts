import * as THREE from 'three';
import type { Vector3Tuple } from '../rendering/types.ts';
import { context2d } from '../platform/dom.ts';
const materials = new Map<
	THREE.ColorRepresentation,
	THREE.MeshStandardMaterial
>();
export function material(color: THREE.ColorRepresentation) {
	if (!materials.has(color))
		materials.set(
			color,
			new THREE.MeshStandardMaterial({
				color,
				roughness: 1,
				flatShading: false,
			}),
		);
	return materials.get(color)!;
}
export function box(
	parent: THREE.Object3D,
	color: THREE.ColorRepresentation,
	size: Vector3Tuple,
	position: Vector3Tuple,
	rotation = 0,
) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
	mesh.position.set(...position);
	mesh.rotation.y = rotation;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	parent.add(mesh);
	return mesh;
}
export function ellipsoid(
	parent: THREE.Object3D,
	color: THREE.ColorRepresentation,
	size: Vector3Tuple,
	position: Vector3Tuple,
	detail = 1,
) {
	const mesh = new THREE.Mesh(
		new THREE.IcosahedronGeometry(1, detail),
		material(color),
	);
	mesh.scale.set(...size);
	mesh.position.set(...position);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	parent.add(mesh);
	return mesh;
}
export function cylinder(
	parent: THREE.Object3D,
	color: THREE.ColorRepresentation,
	radius: number,
	height: number,
	position: Vector3Tuple,
	radiusTop = radius,
) {
	const mesh = new THREE.Mesh(
		new THREE.CylinderGeometry(radiusTop, radius, height, 12),
		material(color),
	);
	mesh.position.set(...position);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	parent.add(mesh);
	return mesh;
}
export function sign(
	parent: THREE.Object3D,
	text: string,
	x: number,
	z: number,
	angle = 0,
) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 128;
	const ctx = context2d(canvas);
	ctx.fillStyle = '#f5ebcf';
	ctx.fillRect(0, 0, 512, 128);
	ctx.strokeStyle = '#755334';
	ctx.lineWidth = 10;
	ctx.strokeRect(5, 5, 502, 118);
	ctx.fillStyle = '#35503c';
	ctx.font = '600 43px sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 256, 66);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(5, 1.25, 0.15),
		new THREE.MeshStandardMaterial({ map: texture }),
	);
	mesh.position.set(x, 2.8, z);
	mesh.rotation.y = angle;
	parent.add(mesh);
	cylinder(parent, '#876744', 0.1, 2.4, [x, 1.2, z]);
}
