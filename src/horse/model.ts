import { createHalter } from './halter.ts';
import { createSaddle } from './saddle.ts';
import { attachSkin, skinMaterial } from './skin.ts';
import { createRider } from './rider.ts';
import { surface, hairSurface, mesh, oval, cord } from './geometry.ts';
import type { HorseModel, LegRig } from './types.ts';
import type { Vector3Tuple } from '../rendering/types.ts';
import type { Appearance } from './appearance.ts';
import { createPatternTextures } from './patterns.ts';
import * as THREE from 'three';
import { normalizeAppearance } from './appearance.ts';
import {
	horseAsset,
	onHead,
	headPoint,
	topline,
	type HorseRig,
} from './asset.ts';
import { HOOF_MARKER_HEIGHT } from './animation.ts';

/** Height of the back under the saddle in the original rig that tack was drawn for. */
const DRAWN_BACK_HEIGHT = 2.56;

const tuple = (v: THREE.Vector3): Vector3Tuple => [v.x, v.y, v.z];

/** Moves surface samples outward from a centre line by `offset`. */
function inflate(
	points: Vector3Tuple[],
	center: THREE.Vector3,
	offset: number,
) {
	return points.map((p) => {
		const v = new THREE.Vector3(...p);
		const out = v.clone().sub(center).setZ(0).normalize();
		return tuple(v.addScaledVector(out, offset));
	});
}

/** The first `t` below which the head is solid at `s`, i.e. the top of the face. */
function faceTop(rig: HorseRig, s: number) {
	for (let t = -0.05; t < 0.3; t += 0.01)
		if (onHead(rig, s, t, 1, 0).x > 0.02) return t;
	return 0;
}

/** A loop of strap around the head at `s`, `offset` clear of the surface. */
function headLoop(rig: HorseRig, s: number, offset: number, bottom = 0.3) {
	const top = faceTop(rig, s) - offset,
		points: Vector3Tuple[] = [];
	for (const side of [-1, 1]) {
		const run = [];
		for (let t = top + 0.02; t <= bottom; t += 0.04)
			run.push(tuple(onHead(rig, s, t, side, offset)));
		points.push(...(side < 0 ? run.reverse() : run));
		if (side < 0) points.push(tuple(headPoint(rig, s, top)));
	}
	points.push(tuple(headPoint(rig, s, bottom + offset + 0.03)), points[0]);
	return points;
}

function buildLegs(rig: HorseRig, body: THREE.Group) {
	const legs: THREE.Bone[] = [],
		knees: THREE.Bone[] = [],
		fetlocks: THREE.Bone[] = [],
		hooves: THREE.Object3D[] = [],
		legRigs: LegRig[] = [];
	for (const landmarks of rig.legs) {
		const [x, rootY, rootZ] = landmarks.root;
		const [kx, kneeY, kneeZ] = landmarks.knee;
		const [, fetlockY, fetlockZ] = landmarks.fetlock;
		const [, , groundZ] = landmarks.ground;
		const leg = new THREE.Bone(),
			knee = new THREE.Bone(),
			fetlock = new THREE.Bone(),
			hoof = new THREE.Object3D();
		leg.name = 'leg';
		leg.position.set(kx || x, rootY, rootZ);
		body.add(leg);
		knee.position.set(0, kneeY - rootY, kneeZ - rootZ);
		leg.add(knee);
		fetlock.position.set(0, fetlockY - kneeY, fetlockZ - kneeZ);
		knee.add(fetlock);
		hoof.name = 'hoof';
		hoof.position.set(0, HOOF_MARKER_HEIGHT - fetlockY, groundZ - fetlockZ);
		fetlock.add(hoof);
		legs.push(leg);
		knees.push(knee);
		fetlocks.push(fetlock);
		hooves.push(hoof);
		legRigs.push({
			segments: {
				upper: [kneeY - rootY, kneeZ - rootZ],
				lower: [fetlockY - kneeY, fetlockZ - kneeZ],
				front: legRigs.length % 2 === 1,
			},
			pastern: [HOOF_MARKER_HEIGHT - fetlockY, groundZ - fetlockZ],
			foot: [kx, groundZ],
			// A little slack keeps a supporting leg from locking fully straight.
			reach:
				0.985 *
				(Math.hypot(kneeY - rootY, kneeZ - rootZ) +
					Math.hypot(fetlockY - kneeY, fetlockZ - kneeZ)),
		});
	}
	return { legs, knees, fetlocks, hooves, legRigs };
}

