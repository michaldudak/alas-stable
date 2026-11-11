import * as THREE from 'three';
import type { Vector3Tuple } from '../rendering/types.ts';
import { createFigure, type BoneName, type Figure } from './figure.ts';
import type { RiderModelId } from './rider-asset.ts';

/** Where the seated rider's hip joint rests, in the horse's seat space. */
export const SEAT_POINT = new THREE.Vector3(0, 2.72, -0.14);
/** The rider's left hand on the reins in seat space; the right mirrors it. */
export const REIN_HAND: Vector3Tuple = [0.13, 2.98, 0.42];
/** Left stirrup tread in seat space, under the ball of the rider's foot. */
export const STIRRUP: Vector3Tuple = [0.56, 1.64, 0.26];

/** Bone of the given limb on the +X (`L`) or -X (`R`) side. */
export const limb = (part: string, side: number) =>
	`${part}${side > 0 ? 'L' : 'R'}` as BoneName;

/** Where a figure's ground-level origin sits in seat space when it is in the saddle. */
export const seatOrigin = (figure: Figure, out = new THREE.Vector3()) =>
	out.copy(SEAT_POINT).sub(figure.rest.hips);

/**
 * A pat on the neck from the saddle: `lean` folds the rider forward and moves
 * the hand on `side` (+1 left, -1 right) from the rein to the neck at
 * `target` (seat space); `lift` raises the hand between pats.
 */
/**
 * How the rider goes with the horse: `rise` (0-1) lifts her out of the saddle
 * as she posts to the trot, `absorb` bends her back (radians, forward
 * positive) so her shoulders stay level while the horse rocks under her.
 */
export interface SeatMotion {
	rise: number;
	absorb: number;
	/** How far her hands go forward along the reins with the horse's head. */
	give?: number;
}

export interface Pat {
	lean: number;
	lift: number;
	side: number;
	target: THREE.Vector3;
}

const euler = new THREE.Euler(),
	target = new THREE.Vector3(),
	pole = new THREE.Vector3(),
	direction = new THREE.Vector3(),
	hint = new THREE.Vector3(),
	origin = new THREE.Vector3(),
	wrist = new THREE.Vector3(),
	pitchAxis = new THREE.Vector3(1, 0, 0),
	yawAxis = new THREE.Vector3(0, 1, 0);

/** The foot's rest direction tipped toe-up by `pitch` and turned out by `yaw`. */
export function footDirection(
	figure: Figure,
	side: number,
	pitch: number,
	yaw: number,
	out: THREE.Vector3,
) {
	return out
		.copy(figure.directions[limb('foot', side)])
		.applyAxisAngle(pitchAxis, -pitch)
		.applyAxisAngle(yawAxis, yaw);
}

/**
 * A balanced seat: ear, shoulder, hip and heel in line, thighs on the saddle
 * flaps, heels down in the stirrups, elbows by the sides and closed hands
 * carried thumbs-up above the withers. A pat bends the rider over the neck.
 */
