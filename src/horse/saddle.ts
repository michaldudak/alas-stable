import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import * as THREE from 'three';
import { mesh, cord, surface } from './geometry.ts';
import type { Vector3Tuple } from '../rendering/types.ts';

/** How the saddle sits on this horse: flank profile and where the stirrups hang. */
export type SaddleFit = {
	/** Half-width of the barrel at height `y`, in the saddle's space. */
	surfaceX: (y: number) => number;
	/** Centre of the left stirrup tread; the right one mirrors it. */
	stirrup: Vector3Tuple;
};

export function createSaddle(
	parent: THREE.Group,
	leather: THREE.Material,
	metal: THREE.Material,
	trim: THREE.Material,
	fit: SaddleFit,
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
		// Flaps lie on the saddle pad over the flank.
		const surfaceX = (y: number) => fit.surfaceX(y) + 0.035;
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
		// Knee roll along the front of the flap.
		cord(
			saddle,
			leather,
			[2.48, 2.34, 2.19].map((y, i): Vector3Tuple => [
				side * (surfaceX(y) + 0.06),
				y,
				[0.2, 0.29, 0.25][i],
			]),
			0.042,
		);
		// Flat stirrup leathers and a metal arch with a separate nonslip tread.
		const [sx, sy, sz] = fit.stirrup;
		const strapPoints = [
			[side * 0.3, 2.56, sz - 0.05],
			[side * (surfaceX(2.23) + 0.06), 2.23, sz - 0.05],
			[side * sx, sy + 0.195, sz],
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
				[0, 0.195, 0],
				[0.01, 0.155, -0.115],
				[0.01, 0.015, -0.14],
				[0.01, 0, 0],
				[0.01, 0.015, 0.14],
				[0.01, 0.155, 0.115],
				[0, 0.195, 0],
			].map(([x, y, z]): Vector3Tuple => [side * (sx + x), sy + y, sz + z]),
			0.018,
		);
		mesh(saddle, new THREE.BoxGeometry(0.19, 0.03, 0.24), metal, [
			side * sx,
			sy,
			sz,
		]);
	}
	const tread = surface('#343532');
	for (const side of [-1, 1])
		for (let i = 0; i < 5; i++)
			mesh(saddle, new THREE.BoxGeometry(0.16, 0.014, 0.017), tread, [
				side * fit.stirrup[0],
				fit.stirrup[1] + 0.021,
				fit.stirrup[2] - 0.08 + i * 0.04,
			]);
	return saddle;
}
