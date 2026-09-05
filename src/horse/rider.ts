import * as THREE from 'three';
import type { Vector3Tuple } from '../rendering/types.ts';
import { surface, oval, limb, cord, form, mesh } from './geometry.ts';

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
	form(
		rider,
		skin,
		[
			[[0, 3.335, -0.04], 0.045, 0.055],
			[[0, 3.39, -0.035], 0.125, 0.13],
			[[0, 3.49, -0.055], 0.19, 0.185],
			[[0, 3.61, -0.07], 0.216, 0.21],
			[[0, 3.73, -0.08], 0.204, 0.195],
			[[0, 3.83, -0.09], 0.105, 0.105],
		],
		'y',
	);
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

	// Clothing and facial details stay attached to the animated rider group.
	const seam = surface('#a65e43'),
		lip = surface('#b47766'),
		lining = surface('#ede5d4'),
		glove = surface('#56483b', 0.68);
	cord(
		rider,
		seam,
		[
			[0, 2.78, 0.024],
			[0, 2.96, 0.058],
			[0, 3.19, 0.055],
		],
		0.007,
	);
	for (const y of [3.08, 3.16])
		oval(rider, lining, [0.014, 0.014, 0.009], [0, y, 0.067]);
	cord(
		rider,
		lip,
		[
			[-0.057, 3.465, 0.115],
			[0, 3.453, 0.137],
			[0.057, 3.465, 0.115],
		],
		0.006,
	);
	for (const side of [-1, 1]) {
		cord(
			rider,
			riderHair,
			[
				[side * 0.048, 3.677, 0.13],
				[side * 0.089, 3.691, 0.124],
				[side * 0.129, 3.674, 0.108],
			],
			0.009,
		);
		oval(rider, lining, [0.006, 0.008, 0.005], [side * 0.085, 3.638, 0.144]);
		oval(rider, lip, [0.018, 0.041, 0.025], [side * 0.255, 3.58, -0.045]);
		cord(
			rider,
			lining,
			[
				[side * 0.095, 3.31, -0.07],
				[side * 0.14, 3.24, 0.022],
				[side * 0.045, 3.2, 0.058],
			],
			0.027,
		);
		cord(
			rider,
			seam,
			[
				[side * 0.22, 3.22, -0.17],
				[side * 0.26, 3.11, -0.245],
				[side * 0.21, 2.84, -0.205],
			],
			0.006,
		);
		oval(rider, glove, [0.073, 0.067, 0.093], [side * 0.29, 2.85, 0.43]);
		oval(rider, glove, [0.035, 0.045, 0.06], [side * 0.245, 2.88, 0.44]);
		cord(
			rider,
			lining,
			[
				[side * 0.42, 2.45, 0.045],
				[side * 0.57, 2.24, 0.25],
				[side * 0.55, 2.19, 0.34],
			],
			0.008,
		);
		// Defined boot soles and heels replace the soft slipper silhouette.
		mesh(rider, new THREE.BoxGeometry(0.17, 0.07, 0.17), boots, [
			side * 0.64,
			1.55,
			0.095,
		]);
		oval(rider, boots, [0.112, 0.028, 0.217], [side * 0.64, 1.565, 0.2]);
		cord(
			rider,
			glove,
			[
				[side * 0.672, 2.12, 0.27],
				[side * 0.72, 1.92, 0.185],
				[side * 0.715, 1.72, 0.095],
			],
			0.008,
		);
		for (let i = 0; i < 3; i++)
			cord(
				rider,
				eye,
				[
					[side * (0.07 + i * 0.045), 3.915, -0.07],
					[side * (0.085 + i * 0.045), 3.92, 0.0],
					[side * (0.09 + i * 0.045), 3.89, 0.08],
				],
				0.009,
			);
		for (let i = 0; i < 3; i++)
			cord(
				rider,
				riderHair,
				[
					[side * (0.12 + i * 0.03), 3.69, -0.21],
					[side * (0.13 + i * 0.03), 3.51, -0.22],
					[side * (0.1 + i * 0.025), 3.4, -0.19],
				],
				0.025,
			);
	}
	return rider;
}