export function seatedPose(figure: Figure, pat?: Pat, motion?: SeatMotion) {
	const lean = pat?.lean ?? 0,
		turn = pat?.side ?? 0,
		rise = motion?.rise ?? 0,
		absorb = motion?.absorb ?? 0;
	const { bones } = figure;
	figure.resetPose();
	seatOrigin(figure, origin);
	// Posting, she swings up and forward over her knees, hinging at the hips.
	bones.hips.position
		.copy(figure.rest.hips)
		.add(target.set(0, 0.17 * rise, 0.1 * rise));
	// Leaning folds at the hips first, then rounds the back and turns the head.
	bones.hips.quaternion.setFromEuler(
		euler.set(0.04 + 0.2 * lean + 0.2 * rise, 0, 0),
	);
	bones.spine.quaternion.setFromEuler(
		euler.set(-0.03 + 0.22 * lean + 0.5 * absorb, 0.06 * lean * turn, 0),
	);
	bones.chest.quaternion.setFromEuler(
		euler.set(0.02 + 0.2 * lean + 0.5 * absorb, 0.06 * lean * turn, 0),
	);
	bones.neck.quaternion.setFromEuler(
		euler.set(-0.02 + 0.05 * lean - 0.07 * rise, 0.12 * lean * turn, 0),
	);
	bones.head.quaternion.setFromEuler(
		euler.set(
			-0.03 + 0.07 * lean - 0.08 * rise,
			0.18 * lean * turn,
			-0.08 * lean * turn,
		),
	);
	for (const side of [1, -1]) {
		// The ball of the foot rests on the tread, the heel sinks below it.
		const heelDown = 0.16;
		footDirection(figure, side, heelDown, side * 0.14, direction);
		const ball = figure.rest.toeL.distanceTo(figure.rest.footL);
		target
			.set(side * STIRRUP[0], STIRRUP[1] + 0.035, STIRRUP[2])
			.sub(origin)
			.addScaledVector(direction, -ball);
		figure.reach(
			limb('thigh', side),
			limb('shin', side),
			target,
			pole.set(side * 0.55, 0.3, 1),
		);
		figure.aim(limb('foot', side), direction, yawAxis, yawAxis);
		bones[limb('toe', side)].quaternion.identity();

		const reaching = pat && lean > 0 && side === pat.side;
		const letter = side > 0 ? 'L' : 'R';
		// The closed hand points down the rein towards the bit, thumb on top.
		direction.set(-side * 0.22, -0.18, 1).normalize();
		hint.set(-side * 0.25, 1, 0);
		const palm = figure.rest[limb('middle1', side)].distanceTo(
			figure.rest[limb('hand', side)],
		);
		wrist
			.set(side * REIN_HAND[0], REIN_HAND[1], REIN_HAND[2])
			.sub(origin)
			.addScaledVector(direction, -palm * 0.8 + (motion?.give ?? 0));
		let curl = 0.82;
		if (reaching) {
			// The hand leaves the rein for the side of the neck, palm flat.
			target
				.copy(pat.target)
				.sub(origin)
				.add(pole.set(0, 0.09 * pat.lift + 0.04, 0));
			wrist.lerp(target, lean);
			direction.lerp(pole.set(-side * 0.15, -0.55, 0.8), lean).normalize();
			hint.lerp(pole.set(side * 0.9, 0.4, 0), lean);
			curl = THREE.MathUtils.lerp(curl, 0.08, lean);
		}
		figure.reach(
			limb('arm', side),
			limb('forearm', side),
			wrist,
			reaching
				? pole.set(side * 0.9, -0.4, -0.4)
				: pole.set(side * 0.35, -0.6, -1),
		);
		figure.aim(limb('hand', side), direction, hint, figure.thumbward[letter]);
		figure.grip(side, curl, curl * 0.5);
	}
}

/** The mounted rider, seated in the saddle and animated as one group. */
export function createRider(
	parent: THREE.Group,
	patTarget: THREE.Vector3,
	model?: RiderModelId,
) {
	const rider = new THREE.Group();
	rider.name = 'rider';
	parent.add(rider);
	const figure = createFigure(model);
	seatOrigin(figure, figure.root.position);
	rider.add(figure.root);
	seatedPose(figure);
	const pat: Pat = { lean: 0, lift: 0, side: -1, target: patTarget };
	const motion: SeatMotion = { rise: 0, absorb: 0, give: 0 };
	let posed = false,
		moved = false;
	return {
		rider,
		figure,
		/** Goes with the horse's movement; call each frame while she is visible. */
		follow: (rise: number, absorb: number, give = 0) => {
			const moving =
				Math.abs(rise) > 0.002 ||
				Math.abs(absorb) > 0.002 ||
				Math.abs(give) > 0.002;
			if (!moving && !moved) return;
			motion.rise = rise;
			motion.absorb = absorb;
			motion.give = give;
			seatedPose(figure, posed ? pat : undefined, motion);
			moved = moving;
		},
		/** Leans over to pat the neck; zero returns to the plain seat. */
		gesture: (lean: number, lift: number, side: number) => {
			if (lean <= 0.001) {
				if (posed) seatedPose(figure, undefined, motion);
				posed = false;
				return;
			}
			pat.lean = lean;
			pat.lift = lift;
			pat.side = side;
			seatedPose(figure, pat, motion);
			posed = true;
		},
	};
}
