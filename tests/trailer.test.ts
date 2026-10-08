import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	RIG,
	boardingPath,
	floorHeight,
	readyToBoard,
	rigLocal,
	rigPoint,
	rigSolids,
	stallPose,
	stepAlong,
	unloadingPath,
	type RigPose,
} from '../src/game/trailer.ts';
import { stepLedHorse } from '../src/game/leading.ts';
import { createState } from '../src/game/physics.ts';
import {
	REGIONS,
	REGION_IDS,
	keepInsideWorld,
	outsideWorld,
	regionAt,
} from '../src/game/regions.ts';
import {
	BEACH,
	PARKING,
	groundHeight,
	pierHeight,
} from '../src/world/region-layout.ts';

const pose: RigPose = { x: 10, z: -4, heading: -Math.PI / 2 };

await test('rig points and local coordinates are inverse', () => {
	for (const [x, z] of [
		[0, 0],
		[1.5, 3],
		[-0.8, -6.2],
	]) {
		const world = rigPoint(pose, x, z);
		const local = rigLocal(pose, world.x, world.z);
		assert.ok(Math.abs(local.x - x) < 1e-9 && Math.abs(local.z - z) < 1e-9);
	}
	// The car points along the heading: its front is west of the hitch.
	assert.ok(rigPoint(pose, 0, RIG.car.front).x < pose.x - 5);
});

await test('the car, trailer and ramp are solid, the driver door is outside', () => {
	const solids = rigSolids(pose);
	const inside = (p: { x: number; z: number }) =>
		solids.some(
			(s) => Math.abs(p.x - s.x) < s.w / 2 && Math.abs(p.z - s.z) < s.d / 2,
		);
	assert.ok(inside(rigPoint(pose, 0, 3)));
	assert.ok(inside(rigPoint(pose, 0, RIG.stall)));
	assert.ok(inside(rigPoint(pose, 0, RIG.ramp.end + 0.3)));
	assert.ok(!inside(rigPoint(pose, RIG.driverDoor.x, RIG.driverDoor.z)));
});

await test('a led horse behind the ramp walks up it into the stall', () => {
	const horse = createState();
	Object.assign(horse, rigPoint(pose, 0.4, RIG.ramp.end - 3.5), {
		heading: pose.heading,
	});
	assert.ok(readyToBoard(pose, horse));
	// Not from beside the car.
	assert.ok(
		!readyToBoard(pose, { ...horse, ...rigPoint(pose, 2.5, RIG.stall) }),
	);
	const path = boardingPath(pose);
	let highest = 0,
		steps = 0;
	while (!stepAlong(horse, path, 1 / 30, pose) && steps++ < 900)
		highest = Math.max(highest, horse.height);
	assert.ok(steps < 900, 'the horse arrived');
	const stall = stallPose(pose);
	assert.ok(Math.hypot(horse.x - stall.x, horse.z - stall.z) < 0.05);
	assert.equal(horse.height, RIG.trailer.floor);
	assert.ok(highest <= RIG.trailer.floor + 1e-9);
	assert.equal(horse.gait, 0);
});

await test('a horse backs out of the trailer down to the ground, facing the car', () => {
	const horse = { ...createState(), ...stallPose(pose) };
	const path = unloadingPath(pose);
	let steps = 0,
		reversing = false;
	while (!stepAlong(horse, path, 1 / 30, pose, true) && steps++ < 900)
		reversing ||= horse.gait === -1 && horse.speed < 0;
	assert.ok(reversing);
	assert.equal(horse.height, 0);
	assert.equal(horse.heading, pose.heading);
	assert.ok(rigLocal(pose, horse.x, horse.z).z < RIG.ramp.end - 2);
	assert.equal(floorHeight(pose, horse.x, horse.z), 0);
});

await test('a horse led towards the trailer stops at its solids', () => {
	const horse = createState();
	Object.assign(horse, rigPoint(pose, 3, 1), { heading: pose.heading });
	const person = { ...createState(), ...rigPoint(pose, -3, 1) };
	for (let i = 0; i < 300; i++)
		stepLedHorse(horse, person, 1 / 30, rigSolids(pose));
	const local = rigLocal(pose, horse.x, horse.z);
	assert.ok(local.x > RIG.car.halfWidth, 'the horse did not walk through');
});

await test('every place has its own edge, and parking lies inside it', () => {
	for (const id of REGION_IDS) {
		const region = REGIONS[id];
		assert.equal(regionAt(region.x + 20, region.z - 30), id);
		assert.ok(!outsideWorld(region.x, region.z));
		assert.ok(outsideWorld(region.x + region.radius + 1, region.z));
		const parked = PARKING[id];
		assert.equal(regionAt(parked.x, parked.z), id);
		for (const solid of rigSolids(parked))
			assert.ok(!outsideWorld(solid.x, solid.z, 2), id);
		const state = { ...createState(), x: region.x + region.radius + 9 };
		state.z = region.z;
		assert.ok(keepInsideWorld(state));
		assert.ok(Math.abs(state.x - region.x - region.radius) < 1e-9);
	}
});

await test('the pier rises from the sand to its deck and runs out to sea', () => {
	const { pier } = BEACH;
	const at = (lx: number, lz = 0) =>
		pierHeight(BEACH.x + lx, BEACH.z + pier.z + lz);
	assert.equal(at(pier.foot + 1), 0);
	assert.ok(
		at((pier.foot + pier.start) / 2) > 0 &&
			at((pier.foot + pier.start) / 2) < pier.deck,
	);
	assert.equal(at(pier.start - 1), pier.deck);
	assert.equal(at(-100), pier.deck);
	assert.equal(at(-100, pier.halfWidth + 0.5), 0, 'beside the deck is the sea');
	assert.equal(at(pier.end + 2, pier.platform.halfWidth - 1), pier.deck);
	assert.equal(at(pier.end - 1), 0);
	assert.equal(groundHeight(0, 0), 0, 'home stays flat');
	assert.equal(groundHeight(BEACH.x - 100, BEACH.z + pier.z), pier.deck);
	assert.ok(
		!outsideWorld(
			BEACH.x + pier.end,
			BEACH.z + pier.z + pier.platform.halfWidth,
		),
	);
});
