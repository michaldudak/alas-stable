import * as THREE from 'three';
import type { Vector3Tuple } from '../rendering/types.ts';
import { createFigure, type BoneName, type Figure } from './figure.ts';

/** Where the figure's feet-level origin sits in the horse's seat space. */
export const RIDER_SEAT = new THREE.Vector3(0, 1.4, -0.12);
/** The rider's left hand on the reins in seat space; the right mirrors it. */
export const REIN_HAND: Vector3Tuple = [0.15, 2.94, 0.36];
/** Left stirrup tread in seat space, under the ball of the rider's foot. */
export const STIRRUP: Vector3Tuple = [0.52, 1.66, 0.28];

const up = new THREE.Vector3(0, 1, 0);

/** Bone of the given limb on the +X (`L`) or -X (`R`) side. */
export const limb = (part: string, side: number) =>
	`${part}${side > 0 ? 'L' : 'R'}` as BoneName;

/**
 * A pat on the neck from the saddle: `lean` folds the rider forward and moves
 * the hand on `side` (+1 left, -1 right) from the rein to the neck at
 * `target` (seat space); `lift` raises the hand between pats.
 */
export interface Pat {
	lean: number;
	lift: number;
	side: number;
	target: THREE.Vector3;
}

const hand = new THREE.Vector3(),
	patHand = new THREE.Vector3(),
	euler = new THREE.Euler();

/**
 * Upright seat with a slight forward lean: knees against the saddle flaps,
 * lower legs on the girth, heels down in the stirrups and hands a fist's width
 * above the withers. A pat bends the rider forward over the horse's neck.
 */
export function seatedPose(figure: Figure, pat?: Pat) {
	const lean = pat?.lean ?? 0,
		turn = pat?.side ?? 0;
	figure.resetPose();
	// Leaning folds at the hips first, then rounds the back and turns the head.
	figure.bones.pelvis.quaternion.setFromEuler(euler.set(0.2 * lean, 0, 0));
	figure.bones.spine.quaternion.setFromEuler(
		euler.set(0.08 + 0.42 * lean, 0.12 * lean * turn, 0),
	);
	figure.bones.head.quaternion.setFromEuler(
		euler.set(-0.06 + 0.12 * lean, 0.3 * lean * turn, -0.08 * lean * turn),
	);
	hand.set(...REIN_HAND).sub(RIDER_SEAT);
	for (const side of [1, -1]) {
		// Ankle just behind and above the tread: heels down, knee on the flap.
		figure.reach(
			limb('thigh', side),
			limb('shin', side),
			new THREE.Vector3(
				side * STIRRUP[0],
				STIRRUP[1] + 0.1,
				STIRRUP[2] - 0.13,
			).sub(RIDER_SEAT),
			new THREE.Vector3(side, 0, 0.45),
			new THREE.Vector3(side * 0.3, 0, 1),
		);
		figure.aim(
			limb('foot', side),
			new THREE.Vector3(side * 0.12, 0.1, 1),
			up,
			up,
		);
		const reaching = pat && lean > 0 && side === pat.side;
		const target = hand.clone().setX(side * hand.x);
		if (reaching) {
			// The hand leaves the rein for the side of the neck.
			patHand
				.copy(pat.target)
				.sub(RIDER_SEAT)
				.add(new THREE.Vector3(0, 0.09 * pat.lift, 0));
			target.lerp(patHand, lean);
		}
		figure.reach(
			limb('arm', side),
			limb('forearm', side),
			target,
			reaching
				? new THREE.Vector3(side * 0.9, -0.3, -0.4)
				: new THREE.Vector3(side * 0.45, -0.5, -1),
			new THREE.Vector3(0, 0.3, 1),
		);
		figure.aim(
			limb('hand', side),
			reaching
				? new THREE.Vector3(
						-side * 0.3 * (1 - lean),
						-0.25 - 0.55 * lean,
						1 - 0.4 * lean,
					)
				: new THREE.Vector3(-side * 0.3, -0.25, 1),
			up,
		);
	}
}

/** The mounted rider, seated in the saddle and animated as one group. */
export function createRider(parent: THREE.Group, patTarget: THREE.Vector3) {
	const rider = new THREE.Group();
	rider.name = 'rider';
	parent.add(rider);
	const figure = createFigure();
	figure.root.position.copy(RIDER_SEAT);
	rider.add(figure.root);
	seatedPose(figure);
	const pat: Pat = { lean: 0, lift: 0, side: -1, target: patTarget };
	let posed = false;
	return {
		rider,
		/** Leans over to pat the neck; zero returns to the plain seat. */
		gesture: (lean: number, lift: number, side: number) => {
			if (lean <= 0.001) {
				if (posed) seatedPose(figure);
				posed = false;
				return;
			}
			pat.lean = lean;
			pat.lift = lift;
			pat.side = side;
			seatedPose(figure, pat);
			posed = true;
		},
	};
}
