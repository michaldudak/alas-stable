import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../src/physics.ts';
import { STABLE, stableSolids, inTackRoom } from '../src/stable-layout.ts';
const solids = stableSolids();
function ride(x: number, z: number, heading: number, seconds: number) {
	const s = { ...createState(), x, z, heading, gait: 2, speed: 5.5 };
	for (let i = 0; i < seconds * 120; i++) step(s, 1 / 120, 0, [], solids);
	return s;
}
test('the stable aisle is traversable in both directions through both doors', () => {
	for (const direction of [-1, 1]) {
		const s = ride(
			STABLE.x,
			STABLE.z - direction * 17,
			direction > 0 ? 0 : Math.PI,
			7,
		);
		assert.ok((s.z - STABLE.z) * direction > 17);
		assert.equal(s.gait, 2);
	}
});
test('the tack-room doorway admits a horse and lets it return to the aisle', () => {
	const entered = ride(STABLE.x, STABLE.z + 7, Math.PI / 2, 1.5);
	assert.ok(inTackRoom(entered.x, entered.z));
	assert.equal(entered.gait, 2);
	const returned = ride(entered.x, entered.z, -Math.PI / 2, 1.5);
	assert.ok(Math.abs(returned.x - STABLE.x) < 0.01);
});
test('stable walls and stall fronts remain solid instead of passing through residents', () => {
	const stopped = ride(STABLE.x, STABLE.z - 1, -Math.PI / 2, 2);
	assert.equal(stopped.gait, 0);
	assert.ok(stopped.x > STABLE.x - 3.7);
	const outside = ride(STABLE.x - 16, STABLE.z, Math.PI / 2, 2);
	assert.equal(outside.gait, 0);
	assert.ok(outside.x < STABLE.x - 12);
});
