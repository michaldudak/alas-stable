import type { HorseModel } from './types.ts';
import type { MotionState } from '../game/types.ts';
import * as THREE from 'three';
import { createGaitController, solveLeg } from '../game/gaits.ts';
export function createHorseAnimation(horse: HorseModel) {
	const controller = createGaitController(),
		target = new THREE.Vector3(),
		inverse = new THREE.Quaternion();
	return {
		update(dt: number, state: MotionState, elapsed: number) {
			const pose = controller.update(dt, state);
			horse.body.position.y = pose.y;
			horse.body.rotation.set(pose.pitch, 0, pose.roll);
			inverse.copy(horse.body.quaternion).invert();
			horse.legs.forEach((leg, i) => {
				const front = i % 2 === 1;
				const restZ = (front ? -0.01 : 0.13) + 0.035;
				target.set(
					leg.position.x,
					0.12 + pose.feet[i].lift,
					leg.position.z + restZ + pose.feet[i].z,
				);
				target
					.sub(horse.body.position)
					.applyQuaternion(inverse)
					.sub(leg.position);
				const angles = solveLeg(target.y, target.z, front);
				leg.rotation.x = angles.hip;
				horse.knees[i].rotation.x = angles.knee;
				horse.hooves[i].rotation.x = -pose.pitch - angles.hip - angles.knee;
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
