import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/game/physics.ts';
import {
	ATTEND_DISTANCE,
	FOLLOW_TIME,
	TREAT_TIME,
	feed,
	createWander,
	settle,
	stepWander,
} from '../src/game/wander.ts';
import {
	STABLE,
	bayCenter,
	stableSolids,
	stallAt,
} from '../src/world/stable-layout.ts';
import { neckWeights } from '../src/horse/neck.ts';
import { loadTestHorseAsset } from './support/horse-asset.ts';

function seeded(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

await test('a stabled horse strolls and grazes but never leaves its stall', () => {
	const random = seeded(3);
	const z = STABLE.z + bayCenter(STABLE, 1);
	const horse = {
		...createState(),
		x: STABLE.x - 6.5,
		z,
		heading: Math.PI / 2,
	};
	const stall = stallAt(horse.x, horse.z)!;
	const wander = createWander(horse, { enclosure: stall, range: 3 }, random);
	const modes = new Set<string>();
	let moved = 0;
	for (let i = 0; i < 60 * 240; i++) {
		const before = { x: horse.x, z: horse.z };
		stepWander(horse, wander, 1 / 60, stableSolids(), undefined, random);
		moved += Math.hypot(horse.x - before.x, horse.z - before.z);
		modes.add(wander.mode);
		assert.ok(Math.abs(horse.x - stall.x) < stall.halfWidth);
		assert.ok(Math.abs(horse.z - stall.z) < stall.halfDepth);
	}
	assert.ok(moved > 3, `moved ${moved} m`);
	assert.ok(modes.has('graze') && modes.has('walk') && modes.has('idle'));
});

await test('a waiting horse stays near where it was left and stops for a person', () => {
	const random = seeded(11);
	const horse = { ...createState(), x: 40, z: 10, heading: 0 };
	const wander = createWander(horse, { range: 5 }, random);
	for (let i = 0; i < 60 * 180; i++) {
		stepWander(horse, wander, 1 / 60, [], undefined, random);
		assert.ok(Math.hypot(horse.x - 40, horse.z - 10) < 7.5);
	}
	const person = { x: horse.x + 2, z: horse.z + 1 };
	let look = 0;
	for (let i = 0; i < 60; i++)
		look = stepWander(horse, wander, 1 / 60, [], person, random).look;
	assert.equal(wander.mode, 'attend');
	assert.ok(horse.speed < 0.3);
	assert.ok(Math.abs(look) > 0);
	assert.ok(
		Math.hypot(person.x - horse.x, person.z - horse.z) < ATTEND_DISTANCE,
	);
	settle(wander, horse, { range: 2, grassy: false });
	assert.deepEqual(wander.anchor, { x: horse.x, z: horse.z });
	assert.equal(horse.gait, 0);
});

await test('wandering horses stop at solids instead of walking through them', () => {
	const random = seeded(5);
	const horse = { ...createState(), x: 0, z: 0, heading: 0 };
	const wall = [{ x: 0, z: 1.2, w: 20, d: 0.3 }];
	const wander = createWander(horse, { range: 6 }, random);
	for (let i = 0; i < 60 * 120; i++)
		stepWander(horse, wander, 1 / 60, wall, undefined, random);
	assert.ok(horse.z < 1.2 - 0.15);
});

await test('neck weights keep the body still and move the head with the last bone', async () => {
	await loadTestHorseAsset();
	assert.deepEqual(neckWeights(2.2, -0.5), [1, 0, 0, 0]);
	assert.deepEqual(neckWeights(2.8, 2.1), [0, 0, 0, 1]);
	for (const [y, z] of [
		[2.7, 0.6],
		[3.0, 1.0],
		[2.2, 1.2],
		[3.4, 1.4],
	]) {
		const shares = neckWeights(y, z);
		assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9);
	}
});

await test('a horse given a treat munches, then follows its friend for a while', () => {
	const random = seeded(9);
	const horse = { ...createState(), x: 0, z: 0, heading: 0 };
	const wander = createWander(horse, { range: 5 }, random);
	const person = { x: 0, z: 2.6 };
	feed(wander);
	let chewing = 0;
	for (let i = 0; i < 60 * TREAT_TIME + 5; i++) {
		const motion = stepWander(horse, wander, 1 / 60, [], person, random);
		if (motion.chew && motion.graze > 0) chewing++;
	}
	assert.ok(chewing > 60 * (TREAT_TIME - 0.5));
	assert.equal(wander.mode, 'follow');
	// The friend walks off; the horse keeps up at a distance.
	person.x = 15;
	for (let i = 0; i < 60 * 12; i++)
		stepWander(horse, wander, 1 / 60, [], person, random);
	assert.ok(Math.hypot(person.x - horse.x, person.z - horse.z) < 4);
	for (let i = 0; i < 60 * FOLLOW_TIME; i++)
		stepWander(horse, wander, 1 / 60, [], person, random);
	assert.notEqual(wander.mode, 'follow');
});
