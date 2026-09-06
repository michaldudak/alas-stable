import * as THREE from 'three';
import type { Vector3Tuple } from '../rendering/types.ts';
import { surface, oval, cord, form, mesh } from './geometry.ts';

/** A tapered fabric surface follows the entire limb without separate joint spheres. */
function sleeve(
	parent: THREE.Group,
	material: THREE.Material,
	points: Vector3Tuple[],
	radii: number[],
) {
	const path = new THREE.CatmullRomCurve3(
		points.map((p) => new THREE.Vector3(...p)),
	);
	const frames = path.computeFrenetFrames(32, false);
	const positions: number[] = [],
		indices: number[] = [];
	for (let i = 0; i <= 32; i++) {
		const t = i / 32,
			p = path.getPointAt(t);
		const r = t * (radii.length - 1),
			section = Math.min(radii.length - 2, Math.floor(r));
		const blend = r - section;
		const radius = THREE.MathUtils.lerp(
			radii[section],
			radii[section + 1],
			blend * blend * (3 - 2 * blend),
		);
		for (let j = 0; j <= 20; j++) {
			const angle = (j / 20) * Math.PI * 2;
			const vertex = p
				.clone()
				.addScaledVector(frames.normals[i], Math.cos(angle) * radius)
				.addScaledVector(frames.binormals[i], Math.sin(angle) * radius * 0.92);
			positions.push(vertex.x, vertex.y, vertex.z);
			if (i && j < 20) {
				const a = i * 21 + j,
					b = a - 21;
				indices.push(b, b + 1, a, b + 1, a + 1, a);
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

export function createRider(parent: THREE.Group, eye: THREE.Material) {
	const rider = new THREE.Group();
	rider.name = 'rider';
	parent.add(rider);
	const shirt = surface('#bd7759'),
		pants = surface('#d9ceb5'),
		boots = surface('#303a37', 0.52);
	const skin = surface('#e6b795'),
		helmet = surface('#35534b', 0.48),
		hair = surface('#624532');
	const seam = surface('#965f49'),
		lip = surface('#ad7768'),
		lining = surface('#e7dfcf'),
		glove = surface('#50453a', 0.67);
	const iris = surface('#594732', 0.3);
	// A fitted torso has a waist, ribcage and sloping shoulders.
	form(
		rider,
		shirt,
		[
			[[0, 2.73, -0.13], 0.218, 0.145],
			[[0, 2.84, -0.12], 0.21, 0.145],
			[[0, 3.04, -0.11], 0.253, 0.17],
			[[0, 3.18, -0.105], 0.27, 0.15],
			[[0, 3.26, -0.095], 0.19, 0.118],
			[[0, 3.285, -0.085], 0.086, 0.085],
		],
		'y',
	);
	oval(rider, pants, [0.28, 0.16, 0.235], [0, 2.7, -0.12]);
	form(
		rider,
		skin,
		[
			[[0, 3.23, -0.08], 0.086, 0.082],
			[[0, 3.4, -0.065], 0.078, 0.075],
		],
		'y',
	);
	const head = new THREE.Group();
	head.position.set(0, 3.62, -0.065);
	rider.add(head);
	const face = form(
		head,
		skin,
		[
			[[0, -0.23, -0.005], 0.06, 0.067],
			[[0, -0.192, -0.008], 0.123, 0.119],
			[[0, -0.11, -0.02], 0.178, 0.164],
			[[0, -0.025, -0.025], 0.186, 0.18],
			[[0, 0.1, -0.025], 0.181, 0.18],
			[[0, 0.21, -0.03], 0.145, 0.145],
			[[0, 0.265, -0.035], 0.012, 0.018],
		],
		'y',
		96,
	);
	// Sculpt the nose and cheeks into the face rather than attaching a separate wedge.
	const vertices = face.geometry.getAttribute('position');
	for (let i = 0; i < vertices.count; i++) {
		const x = vertices.getX(i),
			y = vertices.getY(i),
			z = vertices.getZ(i);
		if (z <= 0) continue;
		const front = Math.min(1, z / 0.1);
		const nose =
			0.039 * Math.exp(-((x / 0.033) ** 2) - ((y + 0.063) / 0.039) ** 2);
		const bridge =
			0.012 * Math.exp(-((x / 0.023) ** 2) - ((y + 0.006) / 0.065) ** 2);
		const cheeks =
			0.009 *
			Math.exp(
				-(((Math.abs(x) - 0.105) / 0.055) ** 2) - ((y + 0.074) / 0.05) ** 2,
			);
		vertices.setZ(i, z + (nose + bridge + cheeks) * front);
	}
	face.geometry.computeVertexNormals();

	cord(
		head,
		lip,
		[
			[-0.047, -0.148, 0.126],
			[0, -0.156, 0.136],
			[0.047, -0.148, 0.126],
		],
		0.005,
	);
	oval(head, hair, [0.192, 0.2, 0.12], [0, 0.02, -0.104]);
	// Close-fitting helmet shell and shallow peak.
	form(
		head,
		helmet,
		[
			[[0, 0.096, -0.022], 0.202, 0.198],
			[[0, 0.19, -0.031], 0.209, 0.207],
			[[0, 0.285, -0.04], 0.144, 0.148],
			[[0, 0.327, -0.043], 0.01, 0.012],
		],
		'y',
	);
	oval(head, helmet, [0.198, 0.018, 0.14], [0, 0.107, 0.155]);
	for (const side of [-1, 1]) {
		oval(head, lining, [0.031, 0.015, 0.009], [side * 0.071, 0.008, 0.146]);
		oval(head, iris, [0.012, 0.013, 0.006], [side * 0.07, 0.007, 0.154]);
		oval(head, eye, [0.006, 0.008, 0.004], [side * 0.07, 0.007, 0.159]);
		cord(
			head,
			skin,
			[
				[side * 0.039, 0.011, 0.143],
				[side * 0.07, 0.026, 0.151],
				[side * 0.103, 0.01, 0.135],
			],
			0.007,
		);
		cord(
			head,
			hair,
			[
				[side * 0.04, 0.047, 0.145],
				[side * 0.074, 0.056, 0.143],
				[side * 0.111, 0.044, 0.129],
			],
			0.006,
		);
		oval(head, skin, [0.027, 0.054, 0.032], [side * 0.185, -0.058, -0.031]);
		oval(head, lip, [0.011, 0.029, 0.016], [side * 0.205, -0.056, -0.011]);
		cord(
			head,
			boots,
			[
				[side * 0.2, 0.11, 0.013],
				[side * 0.19, -0.095, 0.01],
				[side * 0.1, -0.228, 0.06],
				[0, -0.241, 0.093],
			],
			0.008,
		);
		for (let i = 0; i < 3; i++)
			cord(
				head,
				hair,
				[
					[side * (0.12 + i * 0.017), 0.085, -0.137],
					[side * (0.14 + i * 0.017), -0.08, -0.133],
					[side * (0.1 + i * 0.017), -0.19, -0.13],
				],
				0.015,
			);
		cord(
			head,
			boots,
			[
				[side * 0.07, 0.306, -0.04],
				[side * 0.083, 0.292, 0.046],
				[side * 0.09, 0.264, 0.098],
			],
			0.007,
		);
		const limbStart = rider.children.length;
		sleeve(
			rider,
			shirt,
			[
				[side * 0.19, 3.185, -0.1],
				[side * 0.29, 3.14, -0.085],
				[side * 0.35, 2.97, 0.035],
				[side * 0.31, 2.89, 0.26],
				[side * 0.29, 2.855, 0.4],
			],
			[0.11, 0.108, 0.087, 0.072, 0.057],
		);
		// Fingers curl around the reins; hands stay at the existing rein attachments.
		oval(rider, glove, [0.057, 0.055, 0.075], [side * 0.29, 2.855, 0.436]);
		for (let finger = 0; finger < 3; finger++)
			cord(
				rider,
				glove,
				[
					[side * 0.335, 2.876 - finger * 0.025, 0.417],
					[side * 0.325, 2.875 - finger * 0.025, 0.482],
					[side * 0.285, 2.865 - finger * 0.025, 0.486],
				],
				0.012,
			);
		oval(rider, glove, [0.024, 0.037, 0.049], [side * 0.252, 2.88, 0.44]);
		sleeve(
			rider,
			pants,
			[
				[side * 0.18, 2.71, -0.12],
				[side * 0.37, 2.54, 0.035],
				[side * 0.53, 2.29, 0.25],
				[side * 0.558, 2.18, 0.285],
				[side * 0.576, 2.1, 0.255],
			],
			[0.15, 0.145, 0.11, 0.098, 0.084],
		);
		form(
			rider,
			boots,
			[
				[[side * 0.64, 1.65, 0.1], 0.076, 0.09],
				[[side * 0.625, 1.8, 0.14], 0.082, 0.09],
				[[side * 0.598, 1.98, 0.215], 0.097, 0.107],
				[[side * 0.575, 2.13, 0.27], 0.09, 0.097],
			],
			'y',
		);
		oval(rider, boots, [0.096, 0.067, 0.189], [side * 0.64, 1.625, 0.195]);
		oval(rider, boots, [0.1, 0.024, 0.194], [side * 0.64, 1.567, 0.2]);
		mesh(rider, new THREE.BoxGeometry(0.142, 0.055, 0.125), boots, [
			side * 0.64,
			1.548,
			0.09,
		]);
		cord(
			rider,
			glove,
			[
				[side * 0.672, 2.12, 0.27],
				[side * 0.703, 1.93, 0.19],
				[side * 0.715, 1.73, 0.112],
			],
			0.006,
		);
		for (const part of rider.children.slice(limbStart))
			part.name = 'seated-limb';
		cord(
			rider,
			lining,
			[
				[side * 0.084, 3.295, -0.07],
				[side * 0.134, 3.245, 0.015],
				[side * 0.05, 3.205, 0.047],
			],
			0.017,
		);
	}
	cord(
		rider,
		seam,
		[
			[0, 2.77, 0.03],
			[0, 2.98, 0.062],
			[0, 3.19, 0.048],
		],
		0.004,
	);
	for (const y of [3.09, 3.155])
		oval(rider, lining, [0.009, 0.009, 0.006], [0, y, 0.063]);
	return rider;
}
