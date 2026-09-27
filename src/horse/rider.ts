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
 * Upright seat with a slight forward lean: knees against the saddle flaps,
 * lower legs on the girth, heels down in the stirrups and hands a fist's width
 * above the withers.
 */
export function seatedPose(figure: Figure) {
	figure.resetPose();
	figure.bones.spine.quaternion.setFromEuler(new THREE.Euler(0.08, 0, 0));
	figure.bones.head.quaternion.setFromEuler(new THREE.Euler(-0.06, 0, 0));
	const hand = new THREE.Vector3(...REIN_HAND).sub(RIDER_SEAT);
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
		figure.reach(
			limb('arm', side),
			limb('forearm', side),
			hand.clone().setX(side * hand.x),
			new THREE.Vector3(side * 0.45, -0.5, -1),
			new THREE.Vector3(0, 0.3, 1),
		);
		figure.aim(
			limb('hand', side),
			new THREE.Vector3(-side * 0.3, -0.25, 1),
			up,
		);
	}
}

/** The mounted rider, seated in the saddle and animated as one group. */
export function createRider(parent: THREE.Group) {
	const rider = new THREE.Group();
	rider.name = 'rider';
	parent.add(rider);
	const figure = createFigure();
	figure.root.position.copy(RIDER_SEAT);
	rider.add(figure.root);
	seatedPose(figure);
	return rider;
}
