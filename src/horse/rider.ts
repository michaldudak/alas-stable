import * as THREE from 'three';
import type { Vector3Tuple } from '../rendering/types.ts';
import { surface, oval, limb, cord, form } from './geometry.ts';

export function createRider(parent: THREE.Group, eye: THREE.Material) {
	const rider = new THREE.Group();
	rider.name = 'rider';
	parent.add(rider);
	const shirt = surface('#cb7956'),
		pants = surface('#e6dbc1'),
		boots = surface('#303d3b', 0.6);
	const skin = surface('#edbd96'),
		helmet = surface('#35534b', 0.5),
		riderHair = surface('#66442e');
	oval(rider, pants, [0.32, 0.19, 0.26], [0, 2.72, -0.12]);
	form(
		rider,
		shirt,
		[
			[[0, 2.75, -0.14], 0.23, 0.16],
			[[0, 2.89, -0.12], 0.24, 0.17],
			[[0, 3.16, -0.12], 0.29, 0.18],
			[[0, 3.28, -0.1], 0.22, 0.14],
		],
		'y',
	);
	limb(rider, skin, [0, 3.24, -0.1], [0, 3.43, -0.08], 0.095);
	oval(rider, skin, [0.235, 0.275, 0.22], [0, 3.6, -0.07]);
	oval(rider, riderHair, [0.239, 0.22, 0.16], [0, 3.63, -0.16]);
	oval(rider, helmet, [0.277, 0.2, 0.26], [0, 3.79, -0.08]);
	oval(rider, helmet, [0.27, 0.035, 0.22], [0, 3.72, 0.09]);
	oval(rider, skin, [0.04, 0.045, 0.05], [0, 3.57, 0.155]);
	for (const side of [-1, 1]) {
		oval(rider, eye, [0.022, 0.029, 0.012], [side * 0.09, 3.63, 0.13]);
		oval(rider, skin, [0.045, 0.07, 0.045], [side * 0.226, 3.58, -0.06]);
		cord(
			rider,
			boots,
			[
				[side * 0.24, 3.72, -0.04],
				[side * 0.2, 3.42, 0.025],
				[0, 3.38, 0.04],
			],
			0.012,
		);
		const shoulder: Vector3Tuple = [side * 0.27, 3.17, -0.09],
			elbow: Vector3Tuple = [side * 0.37, 2.96, 0.04],
			hand: Vector3Tuple = [side * 0.29, 2.85, 0.43];
		oval(rider, shirt, [0.12, 0.15, 0.13], shoulder);
		limb(rider, shirt, shoulder, elbow, 0.115, 0.09);
		oval(rider, shirt, [0.09, 0.09, 0.09], elbow);
		limb(rider, shirt, elbow, hand, 0.085, 0.065);
		oval(rider, skin, [0.072, 0.065, 0.09], hand);
		const hip: Vector3Tuple = [side * 0.22, 2.72, -0.12],
			knee: Vector3Tuple = [side * 0.56, 2.22, 0.3],
			ankle: Vector3Tuple = [side * 0.64, 1.7, 0.08];
		limb(rider, pants, hip, knee, 0.15, 0.11);
		oval(rider, pants, [0.12, 0.13, 0.12], knee);
		limb(rider, boots, [side * 0.575, 2.13, 0.27], ankle, 0.105, 0.075);
		oval(rider, boots, [0.11, 0.09, 0.21], [side * 0.64, 1.63, 0.19]);
	}

	return rider;
}
