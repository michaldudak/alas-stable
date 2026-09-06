import * as THREE from 'three';
import type { GameState } from '../game/types.ts';
import { insideStable } from '../world/stable-layout.ts';

/** Reuses scratch vectors every frame; raycasts pull TPP in front of nearby walls. */
export function createCameraController(
	camera: THREE.PerspectiveCamera,
	blockers: THREE.Object3D[],
) {
	let distanceScale = 1;
	const desiredCamera = new THREE.Vector3(),
		target = new THREE.Vector3();
	const cameraRay = new THREE.Raycaster(),
		cameraDirection = new THREE.Vector3();
	function update(
		state: Readonly<GameState>,
		dt: number,
		firstPerson: boolean,
		look: number,
		snap = false,
		onFoot = false,
		leading = false,
	) {
		const heading = state.heading + look;
		const indoors = insideStable(state.x, state.z, 1.5);
		if (firstPerson) {
			desiredCamera.set(
				state.x - Math.sin(state.heading) * 0.3,
				(onFoot ? 2.15 : 4.1) + state.height,
				state.z - Math.cos(state.heading) * 0.3,
			);
			target.set(
				desiredCamera.x + Math.sin(heading) * 15,
				desiredCamera.y - (indoors ? 2.2 : 0.35),
				desiredCamera.z + Math.cos(heading) * 15,
			);
		} else {
			const distance = onFoot ? (leading ? 8.5 : 4.5) : indoors ? 7.2 : 9;
			desiredCamera.set(
				state.x - Math.sin(heading) * distance,
				(onFoot ? (leading ? 4.7 : 3.1) : indoors ? 5.15 : 5.7) +
					state.height * 0.55,
				state.z - Math.cos(heading) * distance,
			);
			if (onFoot && leading) {
				desiredCamera.x += Math.cos(heading) * 5;
				desiredCamera.z -= Math.sin(heading) * 5;
			}
			const ahead = onFoot ? (leading ? -1.5 : 0.5) : indoors ? 0 : 2.5;
			target.set(
				state.x + Math.sin(state.heading) * ahead,
				(onFoot ? 1.3 : indoors ? 2.2 : 1.7) + state.height * 0.65,
				state.z + Math.cos(state.heading) * ahead,
			);
		}
		if (!firstPerson)
			desiredCamera.sub(target).multiplyScalar(distanceScale).add(target);
		camera.position.lerp(desiredCamera, snap ? 1 : 1 - Math.exp(-dt * 7));
		if (!firstPerson) {
			cameraDirection.copy(camera.position).sub(target);
			const cameraDistance = cameraDirection.length();
			cameraRay.set(target, cameraDirection.normalize());
			cameraRay.far = cameraDistance;
			const hit = cameraRay.intersectObjects(blockers, false)[0];
			if (hit)
				camera.position
					.copy(target)
					.addScaledVector(
						cameraRay.ray.direction,
						Math.max(0.25, hit.distance - 0.25),
					);
		}
		camera.lookAt(target);
	}

	return {
		update,
		get distanceScale() {
			return distanceScale;
		},
		adjustDistance(axis: number, dt: number) {
			distanceScale = THREE.MathUtils.clamp(
				distanceScale + axis * dt * 0.65,
				0.45,
				1.8,
			);
		},
	};
}