// The model faces +Z. Separate material channels and named groups are the
// attachment points for hairstyles, saddlecloth patterns and ornaments.
export function createHorse(): HorseModel {
	const { rig } = horseAsset();
	const root = new THREE.Group(),
		body = new THREE.Group();
	root.name = 'horse';
	body.name = 'body';
	root.add(body);
	const coat = hairSurface('#aa6941', 0.66),
		hair = hairSurface('#47332d', 0.62, 1);
	const cloth = surface('#437f79'),
		leather = surface('#60432c', 0.48);
	const cream = surface('#f1dfbf'),
		hoof = surface('#393634', 0.52);
	const muzzle = surface('#5d4a40'),
		eye = surface('#171c1b', 0.18);
	const trim = surface('#dfcda3'),
		metal = surface('#b6b7ab', 0.32);
	metal.metalness = 0.65;

	// Glossy dark eyes sit in the sculpted sockets.
	const eyeball = new THREE.MeshPhysicalMaterial({
		color: '#1d130d',
		roughness: 0.25,
		clearcoat: 1,
		clearcoatRoughness: 0.04,
	});
	for (const side of [-1, 1]) {
		const [x, y, z] = rig.eye;
		oval(body, eyeball, [0.046, 0.046, 0.054], [side * (x - 0.004), y, z]);
	}

	const crest = (t: number) => {
		const z = THREE.MathUtils.lerp(1.42, 0.46, t);
		return { z, ...topline(rig, z) };
	};
	const mane = new THREE.Group();
	mane.name = 'mane';
	body.add(mane);
	for (let i = 0; i < 22; i++) {
		const t = i / 21,
			{ y, z, width, lowWidth } = crest(t);
		cord(
			mane,
			hair,
			[
				[0, y + 0.015, z],
				[width * 0.7, y - 0.03, z - 0.03],
				[(width + lowWidth) / 2 + 0.05, y - 0.2, z + 0.01],
				[lowWidth + 0.05, y - 0.36, z + 0.07],
			],
			0.05 - t * 0.012,
		);
	}
	// Forelock falls from the poll between the ears onto the forehead.
	const forelock = (): Vector3Tuple[] => [
		[0, crest(0).y + 0.02, crest(0).z + 0.04],
		tuple(headPoint(rig, 0.06, faceTop(rig, 0.06) - 0.05, -0.02)),
		tuple(headPoint(rig, 0.2, faceTop(rig, 0.2) - 0.035, -0.04)),
	];
	cord(mane, hair, forelock(), 0.09);
	const tail = new THREE.Group();
	tail.name = 'tail';
	// Hair springs from the top of the dock and falls clear of the buttocks.
	tail.position.set(0, 2.47, -1.32);
	body.add(tail);
	for (let i = 0; i < 13; i++) {
		const x = (i - 6) * 0.025;
		cord(
			tail,
			hair,
			[
				[x * 0.3, 0, 0],
				[x * 0.8, -0.18, -0.13],
				[x * 1.3, -0.72, -0.21],
				[x * 1.1 + 0.05, -1.75 + Math.abs(x), -0.12],
			],
			0.057,
		);
	}

	const { legs, knees, fetlocks, hooves, legRigs } = buildLegs(rig, body);
	attachSkin(
		body,
		legs,
		knees,
		fetlocks,
		skinMaterial(coat, cream, muzzle, hoof),
	);
	const settle = new THREE.Vector3(
		0,
		(rig.padBack[11][1] + rig.padFront[11][1]) / 2 + 0.025 - DRAWN_BACK_HEIGHT,
		0,
	);
	const tack = new THREE.Group();
	tack.name = 'tack';
	body.add(tack);
	const equipment = new THREE.Group();
	equipment.name = 'choice:equipment:saddled';
	tack.add(equipment);
	// A draped pad follows the back and hangs along both flanks.
	const barrel = new THREE.Vector3(0, 1.98, 0);
	const padRows = [
		inflate(rig.padBack, barrel, 0.03),
		inflate(rig.padFront, barrel, 0.03),
	];
	const padVertices: number[] = [],
		padIndices: number[] = [],
		padUVs: number[] = [],
		count = padRows[0].length - 1;
	padRows.forEach((row, r) =>
		row.forEach((point, i) => {
			padVertices.push(...point);
			padUVs.push(i / count, r);
			if (r && i < count) {
				const a = r * (count + 1) + i,
					b = i;
				padIndices.push(b, a, b + 1, a, a + 1, b + 1);
			}
		}),
	);
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
	for (const row of padRows)
		cord(equipment, trim, inflate(row, barrel, 0.008), 0.022);
	for (const end of [0, count])
		cord(equipment, trim, [padRows[0][end], padRows[1][end]], 0.022);
	const saddle = new THREE.Group();
	saddle.position.copy(settle);
	equipment.add(saddle);
	createSaddle(saddle, leather, metal, trim);
	// A visible girth around the barrel just behind the elbows.
	cord(equipment, leather, inflate(rig.girth, barrel, 0.05), 0.065);

	// Bridle: headstall over the poll, cheek pieces to the bit, browband,
	// noseband and reins to the rider's hands.
	const bridle = new THREE.Group();
	bridle.name = 'choice:headgear:bridle';
	tack.add(bridle);
	const pollTop = new THREE.Vector3(0, crest(0).y + 0.03, crest(0).z - 0.02);
	for (const side of [-1, 1]) {
		const bit = onHead(rig, 0.96, 0.245, side, 0.035);
		cord(
			bridle,
			leather,
			[
				tuple(pollTop),
				tuple(onHead(rig, 0.02, 0.06, side, 0.025)),
				tuple(onHead(rig, 0.2, 0.2, side, 0.025)),
				tuple(onHead(rig, 0.6, 0.24, side, 0.022)),
				tuple(bit),
			],
			0.022,
		);
		const neck = topline(rig, 1.15);
		cord(
			bridle,
			leather,
			[
				tuple(bit),
				[side * (neck.lowWidth + 0.12), neck.y - 0.45, 1.15],
				[side * 0.3, 2.85 + settle.y, 0.42],
			],
			0.016,
		);
		const ring = mesh(
			bridle,
			new THREE.TorusGeometry(0.05, 0.011, 6, 16),
			metal,
			tuple(bit),
		);
		ring.rotation.y = Math.PI / 2;
		const buckle = mesh(
			bridle,
			new THREE.TorusGeometry(0.03, 0.008, 6, 12),
			metal,
			tuple(onHead(rig, 0.22, 0.2, side, 0.035)),
		);
		buckle.rotation.y = Math.PI / 2;
	}
	cord(bridle, leather, headLoop(rig, 0.06, 0.025, 0.1).slice(0, -2), 0.02);
	cord(bridle, leather, headLoop(rig, 0.72, 0.025), 0.026);
	const { halter, leadAnchor } = createHalter(body, rig);
	halter.visible = false;
	const seat = new THREE.Group();
	seat.name = 'rider-seat';
	body.add(seat);
	const rider = createRider(seat, eye);
	const decoration = new THREE.Group();
	decoration.name = 'decoration';
	decoration.position.copy(onHead(rig, 0.02, 0.1, 1, 0.04));
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
	for (let i = 0; i < 13; i++) {
		const t = i / 12,
			{ y, z, width } = crest(t);
		oval(shortMane, hair, [0.07, 0.1, 0.085], [0.02, y + 0.03, z]);
		if (i % 2 === 0) {
			for (const side of [-1, 1])
				oval(
					braidedMane,
					hair,
					[0.06, 0.1, 0.055],
					[width * 0.7 + side * 0.028, y - 0.07, z],
				).rotation.z = side * 0.5;
			oval(
				braidedMane,
				hair,
				[0.075, 0.06, 0.065],
				[width + 0.02, y - 0.17, z],
			);
		}
	}
	for (const group of [shortMane, braidedMane])
		cord(group, hair, forelock().slice(0, 2), 0.07);
	const shortTail = variant(tail, 'tailStyle', 'short'),
		braidedTail = variant(tail, 'tailStyle', 'braided');
	for (let i = 0; i < 7; i++) {
		const x = (i - 6) * 0.024;
		cord(
			shortTail,
			hair,
			[
				[x * 0.3, 0, 0],
				[x * 0.8, -0.18, -0.13],
				[x * 1.1, -0.95, -0.2],
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
				[side * 0.038, -0.06 - i * 0.095, -0.06 - Math.min(i, 3) * 0.045],
			);
			piece.rotation.z = side * 0.55;
		}
	}
	oval(braidedTail, hair, [0.105, 0.2, 0.085], [0, -1.4, -0.2]);
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
				[side * 0.1, -0.12, -0.12],
				[side * 0.2, -0.43, -0.28],
				[side * 0.14, -0.83, -0.26],
			],
			0.035,
		);

	const patterns = createPatternTextures();
	const channels = { coat, hair, cloth, leather, ornamentColor: petals };
	let appearance = normalizeAppearance({});
	function setAppearance(value: unknown) {
		const settings = normalizeAppearance(value);
		equipment.visible = settings.equipment === 'saddled';
		seat.position.y =
			settle.y + (settings.equipment === 'bareback' ? -0.08 : 0);
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
		fetlocks,
		hooves,
		legRigs,
		tail,
		rider,
		tack,
		halter,
		bridle,
		leadAnchor,
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
