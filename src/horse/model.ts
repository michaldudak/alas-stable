import { createHalter } from './halter.ts';
import { createSaddle } from './saddle.ts';
import { attachSkin, skinMaterial } from './skin.ts';
import { createRider } from './rider.ts';
import {
	surface,
	hairSurface,
	mesh,
	oval,
	cord,
	locks,
	seeded,
	type Lock,
} from './geometry.ts';
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

/** A point on the crest from the poll (t = 0) to the withers (t = 1). */
function crestAt(rig: HorseRig, t: number) {
	const z = THREE.MathUtils.lerp(1.42, 0.46, t);
	return { z, ...topline(rig, z) };
}

/** Half-width of the neck `depth` below the crest, from the two measured levels. */
function neckWidth(width: number, lowWidth: number, depth: number) {
	if (depth <= 0.15) return (width * depth) / 0.15;
	return width + ((lowWidth - width) * (depth - 0.15)) / 0.25;
}

/**
 * Mane locks rooted along the crest. Long hair lies flat down the side of the
 * neck; short hair stands up like a pulled, brushed mane.
 */
function maneHair(
	rig: HorseRig,
	count: number,
	seed: number,
	short: boolean,
): Lock[] {
	const next = seeded(seed);
	const strands: Lock[] = [];
	for (let i = 0; i < count; i++) {
		const t = (i + next()) / count;
		const { y, z, width, lowWidth } = crestAt(rig, t);
		const x = (next() - 0.5) * 0.04;
		if (short) {
			const height = 0.11 + next() * 0.05;
			strands.push({
				points: [
					[x, y - 0.02, z],
					[x + 0.02, y + height * 0.6, z - 0.01],
					[x + 0.04 + next() * 0.02, y + height, z - 0.03],
				],
				radius: 0.018 + next() * 0.006,
				tip: 0.5,
			});
			continue;
		}
		// Longest halfway down the neck, shorter at the poll and the withers.
		const length =
			(0.26 + 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.15))) *
			(0.85 + next() * 0.3);
		const side = next() < 0.1 ? -1 : 1,
			lie = (depth: number) =>
				side * (neckWidth(width, lowWidth, depth) + 0.03);
		strands.push({
			points: [
				[x, y + 0.01, z],
				[side * width * 0.5, y + 0.005, z - 0.01],
				[lie(length * 0.35), y - length * 0.35, z - 0.015],
				[lie(length * 0.7), y - length * 0.7, z + 0.005],
				[
					lie(length) + side * 0.02,
					y - length,
					z + 0.02 + (next() - 0.5) * 0.04,
				],
			],
			radius: 0.017 + next() * 0.009,
			tip: 0.3,
		});
	}
	return strands;
}

/** Forelock locks from between the ears down the forehead. */
function forelockHair(
	rig: HorseRig,
	count: number,
	seed: number,
	reach: number,
): Lock[] {
	const next = seeded(seed);
	const poll = crestAt(rig, 0);
	const strands: Lock[] = [];
	for (let i = 0; i < count; i++) {
		const x = (next() - 0.5) * 0.06,
			end = reach * (0.8 + next() * 0.3);
		strands.push({
			points: [
				[x, poll.y + 0.02, poll.z + 0.02],
				tuple(headPoint(rig, 0.05, faceTop(rig, 0.05) - 0.045, x * 1.2)),
				tuple(
					headPoint(rig, end * 0.6, faceTop(rig, end * 0.6) - 0.03, x * 1.5),
				),
				tuple(
					headPoint(
						rig,
						end,
						faceTop(rig, end) - 0.02,
						x * 1.8 + (next() - 0.5) * 0.03,
					),
				),
			],
			radius: 0.024 + next() * 0.008,
			tip: 0.3,
		});
	}
	return strands;
}

/** Hair locks of a full or pulled tail, in the tail's local frame. */
function tailHair(count: number, length: number, seed: number): Lock[] {
	const next = seeded(seed);
	// Dock runs down and back from the tail head; `out` points away from the body.
	const dock = new THREE.Vector3(0, -0.29, -0.12),
		out = new THREE.Vector3(0, 0.383, -0.924);
	const strands: Lock[] = [];
	for (let i = 0; i < count; i++) {
		const along = ((i % 8) / 8) * 0.8 + next() * 0.08,
			angle = (next() * 2 - 1) * 1.9;
		const reach = 0.075 * (1 - 0.35 * along);
		const root = dock
			.clone()
			.multiplyScalar(along)
			.addScaledVector(out, Math.cos(angle) * reach)
			.add(new THREE.Vector3(Math.sin(angle) * reach, 0, 0));
		const spread = Math.sin(angle) * (0.05 + next() * 0.06),
			depth = Math.cos(angle) * 0.05,
			end = length * (0.88 + next() * 0.2);
		strands.push({
			points: [
				tuple(root),
				[root.x * 1.2, root.y - 0.13, root.z - 0.08],
				[spread * 1.6, -0.55 - 0.25 * along, -0.26 + depth * 0.5],
				[
					spread * 2 + (next() - 0.5) * 0.05,
					-0.55 - (end - 0.55) * 0.55,
					-0.22 + depth * 0.4,
				],
				[
					spread * 1.6 + (next() - 0.5) * 0.08,
					-end,
					-0.16 + (next() - 0.5) * 0.05,
				],
			],
			radius: 0.03 + next() * 0.012,
			tip: 0.35,
		});
	}
	return strands;
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

	const crest = (t: number) => crestAt(rig, t);
	const mane = new THREE.Group();
	mane.name = 'mane';
	body.add(mane);
	locks(
		mane,
		hair,
		[...maneHair(rig, 110, 11, false), ...forelockHair(rig, 24, 12, 0.3)],
		14,
	);
	const tail = new THREE.Group();
	tail.name = 'tail';
	// The tail pivots at the tail head; hair grows around the top and sides of
	// the dock and falls in a rounded, tapering bundle clear of the buttocks.
	tail.position.set(0, 2.47, -1.32);
	body.add(tail);
	locks(tail, hair, tailHair(40, 1.55, 1));
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
	locks(
		shortMane,
		hair,
		[...maneHair(rig, 90, 13, true), ...forelockHair(rig, 10, 14, 0.16)],
		6,
	);
	for (let i = 0; i < 13; i += 2) {
		const { y, z, width } = crest(i / 12);
		for (const side of [-1, 1])
			oval(
				braidedMane,
				hair,
				[0.06, 0.1, 0.055],
				[width * 0.7 + side * 0.028, y - 0.07, z],
			).rotation.z = side * 0.5;
		oval(braidedMane, hair, [0.075, 0.06, 0.065], [width + 0.02, y - 0.17, z]);
	}
	locks(braidedMane, hair, forelockHair(rig, 10, 15, 0.16), 8);
	const shortTail = variant(tail, 'tailStyle', 'short'),
		braidedTail = variant(tail, 'tailStyle', 'braided');
	locks(shortTail, hair, tailHair(30, 0.95, 2));
	for (let i = 0; i < 13; i++) {
		for (const side of [-1, 1]) {
			const piece = oval(
				braidedTail,
				hair,
				[0.077, 0.12, 0.075],
				[side * 0.038, -0.06 - i * 0.095, -0.08 - Math.min(i, 4) * 0.045],
			);
			piece.rotation.z = side * 0.55;
		}
	}
	oval(braidedTail, hair, [0.105, 0.2, 0.085], [0, -1.4, -0.26]);
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
