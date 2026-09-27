import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNpc, routeFromPoints, stepNpc } from '../src/game/npc.ts';
import {
	RACE_TRACK,
	raceTrackDistance,
	raceTrackPoint,
	raceTrackLength,
} from '../src/world/layout.ts';

await test('a racer gallops laps of the racecourse without leaving the sand', () => {
	const route = routeFromPoints(
		Array.from({ length: 160 }, (_, i) => raceTrackPoint(i / 160, -2)),
		3,
	);
	const npc = createNpc(route);
	let travelled = 0;
	for (let i = 0; i < 60 * 40; i++) {
		const before = { x: npc.state.x, z: npc.state.z };
		stepNpc(npc, 1 / 60, [], []);
		travelled += Math.hypot(npc.state.x - before.x, npc.state.z - before.z);
		assert.ok(
			Math.abs(raceTrackDistance(npc.state.x, npc.state.z)) <
				RACE_TRACK.halfWidth,
		);
	}
	assert.ok(travelled > raceTrackLength() * 1.2, `rode ${travelled} m`);
});

await test('a rider on a straight line jumps the fence across it', () => {
	const points = Array.from({ length: 40 }, (_, i) => ({
		x: 0,
		z: 30 - i * 2,
	}));
	const route = routeFromPoints(
		[
			...points,
			...points
				.slice()
				.reverse()
				.map((p) => ({ x: 8, z: p.z })),
		],
		3,
		2,
	);
	const npc = createNpc(route);
	const fence = { x: 0, z: 0, width: 8, angle: 0, down: 0 };
	let jumped = false;
	for (let i = 0; i < 60 * 8; i++) {
		stepNpc(npc, 1 / 60, [fence], []);
		if (npc.state.height > 1) jumped = true;
		if (npc.state.z < -6) break;
	}
	assert.ok(jumped);
	assert.equal(fence.down, 0);
});

await test('riders wait for someone in the way and pass a standing horse later', () => {
	const points = Array.from({ length: 60 }, (_, i) => ({ x: 0, z: -i * 2 }));
	const route = routeFromPoints(points, 2);
	const npc = createNpc(route);
	const person = { x: 0, z: -12, w: 0.8, d: 0.8 };
	for (let i = 0; i < 60 * 10; i++) stepNpc(npc, 1 / 60, [], [person]);
	assert.ok(npc.state.z > -12 && npc.state.speed < 0.2);
	const horse = { x: 0, z: -12, w: 1.3, d: 2.5 };
	for (let i = 0; i < 60 * 12; i++) stepNpc(npc, 1 / 60, [], [], 0, [horse]);
	assert.ok(npc.state.z < -14);
});
