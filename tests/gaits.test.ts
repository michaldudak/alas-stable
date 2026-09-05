import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleGait, createGaitController } from '../src/game/gaits.ts';
import { createHorse } from '../src/horse/model.ts';
import { createHorseAnimation } from '../src/horse/animation.ts';

function strikes(gait: number) {
	const events = [];
	let previous = sampleGait(gait, -0.0001).feet.map((f) => f.contact);
	for (let i = 0; i < 1000; i++) {
		const feet = sampleGait(gait, i / 1000 + 0.00001).feet;
		const landed = feet.flatMap((f, j) =>
			f.contact && !previous[j] ? [j] : [],
		);
		if (landed.length) events.push(landed);
		previous = feet.map((f) => f.contact);
	}
	return events;
}
await test('walk has four successive footfalls with continuous support', () => {
	assert.deepEqual(strikes(1), [[0], [1], [2], [3]]);
	for (let p = 0; p < 1; p += 0.001)
		assert.ok(sampleGait(1, p).feet.filter((f) => f.contact).length >= 2);
});
await test('trot uses diagonal pairs and has suspension between beats', () => {
	assert.deepEqual(strikes(2), [
		[0, 3],
		[1, 2],
	]);
	assert.ok(sampleGait(2, 0.45).feet.every((f) => !f.contact));
	assert.ok(sampleGait(2, 0.95).feet.every((f) => !f.contact));
});
await test('right-lead canter has hind, diagonal, leading fore, then suspension', () => {
	assert.deepEqual(strikes(3), [[0], [1, 2], [3]]);
	assert.ok(sampleGait(3, 0.91).feet.every((f) => !f.contact));
});
await test('transition blends poses and sound is silent in jumps and at rest', () => {
	const controller = createGaitController();
	let state = { gait: 1, speed: 2.5, jump: -1 },
		pose;
	for (let i = 0; i < 180; i++) pose = controller.update(1 / 60, state);
	assert.ok(pose);
	const previous = pose;
	state = { gait: 3, speed: 9, jump: -1 };
	pose = controller.update(1 / 60, state);
	assert.ok(pose.weights[1] > 0.8 && pose.weights[3] < 0.2);
	assert.ok(Math.abs(pose.y - previous.y) < 0.03);
	assert.ok(
		Math.max(...pose.feet.map((f, i) => Math.abs(f.z - previous.feet[i].z))) <
			0.2,
	);
	for (let i = 0; i < 70; i++)
		assert.equal(
			controller.update(1 / 60, { ...state, jump: i / 60 }).footfalls,
			0,
		);
	controller.update(1 / 60, { gait: 0, speed: 0, jump: -1 });
	for (let i = 0; i < 180; i++)
		pose = controller.update(1 / 60, { gait: 0, speed: 0, jump: -1 });
	assert.equal(pose.footfalls, 0);
	assert.equal(pose.y, 0);
	assert.ok(pose.feet.every((f) => f.lift === 0 && f.z === 0));
});
await test('animated hoof centers stay above ground and joint rotations remain finite', () => {
	const horse = createHorse(),
		animation = createHorseAnimation(horse),
		position = new THREE.Vector3();
	for (const [gait, speed] of [
		[1, 2.5],
		[2, 5.5],
		[3, 9],
		[0, 0],
	]) {
		for (let i = 0; i < 300; i++) {
			animation.update(1 / 120, { gait, speed, jump: -1 }, i / 120);
			horse.root.updateMatrixWorld(true);
			for (const hoof of horse.hooves) {
				hoof.getWorldPosition(position);
				assert.ok(position.y >= 0.085, `gait ${gait}: hoof y ${position.y}`);
				assert.ok(Number.isFinite(hoof.rotation.x));
			}
		}
	}
});

await test('turning in place steps with all four feet and settles after release', () => {
	for (const direction of [-1, 1]) {
		const controller = createGaitController();
		const state = { gait: 0, speed: 0, jump: -1 };
		const maximumLift = [0, 0, 0, 0];
		let footfalls = 0;
		let lateral = 0;
		for (let i = 0; i < 300; i++) {
			const pose = controller.update(1 / 120, state, direction);
			pose.feet.forEach((foot, index) => {
				maximumLift[index] = Math.max(maximumLift[index], foot.lift);
				lateral = Math.max(lateral, Math.abs(foot.x));
			});
			assert.ok(pose.feet.filter((foot) => foot.lift < 0.001).length >= 3);
			footfalls += pose.footfalls;
		}
		assert.ok(maximumLift.every((lift) => lift > 0.15));
		assert.ok(lateral > 0.2);
		assert.ok(footfalls >= 8);
		let pose = controller.update(1 / 120, state, 0);
		for (let i = 0; i < 240; i++) pose = controller.update(1 / 120, state, 0);
		assert.equal(pose.footfalls, 0);
		assert.ok(
			pose.feet.every(
				(foot) => foot.x === 0 && foot.z === 0 && foot.lift === 0,
			),
		);
	}
});

await test('turning shuffle does not replace forward gaits or add airborne footsteps', () => {
	const straight = createGaitController(),
		turning = createGaitController();
	for (let i = 0; i < 180; i++) {
		const state = { gait: 2, speed: 5.5, jump: -1 };
		assert.deepEqual(
			turning.update(1 / 120, state, 1),
			straight.update(1 / 120, state, 0),
		);
	}
	for (let i = 0; i < 120; i++) {
		const pose = turning.update(
			1 / 120,
			{ gait: 0, speed: 0, jump: i / 120 },
			1,
		);
		assert.equal(pose.footfalls, 0);
	}
});

await test('lateral stepping keeps the rig above the floor in both turn directions', () => {
	const horse = createHorse(),
		animation = createHorseAnimation(horse),
		position = new THREE.Vector3();
	for (const direction of [-1, 1, 0])
		for (let i = 0; i < 240; i++) {
			animation.update(
				1 / 120,
				{ gait: 0, speed: 0, jump: -1 },
				i / 120,
				direction,
			);
			horse.root.updateMatrixWorld(true);
			for (const hoof of horse.hooves) {
				hoof.getWorldPosition(position);
				assert.ok(position.y >= 0.085);
				assert.ok(Number.isFinite(hoof.quaternion.w));
			}
		}
});
