import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadTestHorseAsset } from './support/horse-asset.ts';
import { createWalkingRider, stepTiming } from '../src/horse/walking-rider.ts';

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
			// A flat foot rests at ankle height; measure how far it drifts.
			if (i > 240 && position.y < 0.113) {
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
		assert.ok(Math.abs(position.y - 0.11) < 0.02, `${name} at ${position.y}`);
	}
});
