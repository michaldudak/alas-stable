import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, changeGait, requestJump, step } from '../src/physics.ts';

test('a single key press selects a persistent gait, clamped to safe limits', () => {
	const s = createState();
	changeGait(s, 1);
	for (let i = 0; i < 120; i++) step(s, 1 / 60, 0);
	assert.equal(s.gait, 1);
	assert.ok(s.z < 21);
	changeGait(s, 20);
	assert.equal(s.gait, 3);
	changeGait(s, -20);
	assert.equal(s.gait, 0);
});
test('early and late jumps both clear a rail, while a missed jump knocks it down', () => {
	for (const advance of [0.04, 0.35, 0.85, 1.3]) {
		const s = createState();
		s.gait = 2;
		s.speed = 5.5;
		s.z = 0.02;
		requestJump(s);
		s.jump = advance;
		const obstacle = { x: 0, z: 0, width: 8, down: 0 };
		step(s, 0.016, 0, [obstacle]);
		assert.equal(obstacle.down, 0);
	}
	const s = createState();
	s.gait = 2;
	s.speed = 5.5;
	s.z = 0.02;
	const obstacle = { x: 0, z: 0, width: 8, down: 0 };
	assert.equal(step(s, 0.016, 0, [obstacle]), true);
	assert.equal(obstacle.down, 5);
	for (let i = 0; i < 320; i++) step(s, 0.016, 0, [obstacle]);
	assert.equal(obstacle.down, 0);
});
test('jump finishes on the ground and cannot be held to fly', () => {
	const s = createState();
	requestJump(s);
	for (let i = 0; i < 100; i++) step(s, 0.016, 0);
	assert.equal(s.jump, -1);
	assert.equal(s.height, 0);
});
test('solid collisions and world boundary stop gently', () => {
	const s = createState();
	s.gait = 3;
	s.speed = 9;
	step(s, 0.04, 0, [], [{ x: 0, z: 23, w: 2, d: 1 }]);
	assert.equal(s.z, 24);
	assert.equal(s.gait, 0);
	s.x = 113;
	step(s, 0.016, 0);
	assert.ok(Math.hypot(s.x, s.z) <= 112.00001);
});

test('jumping clears enclosure fences on either axis and in both directions', () => {
	for (const axis of ['x', 'z'] as const)
		for (const direction of [-1, 1]) {
			for (const advance of [0.02, 0.3, 0.8]) {
				const s = createState();
				s.x = 0;
				s.z = 0;
				s[axis] = -direction * 0.95;
				s.heading =
					axis === 'x'
						? (direction * Math.PI) / 2
						: direction > 0
							? 0
							: Math.PI;
				s.gait = 2;
				s.speed = 5.5;
				requestJump(s);
				s.jump = advance;
				const fence = {
					x: 0,
					z: 0,
					w: axis === 'x' ? 0.2 : 34,
					d: axis === 'z' ? 0.2 : 60,
					jumpable: true,
				};
				for (let i = 0; i < 25; i++) step(s, 0.016, 0, [], [fence]);
				assert.ok(
					s[axis] * direction > 0.8,
					`${axis}, direction ${direction}, jump age ${advance}`,
				);
				assert.equal(s.gait, 2);
			}
		}
});

test('fences still stop a grounded horse and buildings still stop a jumping horse', () => {
	for (const jumping of [false, true]) {
		const s = createState();
		s.z = 0.95;
		s.gait = 2;
		s.speed = 5.5;
		if (jumping) requestJump(s);
		const solid = { x: 0, z: 0, w: 10, d: 0.2, jumpable: !jumping };
		for (let i = 0; i < 30; i++) step(s, 0.016, 0, [], [solid]);
		assert.ok(s.z >= 0.8);
		assert.equal(s.gait, 0);
	}
});
