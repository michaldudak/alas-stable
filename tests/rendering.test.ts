import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeScene } from '../src/rendering/resources.ts';
import { createCameraController } from '../src/rendering/camera.ts';
import { createState } from '../src/game/physics.ts';
import { createSun } from '../src/world/sun.ts';
import { WORLD_RADIUS } from '../src/game/tuning.ts';

await test('scene teardown releases shared geometry, materials and textures only once', () => {
	const scene = new THREE.Scene();
	const geometry = new THREE.BoxGeometry();
	const texture = new THREE.Texture();
	const material = new THREE.MeshStandardMaterial({ map: texture });
	const counts = { geometry: 0, material: 0, texture: 0 };
	geometry.addEventListener('dispose', () => counts.geometry++);
	material.addEventListener('dispose', () => counts.material++);
	texture.addEventListener('dispose', () => counts.texture++);
	scene.add(
		new THREE.Mesh(geometry, material),
		new THREE.Mesh(geometry, material),
	);
	disposeScene(scene);
	disposeScene(scene);
	assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
	assert.equal(scene.children.length, 0);
});

await test('third-person camera stays in front of a wall while first-person ignores it', () => {
	const camera = new THREE.PerspectiveCamera();
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(20, 10, 0.4),
		new THREE.MeshBasicMaterial(),
	);
	wall.position.set(0, 3, 28);
	wall.updateMatrixWorld(true);
	const controller = createCameraController(camera, [wall]);
	const state = createState();
	controller.update(state, 1, false, 0, true);
	assert.ok(camera.position.z < 27.8 && camera.position.z > state.z);
	controller.update(state, 1, true, 0, true);
	assert.ok(Math.abs(camera.position.z - 24.3) < 1e-6);
	wall.geometry.dispose();
	wall.material.dispose();
});

await test('sun shadows cover actors, tree crowns and ground at every map edge', () => {
	const sun = createSun();
	sun.updateMatrixWorld(true);
	sun.target.updateMatrixWorld(true);
	sun.shadow.updateMatrices(sun);
	const frustum = sun.shadow.getFrustum();
	for (let degrees = 0; degrees < 360; degrees += 5) {
		const angle = THREE.MathUtils.degToRad(degrees);
		for (const radius of [0, WORLD_RADIUS / 2, WORLD_RADIUS + 3]) {
			for (const height of [0, 4, 12]) {
				const caster = new THREE.Vector3(
					Math.cos(angle) * radius,
					height,
					Math.sin(angle) * radius,
				);
				const groundShadow = caster
					.clone()
					.addScaledVector(sun.position, -height / sun.position.y);
				assert.ok(
					frustum.containsPoint(caster),
					`Caster clipped at ${caster.toArray().join(', ')}`,
				);
				assert.ok(
					frustum.containsPoint(groundShadow),
					`Shadow clipped at ${groundShadow.toArray().join(', ')}`,
				);
			}
		}
	}
	// Expanding coverage must retain at least the original shadow texel density.
	assert.ok(
		(sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x <=
			140 / 2048,
	);
	sun.shadow.dispose();
});
