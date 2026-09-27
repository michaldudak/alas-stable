import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearbyLead, nearbyMount, horseBarrier } from '../src/game/herd.ts';
import { createState, step } from '../src/game/physics.ts';
import { stableSolids, STABLE, bayCenter } from '../src/world/stable-layout.ts';
import { createAppearanceStore } from '../src/platform/appearance-storage.ts';
await test('mount selection chooses a reachable nearby horse and rejects distant or blocked horses', () => {
	const a = { state: { ...createState(), x: 0, z: 0, heading: 0 } },
		b = { state: { ...createState(), x: 8.6, z: 0, heading: 0 } };
	const person = { ...createState(), x: 7, z: 0 };
	assert.equal(nearbyMount([a, b], person, [])?.horse, b);
	assert.equal(nearbyMount([a], person, []), undefined);
	assert.equal(
		nearbyMount([b], person, [{ x: 7.8, z: 0, w: 0.3, d: 8 }]),
		undefined,
	);
});
await test('every stall resident can be approached from the aisle and ridden out', () => {
	for (const side of [-1, 1])
		for (let bay = 0; bay < STABLE.bays - 1; bay++) {
			const z = bayCenter(STABLE, bay);
			const state = {
				...createState(),
				x: STABLE.x + side * 6.5,
				z: STABLE.z + z,
				heading: (-side * Math.PI) / 2,
			};
			const horse = { state };
			const person = {
				...createState(),
				x: state.x - side * 1.5,
				z: state.z - 1.2,
			};
			assert.ok(nearbyMount([horse], person, stableSolids()));
			state.gait = 1;
			for (let i = 0; i < 120; i++) step(state, 1 / 60, 0, [], stableSolids());
			assert.ok(Math.abs(state.x - STABLE.x) < 3.7);
			assert.equal(state.gait, 1);
		}
});
await test('waiting horses stop another horse from walking through them', () => {
	const waiting = { ...createState(), x: 0, z: 0, heading: 0 };
	const ridden = { ...createState(), x: 0, z: -5, heading: 0, gait: 1 };
	for (let i = 0; i < 240; i++)
		step(ridden, 1 / 60, 0, [], [horseBarrier(waiting)]);
	assert.equal(ridden.gait, 0);
	assert.ok(ridden.z < -1.9);
});
await test('horse appearances are stored independently and keep their own defaults', () => {
	const data = new Map<string, string>();
	const storage = () => ({
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => {
			data.set(key, value);
		},
	});
	const raven = createAppearanceStore(storage),
		luna = createAppearanceStore(storage, 'alas-stable-appearance-LUNA', {
			coat: '#e6e0d2',
		});
	const before = raven.load();
	luna.save({ ...luna.load(), pattern: 'stars' });
	assert.deepEqual(raven.load(), before);
	assert.equal(luna.load().pattern, 'stars');
	assert.equal(luna.load().coat, '#e6e0d2');
});
await test('a rider in front of a horse walks round its head to the saddle', () => {
	const horse = { ...createState(), x: 0, z: 0, heading: 0 };
	const person = { ...createState(), x: 0.2, z: 2.8 };
	const target = nearbyMount([{ state: horse }], person, []);
	assert.ok(target);
	assert.ok(target.path.length >= 2);
	const last = target.path[target.path.length - 1];
	assert.ok(
		Math.abs(Math.abs(last.x) - 1.65) < 1e-9 && Math.abs(last.z) < 1e-9,
	);
	// Every leg of the walk stays clear of the horse's body.
	let from = { x: person.x, z: person.z };
	for (const point of target.path) {
		for (let i = 0; i <= 20; i++) {
			const x = from.x + ((point.x - from.x) * i) / 20,
				z = from.z + ((point.z - from.z) * i) / 20;
			assert.ok(Math.abs(x) >= 0.95 || Math.abs(z) >= 1.55);
		}
		from = point;
	}
});
await test('the lead rope reaches a horse a few metres away but not through a wall', () => {
	const horse = { state: { ...createState(), x: 0, z: 0, heading: 0 } };
	const person = { ...createState(), x: 5, z: 0 };
	assert.equal(nearbyLead([horse], person, []), horse);
	assert.equal(
		nearbyLead([horse], person, [{ x: 2.5, z: 0, w: 0.3, d: 6 }]),
		undefined,
	);
	assert.equal(nearbyLead([horse], { ...person, x: 7 }, []), undefined);
});
