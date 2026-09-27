import * as THREE from 'three';
import type { Obstacle } from '../game/types.ts';
import { wingOffsets } from '../game/obstacles.ts';
import { box, cylinder } from './primitives.ts';

export type JumpKind = 'vertical' | 'cross' | 'oxer';

/** A show jump: plain data for physics plus the group that draws it. */
export type Jump = Obstacle & {
	kind: JumpKind;
	/** Depth between the front and back rails of a spread fence. */
	spread?: number;
	group: THREE.Group;
	/** The poles that fall when a horse hits the fence. */
	rails: THREE.Group;
};

const JUMPS: [JumpKind, number, number, number, string][] = [
	['vertical', 0, 7, 0, '#75968a'],
	['vertical', 0, -8, 0, '#bf795f'],
	['vertical', 0, -24, 0, '#d6aa54'],
	['cross', -9.5, 13, 0, '#7275a3'],
	['oxer', 9.5, -15, 0, '#b75f59'],
];

/** A round pole painted in alternating bands, lying along X between two points. */
function pole(
	parent: THREE.Object3D,
	color: string,
	from: [number, number, number],
	to: [number, number, number],
) {
	const start = new THREE.Vector3(...from),
		end = new THREE.Vector3(...to);
	const length = start.distanceTo(end),
		direction = end.clone().sub(start).normalize();
	const bands = 8;
	for (let i = 0; i < bands; i++) {
		const center = start
			.clone()
			.addScaledVector(direction, ((i + 0.5) / bands) * length);
		const band = cylinder(
			parent,
			i % 2 ? '#fff0d3' : color,
			0.075,
			length / bands,
			[center.x, center.y, center.z],
		);
		band.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, direction);
	}
}

function build(kind: JumpKind, color: string, width: number, spread = 0) {
	const group = new THREE.Group(),
		rails = new THREE.Group();
	group.userData.dynamic = true;
	group.add(rails);
	const half = width / 2;
	const obstacle = { x: 0, z: 0, width, down: 0, spread };
	// Show-jumping wings: a slim standard braced by a painted foot.
	for (const [u, v] of wingOffsets(obstacle)) {
		const side = Math.sign(u);
		box(group, '#f7edcf', [0.16, 1.9, 0.16], [u, 0.95, v], 0, 'post');
		box(group, color, [0.14, 0.14, 1.1], [u, 0.07, v]);
		box(group, color, [0.5, 0.12, 0.14], [u + side * 0.2, 0.06, v]);
		for (const y of kind === 'cross' ? [0.3, 1] : [0.5, 1])
			box(group, '#6f7472', [0.06, 0.1, 0.22], [u - side * 0.1, y - 0.1, v]);
	}
	if (kind === 'vertical')
		for (const y of [0.5, 1]) pole(rails, color, [-half, y, 0], [half, y, 0]);
	if (kind === 'cross') {
		// Two poles crossed low in the middle invite a horse over the centre.
		pole(rails, color, [-half, 1, 0.08], [half, 0.3, 0.08]);
		pole(rails, color, [-half, 0.3, -0.08], [half, 1, -0.08]);
		pole(rails, color, [-half, 0.12, -0.35], [half, 0.12, -0.35]);
	}
	if (kind === 'oxer') {
		const front = -spread / 2,
			back = spread / 2;
		pole(rails, color, [-half, 0.85, front], [half, 0.85, front]);
		pole(rails, color, [-half, 1.05, back], [half, 1.05, back]);
		pole(rails, color, [-half, 0.55, back], [half, 0.55, back]);
		// A low hedge filler in front makes the spread easy to read.
		const hedge = new THREE.MeshStandardMaterial({
			color: '#4c6e3a',
			roughness: 1,
		});
		for (let i = 0; i < 6; i++) {
			const bush = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), hedge);
			bush.scale.set(1.5, 0.75, 0.9);
			bush.position.set(
				-half + 0.8 + i * ((width - 1.6) / 5),
				0.3,
				front - 0.35,
			);
			bush.castShadow = true;
			bush.receiveShadow = true;
			rails.add(bush);
		}
	}
	return { group, rails };
}

/** Moves a jump's drawing to its current position and angle. */
export function placeJump(jump: Jump) {
	jump.group.position.set(jump.x, 0, jump.z);
	jump.group.rotation.y = jump.angle ?? 0;
}

/** The fences in the jumping arena; the rider can move every one of them. */
export function createJumps(scene: THREE.Scene) {
	return JUMPS.map(([kind, x, z, angle, color]) => {
		const spread = kind === 'oxer' ? 1.1 : 0;
		const { group, rails } = build(kind, color, 8, spread);
		scene.add(group);
		const jump: Jump = {
			kind,
			x,
			z,
			angle,
			width: 8,
			down: 0,
			spread,
			group,
			rails,
		};
		placeJump(jump);
		return jump;
	});
}
