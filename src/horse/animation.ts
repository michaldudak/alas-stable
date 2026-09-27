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
}

const NEUTRAL: HeadTarget = { graze: 0, yaw: 0, nod: 0, chew: false };

/** Grazing lowers mostly from the base of the neck, then tips the head down. */
const GRAZE = [1.38, 0.32, 0.42];

export function createHorseAnimation(horse: HorseModel) {
	const controller = createGaitController(),
		target = new THREE.Vector3(),
		inverse = new THREE.Quaternion();
	const rootHeights = horse.legs.map((leg) => leg.position.y);
	const head = { graze: 0, yaw: 0, nod: 0, chew: 0 };
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
			// Horses nod in rhythm with the walk.
			const nod =
				head.nod +
				pose.weights[1] * 0.05 * Math.sin(pose.phase * Math.PI * 4) +
				head.chew * 0.035 * Math.sin(elapsed * 9);
			horse.neck.forEach((bone, i) => {
				bone.rotation.x = head.graze * GRAZE[i] + nod * (i === 0 ? 0.3 : 0.35);
				bone.rotation.y = head.yaw * (i === 2 ? 0.3 : 0.35);
			});
			horse.body.position.y = pose.y;
			horse.body.rotation.set(pose.pitch, 0, pose.roll);
			inverse.copy(horse.body.quaternion).invert();
			horse.legs.forEach((leg, i) => {
				const rig = horse.legRigs[i],
					foot = pose.feet[i],
					front = i % 2 === 1;
				leg.position.y = rootHeights[i];
				target.set(
					rig.foot[0] + foot.x,
					HOOF_MARKER_HEIGHT + foot.lift,
					rig.foot[1] + foot.z,
				);
				target
					.sub(horse.body.position)
					.applyQuaternion(inverse)
					.sub(leg.position);
				const lift = THREE.MathUtils.clamp(foot.lift / 0.22, 0, 1);
				const raised = lift * lift * (3 - 2 * lift);
				// Planted pasterns keep their slope to the ground; the heel breaks over
				// at the end of a long stride and lifted hooves fold back.
				const breakOver = THREE.MathUtils.smoothstep(-foot.z, 0.35, 0.8) * 0.6;
				const pastern =
					Math.max(breakOver, raised * (front ? 1.15 : 0.85)) - pose.pitch;
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
			horse.tail.rotation.z = Math.sin(elapsed * 2) * 0.07;
			horse.tail.rotation.x =
				-0.06 * pose.weights[3] + 0.025 * Math.sin(pose.phase * Math.PI * 2);
			return pose.footfalls;
		},
	};
}
