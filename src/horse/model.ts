import { createSaddle } from './saddle.ts';
import { attachSkin } from './skin.ts';
import { createRider } from './rider.ts';
import { surface, mesh, oval, cord } from './geometry.ts';
import type { HorseModel } from './types.ts';
import type { Vector3Tuple } from '../rendering/types.ts';
import type { Appearance } from './appearance.ts';
import { createPatternTextures } from './patterns.ts';
import * as THREE from 'three';
import { normalizeAppearance } from './appearance.ts';

// The model faces +Z. Separate material channels and named groups are the
// attachment points for future hairstyles, saddlecloth patterns and ornaments.
export function createHorse(): HorseModel {
	const root = new THREE.Group(),
		body = new THREE.Group();
	root.name = 'horse';
	body.name = 'body';
	root.add(body);
	const coat = surface('#aa6941', 0.58),
		hair = surface('#47332d', 0.72);
	const cloth = surface('#437f79'),
		leather = surface('#60432c', 0.48);
	const cream = surface('#f1dfbf'),
		hoof = surface('#393634', 0.52);
	const muzzle = surface('#86634f'),
		eye = surface('#171c1b', 0.18);
	const trim = surface('#dfcda3'),
		metal = surface('#b6b7ab', 0.32);
	metal.metalness = 0.65;

	// Eyes, inner ears and mouth remain separate surface details.

	for (const side of [-1, 1]) {
		const ear = new THREE.Group();
		ear.position.set(side * 0.2, 3.46, 1.19);
		ear.rotation.z = side * -0.19;
		body.add(ear);

		oval(ear, muzzle, [0.045, 0.15, 0.018], [0, 0.13, 0.055]);

		oval(body, eye, [0.039, 0.055, 0.068], [side * 0.276, 3.265, 1.49]);

		cord(
			body,
			muzzle,
			[
				[side * 0.18, 2.77, 2.13],
				[side * 0.19, 2.745, 2.04],
				[side * 0.17, 2.755, 1.97],
			],
			0.01,
		);
	}

	// Recessed nostrils retain their darker material.
	for (const side of [-1, 1]) {
		oval(body, muzzle, [0.028, 0.06, 0.082], [side * 0.213, 2.913, 2.077]);
		oval(body, eye, [0.016, 0.037, 0.058], [side * 0.237, 2.92, 2.091]);
	}
	cord(
		body,
		muzzle,
		[
			[-0.16, 2.757, 2.143],
			[0, 2.735, 2.188],
			[0.16, 2.757, 2.143],
		],
		0.013,
	);
	const mane = new THREE.Group();
	mane.name = 'mane';
	body.add(mane);
	for (let i = 0; i < 18; i++) {
		const t = i / 17;
		const y = 3.4 - t * 0.95,
			z = 1.02 - t * 0.72;
		cord(
			mane,
			hair,
			[
				[0, y, z],
				[0.15, y - 0.06, z - 0.035],
				[0.32, y - 0.27, z + 0.02],
				[0.32, y - 0.38, z + 0.09],
			],
			0.056 - t * 0.012,
		);
	}
	cord(
		mane,
		hair,
		[
			[0, 3.5, 1.17],
			[-0.05, 3.51, 1.34],
			[-0.09, 3.38, 1.53],
		],
		0.115,
	);
	const tail = new THREE.Group();
	tail.name = 'tail';
	tail.position.set(0, 2.04, -1.13);
	body.add(tail);
	for (let i = 0; i < 13; i++) {
		const x = (i - 6) * 0.025;
		cord(
			tail,
			hair,
			[
				[x * 0.3, 0, 0],
				[x, -0.3, -0.3],
				[x * 1.3, -0.85, -0.4],
				[x * 1.1 + 0.07, -1.53 + Math.abs(x), -0.31],
			],
			0.057,
		);
	}

	const legs: THREE.Bone[] = [],
		knees: THREE.Bone[] = [],
		hooves = [];
	for (const side of [-1, 1])
		for (const front of [false, true]) {
			const leg = new THREE.Bone();
			leg.position.set(side * 0.41, 1.81, front ? 0.72 : -0.82);
			body.add(leg);
			const kneeZ = front ? -0.01 : 0.13;

			const knee = new THREE.Bone();
			knee.position.set(0, -0.82, kneeZ);
			leg.add(knee);
			knees.push(knee);

			const foot = mesh(
				knee,
				new THREE.CylinderGeometry(0.1, 0.14, 0.2, 16),
				hoof,
				[0, -0.87, 0.035],
			);
			// A rounded toe, coronet and heel distinguish the hoof from the leg.
			foot.scale.z = 1.35;
			const coronet = mesh(
				foot,
				new THREE.TorusGeometry(0.105, 0.012, 6, 20),
				cream,
				[0, 0.087, 0],
			);
			coronet.rotation.x = Math.PI / 2;

			hooves.push(foot);
			legs.push(leg);
		}
	attachSkin(body, legs, knees, [coat, cream, muzzle]);
	const tack = new THREE.Group();
	tack.name = 'tack';
	body.add(tack);
	const equipment = new THREE.Group();
	equipment.name = 'choice:equipment:saddled';
	tack.add(equipment);
	// A draped pad follows the back and hangs naturally along both flanks.
	const padVertices = [],
		padIndices = [],
		padUVs = [],
		count = 22;
	for (let row = 0; row < 2; row++)
		for (let i = 0; i <= count; i++) {
			const angle = -1.32 + (i / count) * 2.64;
			padVertices.push(
				Math.sin(angle) * 0.67,
				1.91 + Math.cos(angle) * 0.65,
				-0.68 + row * 1.22,
			);
			padUVs.push(i / count, row);
			if (row && i < count) {
				const a = row * (count + 1) + i,
					b = i;
				padIndices.push(b, a, b + 1, a, a + 1, b + 1);
			}
		}
	const padGeometry = new THREE.BufferGeometry();
	padGeometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(padVertices, 3),
	);
	padGeometry.setIndex(padIndices);
	padGeometry.computeVertexNormals();
	padGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(padUVs, 2));
	cloth.side = THREE.DoubleSide;
	mesh(equipment, padGeometry, cloth);
	for (const z of [-0.68, 0.54]) {
		const points: Vector3Tuple[] = Array.from({ length: 23 }, (_, i) => {
			const a = -1.32 + (i / 22) * 2.64;
			return [Math.sin(a) * 0.677, 1.91 + Math.cos(a) * 0.659, z];
		});
		cord(equipment, trim, points, 0.022);
	}
	for (const side of [-1, 1]) {
		cord(
			equipment,
			trim,
			[
				[side * 0.65, 2.073, -0.68],
				[side * 0.65, 2.073, 0.54],
			],
			0.022,
		);
		// Bridle cheek pieces, noseband and reins connect to the rider's hands.
		cord(
			tack,
			leather,
			[
				[side * 0.22, 3.47, 1.15],
				[side * 0.32, 3.12, 1.36],
				[side * 0.225, 2.85, 1.92],
			],
			0.022,
		);
		cord(
			tack,
			leather,
			[
				[side * 0.24, 2.87, 1.98],
				[side * 0.43, 2.62, 1.15],
				[side * 0.3, 2.85, 0.42],
			],
			0.016,
		);
		const ring = mesh(
			tack,
			new THREE.TorusGeometry(0.055, 0.012, 6, 16),
			metal,
			[side * 0.247, 2.86, 1.94],
		);
		ring.rotation.y = Math.PI / 2;
	}
	cord(
		tack,
		leather,
		[
			[-0.235, 2.96, 1.96],
			[0, 3.035, 1.985],
			[0.235, 2.96, 1.96],
		],
		0.028,
	);
	createSaddle(equipment, leather, metal, trim);

	// A visible girth, saddle stitching and buckles give the tack a constructed finish.
	const girthPoints: Vector3Tuple[] = Array.from({ length: 25 }, (_, i) => {
		const a = (i / 24) * Math.PI * 2;
		return [Math.sin(a) * 0.615, 1.83 + Math.cos(a) * 0.65, 0.32];
	});
	cord(equipment, leather, girthPoints, 0.065);
	for (const side of [-1, 1]) {
		for (const [y, z] of [
			[2.18, 0.32],
			[3.23, 1.33],
		]) {
			const buckle = mesh(
				y < 3 ? equipment : tack,
				new THREE.TorusGeometry(0.034, 0.008, 6, 12),
				metal,
				[side * (y < 3 ? 0.623 : 0.326), y, z],
			);
			buckle.rotation.y = Math.PI / 2;
		}
	}
	cord(
		tack,
		leather,
		[
			[-0.24, 3.4, 1.32],
			[0, 3.425, 1.48],
			[0.24, 3.4, 1.32],
		],
		0.022,
	);
	const seat = new THREE.Group();
	seat.name = 'rider-seat';
	body.add(seat);
	const rider = createRider(seat, eye);
	const decoration = new THREE.Group();
	decoration.name = 'decoration';
	decoration.position.set(0.3, 3.4, 1.05);
	decoration.rotation.y = Math.PI / 2;
	body.add(decoration);
	const petals = surface('#e9be5f');
	for (let i = 0; i < 5; i++)
		oval(
			decoration,
			petals,
			[0.075, 0.1, 0.035],
			[Math.sin(i * 1.257) * 0.09, Math.cos(i * 1.257) * 0.09, 0],
		);
	oval(decoration, cream, [0.055, 0.055, 0.04], [0, 0, 0.025]);
	decoration.visible = false;
	const variants: Partial<
		Record<keyof Appearance | 'tailOrnament', Record<string, THREE.Group>>
	> = {};
	function variant(
		parent: THREE.Group,
		key: keyof typeof variants,
		id: string,
	) {
		const group = new THREE.Group();
		group.name = `choice:${key}:${id}`;
		parent.add(group);
		(variants[key] ||= {})[id] = group;
		return group;
	}
	function wrapExisting(
		parent: THREE.Group,
		key: keyof typeof variants,
		id: string,
	) {
		const children = [...parent.children],
			group = variant(parent, key, id);
		for (const child of children) group.add(child);
	}
	wrapExisting(mane, 'maneStyle', 'long');
	wrapExisting(tail, 'tailStyle', 'long');
	wrapExisting(decoration, 'ornament', 'flower');
	decoration.visible = true;
	const shortMane = variant(mane, 'maneStyle', 'short');
	const braidedMane = variant(mane, 'maneStyle', 'braided');
	for (let i = 0; i < 11; i++) {
		const t = i / 10,
			y = 3.4 - t * 0.95,
			z = 1.02 - t * 0.72;
		oval(shortMane, hair, [0.11, 0.13, 0.095], [0.055, y + 0.055, z]);
		if (i % 2 === 0) {
			for (const side of [-1, 1])
				oval(
					braidedMane,
					hair,
					[0.075, 0.115, 0.065],
					[0.13 + side * 0.033, y - 0.06, z],
				).rotation.z = side * 0.5;
			oval(braidedMane, hair, [0.09, 0.07, 0.075], [0.16, y - 0.16, z]);
		}
	}
	for (const group of [shortMane, braidedMane])
		cord(
			group,
			hair,
			[
				[0, 3.49, 1.16],
				[-0.03, 3.5, 1.33],
				[-0.05, 3.42, 1.43],
			],
			0.08,
		);
	const shortTail = variant(tail, 'tailStyle', 'short'),
		braidedTail = variant(tail, 'tailStyle', 'braided');
	for (let i = 0; i < 7; i++) {
		const x = (i - 6) * 0.024;
		cord(
			shortTail,
			hair,
			[
				[x * 0.3, 0, 0],
				[x, -0.2, -0.25],
				[x * 1.1, -0.82, -0.32],
			],
			0.052,
		);
	}
	for (let i = 0; i < 13; i++) {
		for (const side of [-1, 1]) {
			const piece = oval(
				braidedTail,
				hair,
				[0.077, 0.12, 0.075],
				[side * 0.038, -0.08 - i * 0.095, -0.18 - Math.min(i, 3) * 0.045],
			);
			piece.rotation.z = side * 0.55;
		}
	}
	oval(braidedTail, hair, [0.105, 0.2, 0.085], [0, -1.42, -0.315]);
	variant(decoration, 'ornament', 'none');
	const bow = variant(decoration, 'ornament', 'bow');
	for (const side of [-1, 1]) {
		oval(bow, petals, [0.14, 0.105, 0.045], [side * 0.105, 0, 0]).rotation.z =
			side * 0.35;
		cord(
			bow,
			petals,
			[
				[side * 0.035, -0.03, 0],
				[side * 0.07, -0.18, 0.015],
				[side * 0.12, -0.29, 0.03],
			],
			0.043,
		);
	}
	oval(bow, petals, [0.055, 0.06, 0.055], [0, 0, 0.035]);
	const ribbons = variant(decoration, 'ornament', 'ribbons');
	for (let i = 0; i < 3; i++) {
		const x = (i - 1) * 0.075;
		cord(
			ribbons,
			petals,
			[
				[x, 0.06, 0],
				[x + 0.05, -0.15, 0.01],
				[x - 0.03, -0.34, 0.02],
				[x + 0.04, -0.53 + i * 0.045, 0.025],
			],
			0.032,
		);
	}
	const tailRibbons = variant(tail, 'tailOrnament', 'ribbons');
	for (const side of [-1, 1])
		cord(
			tailRibbons,
			petals,
			[
				[side * 0.1, -0.17, -0.33],
				[side * 0.2, -0.48, -0.48],
				[side * 0.14, -0.88, -0.46],
			],
			0.035,
		);

	const patterns = createPatternTextures();
	const channels = { coat, hair, cloth, leather, ornamentColor: petals };
	let appearance = normalizeAppearance({});
	function setAppearance(value: unknown) {
		const settings = normalizeAppearance(value);
		equipment.visible = settings.equipment === 'saddled';
		seat.position.y = settings.equipment === 'bareback' ? -0.08 : 0;
		for (const [key, channel] of Object.entries(channels))
			channel.color.set(settings[key as keyof Appearance]);
		for (const [key, groups] of Object.entries(variants))
			for (const [id, group] of Object.entries(groups)) {
				group.visible =
					id ===
					(key === 'tailOrnament'
						? settings.ornament
						: settings[key as keyof Appearance]);
			}
		const texture = patterns.get(settings.pattern);
		if (cloth.map !== texture) {
			cloth.map = texture;
			cloth.needsUpdate = true;
		}
		appearance = settings;
		return settings;
	}
	setAppearance({});
	return {
		root,
		body,
		legs,
		knees,
		hooves,
		tail,
		rider,
		tack,
		coat,
		hair,
		cloth,
		leather,
		mane,
		decoration,
		setAppearance,
		getAppearance: () => ({ ...appearance }),
		dispose() {
			cloth.map = null;
			patterns.dispose();
		},
	};
}
