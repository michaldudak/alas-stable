import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	createGraph,
	findPath,
	nearestNode,
	nodeIndex,
	resample,
} from '../src/game/navigation.ts';
import { createPaths, stallAccess } from '../src/world/paths.ts';
import { ROSTER } from '../src/world/roster.ts';
import { stallAt, stableSolids, STABLES } from '../src/world/stable-layout.ts';

await test('paths are the shortest way through a network of named points', () => {
	const graph = createGraph(
		[
			{ name: 'a', x: 0, z: 0 },
			{ name: 'b', x: 10, z: 0 },
			{ name: 'c', x: 10, z: 10 },
			{ name: 'd', x: 0, z: 30 },
		],
		[
			['a', 'b'],
			['b', 'c'],
			['a', 'd'],
			['c', 'd'],
		],
	);
	assert.deepEqual(findPath(graph, 0, 2), [0, 1, 2]);
	assert.equal(nearestNode(graph, 9, 8), 2);
	const points = resample([graph.nodes[0], graph.nodes[1]], 2);
	assert.equal(points.length, 6);
	assert.equal(points.at(-1)!.x, 10);
});

await test('every stable door, the clubhouse and every activity are reachable', () => {
	const paths = createPaths();
	const from = nodeIndex(paths.graph, 'club');
	for (const name of [
		'main-in',
		'linden-in',
		'arena-in',
		'race-in',
		'pasture-path',
		'bw0',
	])
		assert.ok(findPath(paths.graph, from, nodeIndex(paths.graph, name)), name);
});

await test('each rider can lead her horse from the aisle into its own stall', () => {
	for (const horse of ROSTER) {
		const access = stallAccess(horse.home);
		const stall = stallAt(access.stall.x, access.stall.z);
		assert.ok(stall, horse.id);
		const spec = STABLES.find((s) => s.id === horse.home.stable)!;
		const walls = stableSolids(spec);
		// The walk from the aisle through the doorway to the middle of the stall is clear.
		for (const [a, b] of [
			[access.aisle, access.doorway],
			[access.doorway, access.stall],
			[access.inside, access.aisle],
		])
			for (let i = 0; i <= 20; i++) {
				const x = a.x + ((b.x - a.x) * i) / 20,
					z = a.z + ((b.z - a.z) * i) / 20;
				assert.ok(
					!walls.some(
						(s) =>
							Math.abs(x - s.x) < s.w / 2 + 0.5 &&
							Math.abs(z - s.z) < s.d / 2 + 0.5,
					),
					`${horse.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`,
				);
			}
		// The handler waits in the aisle, clear of the walls.
		assert.ok(Math.abs(access.handler.x - spec.x) < 3.3);
	}
});
