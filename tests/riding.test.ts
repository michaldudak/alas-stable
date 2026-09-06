import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSide, stepPerson, clearForPerson } from '../src/game/riding.ts';
import { createState } from '../src/game/physics.ts';
await test('dismount picks a clear side and rejects blocked landing paths', () => {
	const horse = createState();
	horse.heading = 0;
	assert.equal(mountSide(horse, [])!.side, -1);
	assert.equal(mountSide(horse, [{ x: -1.65, z: 24, w: 0.5, d: 3 }])!.side, 1);
	assert.equal(
		mountSide(horse, [
			{ x: -1.65, z: 24, w: 0.5, d: 3 },
			{ x: 1.65, z: 24, w: 0.5, d: 3 },
		]),
		undefined,
	);
	assert.equal(clearForPerson(113, 0, []), false);
});
await test('walking and running are persistent and stop at walls and the waiting horse', () => {
	const horse = createState(),
		person = createState();
	person.x = 2;
	person.gait = 1;
	for (let i = 0; i < 120; i++) stepPerson(person, 1 / 60, 0, [], horse);
	assert.ok(person.speed > 1.7 && person.speed <= 1.8);
	person.gait = 2;
	for (let i = 0; i < 120; i++) stepPerson(person, 1 / 60, 0, [], horse);
	assert.ok(person.speed > 3.7 && person.speed <= 3.8);
	person.gait = 0;
	for (let i = 0; i < 120; i++) stepPerson(person, 1 / 60, 0, [], horse);
	assert.ok(person.speed < 0.001);
	Object.assign(person, createState(), {
		x: 2,
		heading: -Math.PI / 2,
		gait: 1,
	});
	for (let i = 0; i < 120; i++) stepPerson(person, 1 / 60, 0, [], horse);
	assert.equal(person.gait, 0);
	assert.ok(person.x >= 0.95);
	Object.assign(person, createState(), { x: 3, gait: 2 });
	for (let i = 0; i < 120; i++)
		stepPerson(person, 1 / 60, 0, [{ x: 3, z: 22, w: 3, d: 0.2 }], horse);
	assert.equal(person.gait, 0);
	assert.ok(person.z > 22.35);
});
