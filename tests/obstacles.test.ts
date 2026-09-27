import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, requestJump, step } from '../src/game/physics.ts';
import {
	carriedPose,
	grabbable,
	holdPose,
	obstacleClear,
	wingSolids,
} from '../src/game/obstacles.ts';

await test('a turned jump knocks down when run through and clears when jumped', () => {
	for (const jumping of [false, true]) {
		const obstacle = { x: 0, z: 0, width: 8, angle: Math.PI / 2, down: 0 };
		// Rails along Z: the horse crosses them riding along X.
		const horse = {
			...createState(),
			x: -6,
			z: 1,
			heading: Math.PI / 2,
			gait: 2,
			speed: 5.5,
		};
		let hit = false;
		for (let i = 0; i < 240; i++) {
			if (jumping && horse.x > -2.2 && horse.jump < 0 && !hit)
				requestJump(horse);
			hit = step(horse, 1 / 120, 0, [obstacle]) || hit;
		}
		assert.ok(horse.x > 1);
		assert.equal(hit, !jumping);
		assert.equal(obstacle.down > 0, !jumping);
	}
});

await test('the rider takes hold of a nearby jump by the middle and carries it along', () => {
	const obstacle = { x: 0, z: 0, width: 8, angle: 0, down: 0 };
	assert.equal(grabbable([obstacle], { x: 7, z: 0 }), undefined);
	assert.equal(grabbable([obstacle], { x: 3, z: 1.5 }), obstacle);
	const hold = holdPose(obstacle, { x: 3, z: 1.5 });
	assert.ok(Math.abs(hold.x) < 1e-9 && Math.abs(hold.z - 0.75) < 1e-9);
	assert.ok(Math.abs(Math.cos(hold.heading) + 1) < 1e-9);
	// Pulling backwards and turning a quarter keeps the jump in front of the rider.
	const rider = { x: 2, z: 5, heading: hold.heading + Math.PI / 2 };
	const pose = carriedPose(rider, hold.turn);
	assert.ok(
		Math.abs(Math.hypot(pose.x - rider.x, pose.z - rider.z) - 0.75) < 1e-9,
	);
	assert.ok(Math.abs(Math.cos(pose.angle)) < 1e-9);
});

await test('a carried jump cannot be pushed into trees or walls', () => {
	const obstacle = { x: 0, z: 0, width: 8, angle: 0, down: 0 };
	const wings = wingSolids(obstacle);
	assert.deepEqual(
		wings.map((w) => Math.round(w.x * 10) / 10),
		[-4.2, 4.2],
	);
	assert.equal(obstacleClear(obstacle, [], 190), true);
	assert.equal(
		obstacleClear(obstacle, [{ x: 4.3, z: 0, w: 0.65, d: 0.65 }], 190),
		false,
	);
	assert.equal(
		obstacleClear(obstacle, [{ x: 1, z: 0.1, w: 0.4, d: 0.4 }], 190),
		false,
	);
	assert.equal(obstacleClear({ ...obstacle, x: 186 }, [], 190), false);
});
