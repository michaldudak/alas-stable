import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadTestHorseAsset } from './support/horse-asset.ts';
import { createWalkingRider, stepTiming } from '../src/horse/walking-rider.ts';
import { SEAT_POINT, createRider } from '../src/horse/rider.ts';

await loadTestHorseAsset();

await test('walking cadence rises with speed and running spends less time on the ground', () => {
	const walk = stepTiming(1.8),
		run = stepTiming(3.8);
	assert.ok(walk.frequency > 0.8 && walk.frequency < 1.2);
	assert.ok(run.frequency > walk.frequency);
	assert.ok(walk.duty > 0.5 && run.duty < 0.5);
	assert.equal(walk.run, 0);
	assert.equal(run.run, 1);
});

await test('a planted foot stays put on the ground while the rider walks on', () => {
	for (const speed of [1.8, 3.8]) {
		const walker = createWalkingRider();
		const foot = walker.figure.bones.footL;
		// A flat foot rests at its rest height; measure how far it drifts.
		const flat = walker.figure.rest.footL.y + 0.004;
		const position = new THREE.Vector3();
		let z = 0,
			planted: THREE.Vector3 | undefined,
			slide = 0,
			stances = 0;
		for (let i = 0; i < 600; i++) {
			const dt = 1 / 120;
			walker.pose(dt, { speed });
			z += speed * dt;
			walker.root.position.z = z;
			walker.root.updateMatrixWorld(true);
			foot.getWorldPosition(position);
			if (i > 240 && position.y < flat) {
				if (planted) slide = Math.max(slide, planted.distanceTo(position));
				else {
					planted = position.clone();
					stances++;
				}
			} else planted = undefined;
		}
		assert.ok(stances >= 2, `${speed}: ${stances} stances`);
		assert.ok(slide < 0.05, `${speed}: the foot slid ${slide.toFixed(3)}`);
	}
});

await test('standing still keeps both feet on the ground', () => {
	const walker = createWalkingRider();
	for (let i = 0; i < 240; i++) walker.pose(1 / 60, { speed: 0 });
	walker.root.updateMatrixWorld(true);
	const position = new THREE.Vector3();
	for (const name of ['footL', 'footR'] as const) {
		walker.figure.bones[name].getWorldPosition(position);
		assert.ok(
			Math.abs(position.y - walker.figure.rest[name].y) < 0.02,
			`${name} at ${position.y}`,
		);
	}
});

await test('mounting ends in exactly the seated pose and starts from standing', () => {
	const walker = createWalkingRider();
	const seated = createRider(new THREE.Group(), new THREE.Vector3());
	const lift = 1.25;
	walker.pose(1 / 60, { speed: 0, seat: 1, side: 1, away: 0, lift });
	for (const name of ['hips', 'thighL', 'shinR', 'armL', 'handR'] as const)
		assert.ok(
			walker.figure.bones[name].quaternion.angleTo(
				seated.figure.bones[name].quaternion,
			) < 1e-3,
			name,
		);
	// The hips arrive where the mounted rider's hips are, whatever the lift.
	const hips = walker.figure.bones.hips.position
		.clone()
		.setY(walker.figure.bones.hips.position.y + lift);
	assert.ok(
		hips.distanceTo(SEAT_POINT) < 1e-3,
		`hips at ${hips.toArray().join(', ')}`,
	);
	// Half-way she stands in the stirrup, well above the saddle.
	walker.pose(1 / 60, { speed: 0, seat: 0.56, side: 1, away: 0.5, lift: 0.6 });
	assert.ok(walker.figure.bones.hips.position.y + 0.6 > SEAT_POINT.y + 0.2);
});
