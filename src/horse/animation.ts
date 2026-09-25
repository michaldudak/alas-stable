import type { HorseModel } from './types.ts';
import type { MotionState } from '../game/types.ts';
import * as THREE from 'three';
import { createGaitController, solveLeg } from '../game/gaits.ts';

/** Height of a planted hoof marker above the ground. */
export const HOOF_MARKER_HEIGHT = 0.12;

export function createHorseAnimation(horse: HorseModel) {
	const controller = createGaitController(),
		target = new THREE.Vector3(),
		inverse = new THREE.Quaternion();
	const rootHeights = horse.legs.map((leg) => leg.position.y);
	return {
		update(
			dt: number,
			state: MotionState,
			elapsed: number,
			turn = 0,
			paceScale = 1,
		) {
			const pose = controller.update(dt, state, turn, paceScale);
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
