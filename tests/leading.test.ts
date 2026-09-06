import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/game/physics.ts';
import {
	stepLedHorse,
	leadPathClear,
	LEAD_LENGTH,
} from '../src/game/leading.ts';
import { STABLE, stableSolids } from '../src/world/stable-layout.ts';
await test('a led horse follows a walking or running person and stops at a comfortable distance', () => {
	for (const speed of [1.8, 3.8]) {
		const horse = { ...createState(), x: 0, z: 0, heading: 0 },
			person = { ...createState(), x: 1.65, z: 0, heading: 0 };
		for (let i = 0; i < 600; i++) {
			person.z += speed / 60;
			stepLedHorse(horse, person, 1 / 60, []);
			assert.ok(
				Math.hypot(horse.x - person.x, horse.z - person.z) < LEAD_LENGTH,
			);
		}
		assert.ok(horse.z > 10);
		for (let i = 0; i < 240; i++) stepLedHorse(horse, person, 1 / 60, []);
		assert.ok(horse.speed < 0.01);
		assert.ok(Math.hypot(horse.x - person.x, horse.z - person.z) > 2.3);
	}
});
await test('a led horse stops at obstacles and the rope cannot cross a wall', () => {
	const horse = { ...createState(), x: 0, z: 0, heading: 0 },
		person = { ...createState(), x: 0, z: 6 };
	const wall = [{ x: 0, z: 3, w: 10, d: 0.2 }];
	assert.equal(leadPathClear(horse, person, wall), false);
	for (let i = 0; i < 600; i++) stepLedHorse(horse, person, 1 / 60, wall);
	assert.ok(horse.z < 2.21);
	assert.equal(horse.speed, 0);
	assert.equal(leadPathClear(horse, person, []), true);
});
await test('each resident can follow a handler through its open stall doorway', () => {
	for (const side of [-1, 1])
		for (const z of [-9, -1]) {
			const horse = {
				...createState(),
				x: STABLE.x + side * 6.5,
				z: STABLE.z + z,
				heading: (-side * Math.PI) / 2,
			};
			const person = { ...createState(), x: STABLE.x - side * 1, z: horse.z };
			assert.equal(leadPathClear(horse, person, stableSolids()), true);
			for (let i = 0; i < 360; i++)
				stepLedHorse(horse, person, 1 / 60, stableSolids());
			assert.ok(Math.abs(horse.x - STABLE.x) < 3.7);
		}
});
