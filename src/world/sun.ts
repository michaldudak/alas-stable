import * as THREE from 'three';

/** Late-morning sun, shared by the shadow light, the sky and the clouds. */
export const SUN_DIRECTION = new THREE.Vector3(-35, 65, 25).normalize();

/** Half the edge of the square the shadow map covers around the player. */
export const SHADOW_EXTENT = 80;
const SHADOW_MAP = 4096;
const DISTANCE = 220;

/**
 * The key light. Its shadow camera follows a focus point near the player, so a
 * large map keeps crisp shadows; the focus snaps to whole shadow texels in the
 * light's frame to stop shadow edges from shimmering as the player moves.
 */
export function createSun() {
	const sun = new THREE.DirectionalLight('#fff1dd', 3.1);
	sun.castShadow = true;
	sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
	Object.assign(sun.shadow.camera, {
		left: -SHADOW_EXTENT,
		right: SHADOW_EXTENT,
		top: SHADOW_EXTENT,
		bottom: -SHADOW_EXTENT,
		near: 1,
		far: DISTANCE * 2,
	});
	sun.shadow.camera.updateProjectionMatrix();
	sun.shadow.bias = -0.0003;
	sun.shadow.normalBias = 0.03;
	const direction = SUN_DIRECTION.clone(),
		rotation = new THREE.Matrix4(),
		inverse = new THREE.Matrix4(),
		snapped = new THREE.Vector3(),
		origin = new THREE.Vector3();
	const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
	function follow(focus: THREE.Vector3, towardsSun: THREE.Vector3 = direction) {
		direction.copy(towardsSun);
		rotation.lookAt(direction, origin, THREE.Object3D.DEFAULT_UP);
		inverse.copy(rotation).transpose();
		snapped.copy(focus).applyMatrix4(inverse);
		snapped.x = Math.round(snapped.x / texel) * texel;
		snapped.y = Math.round(snapped.y / texel) * texel;
		snapped.applyMatrix4(rotation);
		sun.target.position.copy(snapped);
		sun.position.copy(snapped).addScaledVector(direction, DISTANCE);
		sun.target.updateMatrixWorld();
		sun.updateMatrixWorld();
	}
	follow(new THREE.Vector3());
	return Object.assign(sun, { follow });
}
