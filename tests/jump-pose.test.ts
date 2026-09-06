import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleJump } from '../src/game/jump-pose.ts';
import { createGaitController } from '../src/game/gaits.ts';
import { JUMP_DURATION } from '../src/game/tuning.ts';

await test('jump folds forelegs first and extends them before the hind legs on descent', () => {
	const launch = sampleJump(0.15),
		apex = sampleJump(0.5),
		descent = sampleJump(0.88);
	assert.ok(launch.frontLift > launch.hindLift + 0.5);
	assert.ok(launch.pitch < 0 && descent.pitch > 0);
	assert.ok(apex.frontLift > 0.8 && apex.hindLift > 0.6);
	assert.ok(descent.frontLift < 0.1 && descent.hindLift > 0.3);
	for (let i = 1; i <= 1000; i++) {
		const a = sampleJump((i - 1) / 1000),
			b = sampleJump(i / 1000);
		for (const key of Object.keys(a) as (keyof typeof a)[])
			assert.ok(Math.abs(b[key] - a[key]) < 0.02);
	}
});
await test('landing absorbs impact and produces two separated pairs of footfalls', () => {
	const controller = createGaitController();
	for (let i = 0; i <= 120; i++)
		assert.equal(
			controller.update(1 / 120, {
				gait: 0,
				speed: 0,
				jump: (JUMP_DURATION * i) / 120,
			}).footfalls,
			0,
		);
	const impacts: number[] = [];
	let deepest = 0;
	for (let i = 0; i < 80; i++) {
		const pose = controller.update(1 / 120, { gait: 0, speed: 0, jump: -1 });
		if (pose.footfalls) impacts.push(i);
		deepest = Math.min(deepest, pose.y);
		if (i === 79) assert.ok(Math.abs(pose.y) < 0.001);
	}
	assert.equal(impacts.length, 2);
	assert.ok(impacts[1] - impacts[0] >= 10);
	assert.ok(deepest < -0.09);
});
