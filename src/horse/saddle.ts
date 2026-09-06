import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import * as THREE from 'three';
import { mesh, cord, surface } from './geometry.ts';
import type { Vector3Tuple } from '../rendering/types.ts';

export function createSaddle(
	parent: THREE.Group,
	leather: THREE.Material,
	metal: THREE.Material,
	trim: THREE.Material,
) {
	const saddle = new THREE.Group();
	saddle.name = 'saddle';
	parent.add(saddle);
	// One upholstered shell joins the narrow waist to the raised cantle and pommel.
	const positions: number[] = [],
		indices: number[] = [],
		rows = 32,
		columns = 24;
	const point = (u: number, v: number, lower = false): Vector3Tuple => {
		const width = 0.285 + 0.095 * (1 - v) ** 3 - 0.03 * v;
		const rear = 0.2 * Math.exp(-((v / 0.17) ** 2));
		const front = 0.11 * Math.exp(-(((1 - v) / 0.15) ** 2));
		return [
			u * width,
			2.59 + rear + front - 0.065 * u * u - (lower ? 0.065 : 0),
			-0.57 + v * 0.97,
		];
	};
	for (let layer = 0; layer < 2; layer++)
		for (let row = 0; row <= rows; row++)
			for (let col = 0; col <= columns; col++)
				positions.push(
					...point((col / columns) * 2 - 1, row / rows, layer === 1),
				);
	const size = (rows + 1) * (columns + 1);
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < columns; col++) {
			const a = row * (columns + 1) + col,
				b = a + columns + 1;
			indices.push(
				a,
				b,
				a + 1,
				a + 1,
				b,
				b + 1,
				a + size,
				a + 1 + size,
				b + size,
				a + 1 + size,
				b + 1 + size,
				b + size,
			);
		}
	const boundary: number[] = [];
	for (let col = 0; col <= columns; col++) boundary.push(col);
	for (let row = 1; row <= rows; row++)
		boundary.push(row * (columns + 1) + columns);
	for (let col = columns - 1; col >= 0; col--)
		boundary.push(rows * (columns + 1) + col);
	for (let row = rows - 1; row > 0; row--) boundary.push(row * (columns + 1));
	for (let i = 0; i < boundary.length; i++) {
		const a = boundary[i],
			b = boundary[(i + 1) % boundary.length];
		indices.push(a, b, a + size, b, b + size, a + size);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	mesh(saddle, geometry, leather);
	for (const side of [-1, 1]) {
		const edge = Array.from({ length: 33 }, (_, i) =>
			point(side * 0.96, i / 32),
		);
		cord(saddle, trim, edge, 0.006);
		const flap = new THREE.Shape();
		flap.moveTo(-0.25, 2.51);
		flap.quadraticCurveTo(-0.37, 2.37, -0.31, 2.15);
		flap.quadraticCurveTo(-0.23, 1.97, -0.06, 1.98);
		flap.quadraticCurveTo(0.2, 1.98, 0.3, 2.22);
		flap.quadraticCurveTo(0.37, 2.42, 0.25, 2.53);
		flap.quadraticCurveTo(0, 2.59, -0.25, 2.51);
		let flapGeometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(flap, {
			depth: 0.035,
			bevelEnabled: true,
			bevelSegments: 3,
			steps: 1,
			bevelSize: 0.012,
			bevelThickness: 0.012,
			curveSegments: 16,
		});
		flapGeometry.rotateY(Math.PI / 2);
		const originalFlap = flapGeometry;
		flapGeometry = new TessellateModifier(0.055, 6).modify(originalFlap);
		originalFlap.dispose();
		const surfaceX = (y: number) =>
			0.67 * Math.sqrt(Math.max(0, 1 - ((y - 1.91) / 0.69) ** 2)) + 0.027;
		const vertices = flapGeometry.getAttribute('position');
		for (let i = 0; i < vertices.count; i++)
			vertices.setX(i, vertices.getX(i) + surfaceX(vertices.getY(i)));
		flapGeometry.deleteAttribute('normal');
		flapGeometry.deleteAttribute('uv');
		const facetedFlap = flapGeometry;
		flapGeometry = mergeVertices(facetedFlap);
		facetedFlap.dispose();
		flapGeometry.computeVertexNormals();
		const panel = mesh(saddle, flapGeometry, leather);
		panel.scale.x = side;
		const outline: Vector3Tuple[] = flap
			.getPoints(48)
			.map((p) => [side * (surfaceX(p.y) + 0.046), p.y, -p.x]);
		cord(saddle, trim, outline, 0.004);
		cord(
			saddle,
			leather,
			[
				[side * 0.49, 2.48, 0.2],
				[side * 0.62, 2.34, 0.29],
				[side * 0.68, 2.19, 0.25],
			],
			0.042,
		);
		// Flat stirrup leathers and a metal arch with a separate nonslip tread.
		const strapPoints = [
			[side * 0.38, 2.56, 0.21],
			[side * 0.66, 2.23, 0.21],
			[side * 0.66, 1.73, 0.21],
		];
		for (let i = 0; i < 2; i++) {
			const a = new THREE.Vector3(...strapPoints[i]),
				b = new THREE.Vector3(...strapPoints[i + 1]);
			const strap = mesh(
				saddle,
				new THREE.BoxGeometry(0.017, a.distanceTo(b), 0.055),
				leather,
			);
			strap.position.copy(a).add(b).multiplyScalar(0.5);
			strap.quaternion.setFromUnitVectors(
				new THREE.Vector3(0, 1, 0),
				b.sub(a).normalize(),
			);
		}

		cord(
			saddle,
			metal,
			[
				[side * 0.66, 1.73, 0.2],
				[side * 0.67, 1.69, 0.085],
				[side * 0.67, 1.55, 0.06],
				[side * 0.67, 1.535, 0.2],
				[side * 0.67, 1.55, 0.34],
				[side * 0.67, 1.69, 0.315],
				[side * 0.66, 1.73, 0.2],
			],
			0.018,
		);
		mesh(saddle, new THREE.BoxGeometry(0.19, 0.03, 0.24), metal, [
			side * 0.64,
			1.535,
			0.2,
		]);
	}
	const tread = surface('#343532');
	for (const side of [-1, 1])
		for (let i = 0; i < 5; i++)
			mesh(saddle, new THREE.BoxGeometry(0.16, 0.014, 0.017), tread, [
				side * 0.64,
				1.556,
				0.12 + i * 0.04,
			]);
	return saddle;
}
