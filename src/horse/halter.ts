import * as THREE from 'three';
import { cord, mesh, surface } from './geometry.ts';
export function createHalter(body: THREE.Group) {
	const halter = new THREE.Group();
	halter.name = 'choice:headgear:halter';
	body.add(halter);
	const webbing = surface('#437f79'),
		metal = surface('#c7c6ac', 0.35);
	for (const side of [-1, 1]) {
		cord(
			halter,
			webbing,
			[
				[side * 0.22, 3.48, 1.13],
				[side * 0.34, 3.15, 1.39],
				[side * 0.245, 2.94, 1.94],
			],
			0.035,
		);
		cord(
			halter,
			webbing,
			[
				[side * 0.34, 3.15, 1.39],
				[side * 0.23, 2.93, 1.57],
				[0, 2.82, 1.79],
			],
			0.03,
		);
		const ring = mesh(
			halter,
			new THREE.TorusGeometry(0.065, 0.013, 6, 16),
			metal,
			[side * 0.252, 2.94, 1.94],
		);
		ring.rotation.y = Math.PI / 2;
	}
	cord(
		halter,
		webbing,
		[
			[-0.245, 2.94, 1.94],
			[-0.16, 3.055, 1.96],
			[0, 3.085, 1.97],
			[0.16, 3.055, 1.96],
			[0.245, 2.94, 1.94],
			[0.16, 2.8, 1.9],
			[0, 2.78, 1.89],
			[-0.16, 2.8, 1.9],
			[-0.245, 2.94, 1.94],
		],
		0.033,
	);
	cord(
		halter,
		webbing,
		[
			[-0.22, 3.48, 1.13],
			[0, 3.56, 1.12],
			[0.22, 3.48, 1.13],
		],
		0.035,
	);
	const leadAnchor = new THREE.Group();
	leadAnchor.position.set(0, 2.76, 1.91);
	halter.add(leadAnchor);
	mesh(leadAnchor, new THREE.TorusGeometry(0.057, 0.013, 6, 16), metal);
	return { halter, leadAnchor };
}
