import * as THREE from 'three';
import { WORLD_RADIUS } from '../game/tuning.ts';

/** Late-morning sun, shared by the shadow light, the sky and the clouds. */
export const SUN_DIRECTION = new THREE.Vector3(-35, 65, 25).normalize();

export function createSun() {
	const sun = new THREE.DirectionalLight('#fff1dd', 3.1);
	// Include edge tree crowns and their ground shadows beyond the playable area.
	const extent = WORLD_RADIUS + 16;
	sun.position.copy(SUN_DIRECTION).multiplyScalar(extent * 2);
	sun.castShadow = true;
	sun.shadow.mapSize.set(4096, 4096);
	Object.assign(sun.shadow.camera, {
		left: -extent,
		right: extent,
		top: extent,
		bottom: -extent,
		near: extent,
		far: extent * 3,
	});
	sun.shadow.camera.updateProjectionMatrix();
	sun.shadow.bias = -0.0003;
	sun.shadow.normalBias = 0.035;
	return sun;
}
