import type { HorseModel } from './types.ts';
import type { MotionState } from '../game/types.ts';
import * as THREE from 'three';
import { createGaitController, solveLeg } from '../game/gaits.ts';

/** Height of a planted hoof marker above the ground. */
export const HOOF_MARKER_HEIGHT = 0.12;

/** Where the horse wants its head: grazing, looking aside, eating from a hand. */
export interface HeadTarget {
	/** 0 head up, 1 muzzle in the grass. */
	graze: number;
	/** Turn of the head to the horse's left (positive) or right, in radians. */
	yaw: number;
	/** Extra nod down (positive) or lift (negative) of the head, in radians. */
	nod: number;
	/** Chewing makes the head bob gently. */
	chew: boolean;
	/** Standing, a hind leg rests on the toe: +1 left, -1 right, 0 neither. */
	rest?: number;
}

const NEUTRAL: HeadTarget = { graze: 0, yaw: 0, nod: 0, chew: false };

/** Grazing lowers mostly from the base of the neck, then tips the head down. */
const GRAZE = [1.38, 0.32, 0.42];

export function createHorseAnimation(horse: HorseModel) {
	const controller = createGaitController(),
		target = new THREE.Vector3(),
		inverse = new THREE.Quaternion(),
		croupInverse = new THREE.Quaternion();
	const rootHeights = horse.legs.map((leg) => leg.position.y);
	const croupPivot = horse.croup.position.clone();
	const head = { graze: 0, yaw: 0, nod: 0, chew: 0 };
	let rest = 0;
	// Each horse breathes and fidgets on its own rhythm.
	const seed = Math.random() * 100;
	for (const bone of horse.neck) bone.rotation.order = 'YXZ';
	return {
		update(
			dt: number,
			state: MotionState,
			elapsed: number,
			turn = 0,
			paceScale = 1,
			headTarget: HeadTarget = NEUTRAL,
		) {
			const pose = controller.update(dt, state, turn, paceScale);
			// The head eases towards its target: slowly down to graze, quicker to look.
			const ease = (rate: number) => 1 - Math.exp(-dt * rate);
			head.graze +=
				(headTarget.graze - head.graze) *
				ease(headTarget.graze > head.graze ? 1.4 : 2.4);
			head.yaw += (headTarget.yaw - head.yaw) * ease(2.5);
			head.nod += (headTarget.nod - head.nod) * ease(3);
			head.chew += (Number(headTarget.chew) - head.chew) * ease(4);
			// Standing still, the horse breathes, looks about and may rest a hind leg.
			const still =
				pose.weights[0] *
				(1 - Math.min(1, Math.abs(turn) * 2)) *
				(state.jump < 0 ? 1 : 0);
			rest += ((headTarget.rest ?? 0) * still - rest) * ease(1.1);
			const breath = Math.sin(elapsed * 1.25 + seed);
			// The neck swings with the stride and bends into turns; the head keeps
			// its angle to the ground while the neck lifts and lowers it.
			const swing = pose.neck;
			const nod =
				head.nod +
				head.chew * 0.035 * Math.sin(elapsed * 9) +
				still * 0.03 * Math.sin(elapsed * 0.41 + seed * 1.3);
			const yaw =
				head.yaw +
				Math.max(-1, Math.min(1, turn)) * 0.22 +
				still * 0.07 * Math.sin(elapsed * 0.29 + seed);
			horse.neck.forEach((bone, i) => {
				bone.rotation.x =
					head.graze * GRAZE[i] +
					nod * (i === 0 ? 0.3 : 0.35) +
					swing * [0.62, 0.38, -0.35][i];
				bone.rotation.y = yaw * (i === 2 ? 0.3 : 0.35);
			});
			horse.body.position.set(pose.sway, pose.y + still * 0.004 * breath, 0);
			horse.body.rotation.set(pose.pitch, 0, pose.roll);
			// A resting hind leg lets that hip drop.
			horse.croup.rotation.set(
				pose.croupPitch,
				0,
				pose.croupRoll - rest * 0.05,
			);
			inverse.copy(horse.body.quaternion).invert();
			croupInverse.copy(horse.croup.quaternion).invert();
			const restLeg = rest > 0 ? 0 : 2,
				resting = Math.abs(rest);
			horse.legs.forEach((leg, i) => {
				const rig = horse.legRigs[i],
					foot = pose.feet[i],
					front = i % 2 === 1,
					hind = leg.parent === horse.croup;
				const tipped = i === restLeg ? resting : 0;
				leg.position.y = rootHeights[i];
				target.set(
					rig.foot[0] + foot.x,
					HOOF_MARKER_HEIGHT + foot.lift + 0.04 * tipped,
					rig.foot[1] + foot.z + 0.12 * tipped,
				);
				target.sub(horse.body.position).applyQuaternion(inverse);
				// Hind legs hang from the croup, which rolls and tilts at the loins.
				if (hind) target.sub(croupPivot).applyQuaternion(croupInverse);
				target.sub(leg.position);
				const lift = THREE.MathUtils.clamp(foot.lift / 0.22, 0, 1);
				const raised = lift * lift * (3 - 2 * lift);
				// Planted pasterns keep their slope to the ground; the heel breaks over
				// at the end of a long stride, lifted hooves fold back and a resting
				// hind hoof tips onto its toe.
				const breakOver = THREE.MathUtils.smoothstep(-foot.z, 0.35, 0.8) * 0.6;
				const pastern =
					Math.max(breakOver, raised * (front ? 1.15 : 0.85)) +
					0.9 * tipped -
					pose.pitch -
					(hind ? horse.croup.rotation.x : 0);
				const cos = Math.cos(pastern),
					sin = Math.sin(pastern);
				const [py, pz] = rig.pastern;
				let fetlockY = -Math.hypot(target.x, target.y) - (py * cos - pz * sin);
				const fetlockZ = target.z - (py * sin + pz * cos);
				// The shoulder and hip slide so a supporting leg stays nearly straight
				// instead of crouching, and drop a little to reach far strides.
				const vertical = Math.sqrt(Math.max(0, rig.reach ** 2 - fetlockZ ** 2));
				const slide = THREE.MathUtils.clamp(
					vertical + fetlockY,
					-0.15,
					front ? 0.32 * (1 - raised) : 0,
				);
				leg.position.y += slide;
				fetlockY -= slide;
				const angles = solveLeg(fetlockY, fetlockZ, rig.segments);
				leg.rotation.order = 'ZXY';
				leg.rotation.z = Math.atan2(target.x, -target.y);
				leg.rotation.x = angles.hip;
				horse.knees[i].rotation.x = angles.knee;
				horse.fetlocks[i].rotation.x = pastern - angles.hip - angles.knee;
			});
			// Lean around the seat instead of the horse's ground-level origin.
			horse.rider.rotation.x = pose.riderPitch;
			horse.rider.position.set(
				0,
				2.7 * (1 - Math.cos(pose.riderPitch)) + pose.riderY,
				-2.7 * Math.sin(pose.riderPitch),
			);
			// Standing horses swish at flies in bursts; moving, the tail swings with
			// the hind legs and lifts at the trot and canter.
			const swish =
				Math.sin(elapsed * 2.1 + seed) *
				(0.04 + 0.06 * Math.max(0, Math.sin(elapsed * 0.37 + seed * 2)));
			horse.tail.rotation.z = swish * (0.4 + 0.6 * still) + pose.tailSwing;
			horse.tail.rotation.x =
				pose.tailLift + 0.02 * Math.sin(pose.phase * Math.PI * 2);
			return pose.footfalls;
		},
	};
}
