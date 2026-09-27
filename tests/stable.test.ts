import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/game/physics.ts';
import {
	STABLE,
	STABLES,
	bayCenter,
	halfDepth,
	stableSolids,
	inTackRoom,
	stallAt,
} from '../src/world/stable-layout.ts';
const solids = stableSolids();
function ride(x: number, z: number, heading: number, seconds: number) {
	const s = { ...createState(), x, z, heading, gait: 2, speed: 5.5 };
	for (let i = 0; i < seconds * 120; i++) step(s, 1 / 120, 0, [], solids);
	return s;
}
await test('every stable aisle is traversable in both directions through both doors', () => {
	for (const spec of STABLES)
		for (const direction of [-1, 1]) {
			const reach = halfDepth(spec) + 4;
			const s = {
				...createState(),
				x: spec.x,
				z: spec.z - direction * reach,
				heading: direction > 0 ? 0 : Math.PI,
				gait: 2,
				speed: 5.5,
			};
			for (let i = 0; i < 12 * 120; i++)
				step(s, 1 / 120, 0, [], stableSolids(spec));
			assert.ok((s.z - spec.z) * direction > reach);
			assert.equal(s.gait, 2);
		}
});
await test('stall interiors are recognised on both sides of every aisle', () => {
	for (const spec of STABLES)
		for (let bay = 0; bay < spec.bays; bay++) {
			const stall = stallAt(spec.x - 7, spec.z + bayCenter(spec, bay));
			assert.ok(stall);
			assert.equal(stall.z, spec.z + bayCenter(spec, bay));
			assert.equal(stallAt(spec.x, spec.z + bayCenter(spec, bay)), undefined);
		}
	assert.equal(
		stallAt(STABLE.x + 7, STABLE.z + bayCenter(STABLE, STABLE.bays - 1)),
		undefined,
	);
});
await test('the tack-room doorway admits a horse and lets it return to the aisle', () => {
	const entered = ride(
		STABLE.x,
		STABLE.z + bayCenter(STABLE, STABLE.bays - 1),
		Math.PI / 2,
		1.5,
	);
	assert.ok(inTackRoom(entered.x, entered.z));
	assert.equal(entered.gait, 2);
	const returned = ride(entered.x, entered.z, -Math.PI / 2, 1.5);
	assert.ok(Math.abs(returned.x - STABLE.x) < 0.01);
});
await test('stable walls and the closed sections of stall fronts remain solid', () => {
	const stopped = ride(
		STABLE.x,
		STABLE.z + bayCenter(STABLE, 2) + 1.8,
		-Math.PI / 2,
		2,
	);
	assert.equal(stopped.gait, 0);
	assert.ok(stopped.x > STABLE.x - 3.7);
	const outside = ride(STABLE.x - 16, STABLE.z, Math.PI / 2, 2);
	assert.equal(outside.gait, 0);
	assert.ok(outside.x < STABLE.x - 12);
});

await test('Raven can enter the empty stall and return to the aisle', () => {
	const entered = ride(
		STABLE.x,
		STABLE.z + bayCenter(STABLE, STABLE.bays - 1),
		-Math.PI / 2,
		1.4,
	);
	assert.ok(entered.x < STABLE.x - 7);
	assert.equal(entered.gait, 2);
	const returned = ride(entered.x, entered.z, Math.PI / 2, 1.4);
	assert.ok(Math.abs(returned.x - STABLE.x) < 0.01);
	assert.equal(returned.gait, 2);
});
