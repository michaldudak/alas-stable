import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeScene } from '../src/rendering/resources.ts';
import { createCameraController } from '../src/rendering/camera.ts';
import { createState } from '../src/game/physics.ts';

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
