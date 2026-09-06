import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGaitController } from '../src/game/gaits.ts';
import { createState, step } from '../src/game/physics.ts';
import { stepPerson } from '../src/game/riding.ts';
import { createCameraController } from '../src/rendering/camera.ts';

await test('momentary movement is proportional, stops on release, and preserves the selected gait', () => {
	for (const onFoot of [false, true]) {
		const state = createState();
		const horse = { ...createState(), x: 10 };
		const advance = (nudge?: number) =>
			onFoot
				? stepPerson(state, 0.04, 0, [], horse, nudge)
				: step(state, 0.04, 0, [], [], nudge);
		advance(0.5);
		assert.equal(state.speed, 0.6);
		assert.equal(state.gait, 0);
		const forward = state.z;
		advance(0);
		assert.equal(state.z, forward);
		assert.equal(state.speed, 0);
		advance(-1);
		assert.equal(state.speed, -0.9);
		assert.ok(state.z > forward);
		state.gait = 2;
		advance(1);
		assert.equal(state.gait, 2);
		advance();
		assert.ok(state.speed > 1.2);
	}
});

await test('momentary movement still stops at walls for horse and rider', () => {
	for (const onFoot of [false, true]) {
		const state = createState();
		const wall = [{ x: 0, z: 23, w: 5, d: 0.2 }];
		for (let i = 0; i < 100; i++) {
			if (onFoot)
				stepPerson(state, 0.04, 0, wall, { ...createState(), x: 10 }, 1);
			else step(state, 0.04, 0, [], wall, 1);
		}
		assert.ok(state.z > 23.3);
		assert.equal(state.speed, 0);
	}
});

await test('camera zoom is bounded, retained, ignored by first person and constrained by walls', () => {
	const camera = new THREE.PerspectiveCamera();
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(20, 20, 0.2),
		new THREE.MeshBasicMaterial(),
	);
	wall.position.set(0, 4, 28);
	wall.updateMatrixWorld(true);
	const controller = createCameraController(camera, [wall]);
	const state = createState();
	controller.adjustDistance(-1, 10);
	assert.equal(controller.distanceScale, 0.45);
	controller.update(state, 0.04, false, 0, true);
	const near = camera.position.clone();
	controller.adjustDistance(1, 10);
	assert.equal(controller.distanceScale, 1.8);
	controller.adjustDistance(0, 1);
	assert.equal(controller.distanceScale, 1.8);
	controller.update(state, 0.04, false, 0, true);
	assert.ok(camera.position.z < 27.9, 'Wall avoidance applies after zoom');
	assert.ok(camera.position.distanceTo(near) > 0.1);
	controller.update(state, 0.04, true, 0, true);
	const firstPerson = camera.position.clone();
	controller.adjustDistance(-1, 10);
	controller.update(state, 0.04, true, 0, true);
	assert.ok(camera.position.distanceTo(firstPerson) < 1e-10);
	wall.geometry.dispose();
	wall.material.dispose();
});

await test('stick input adjusts every selected gait without replacing it', () => {
	for (const onFoot of [false, true])
		for (const gait of onFoot ? [-1, 1, 2] : [-1, 1, 2, 3]) {
			const state = { ...createState(), gait };
			const horse = { ...createState(), x: 50 };
			const advance = (axis?: number) => {
				state.x = 0;
				state.z = 24;
				if (onFoot) stepPerson(state, 0.04, 0, [], horse, axis);
				else step(state, 0.04, 0, [], [], axis);
			};
			for (let i = 0; i < 100; i++) advance();
			const normal = state.speed;
			for (let i = 0; i < 100; i++) advance(1);
			assert.ok(Math.abs(state.speed / normal - 1.3) < 0.001);
			assert.equal(state.gait, gait);
			for (let i = 0; i < 100; i++) advance(-1);
			assert.ok(Math.abs(state.speed / normal - 0.7) < 0.001);
			assert.equal(state.gait, gait);
			for (let i = 0; i < 100; i++) advance();
			assert.ok(Math.abs(state.speed - normal) < 0.001);
		}
});

await test('pace adjustment changes hoofbeat cadence without switching gait', () => {
	const contacts = (scale: number) => {
		const controller = createGaitController();
		let count = 0;
		for (let i = 0; i < 600; i++)
			count += controller.update(
				1 / 60,
				{ gait: 2, speed: 5.5, jump: -1 },
				0,
				scale,
			).footfalls;
		return count;
	};
	assert.ok(contacts(1.3) > contacts(1));
	assert.ok(contacts(0.7) < contacts(1));
});
