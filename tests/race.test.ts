import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	advanceLap,
	courseProgress,
	formatTime,
	place,
	startLap,
} from '../src/game/race.ts';
import { createNpc, routeFromPoints, stepNpc } from '../src/game/npc.ts';
import {
	HIPPODROME,
	hippodromeDistance,
	hippodromeLength,
	hippodromePoint,
} from '../src/world/region-layout.ts';

const course = Array.from({ length: 360 }, (_, i) => hippodromePoint(i / 360));

await test('the course is a closed loop of the right length', () => {
	let length = 0;
	for (let i = 0; i < course.length; i++) {
		const a = course[i],
			b = course[(i + 1) % course.length];
		length += Math.hypot(b.x - a.x, b.z - a.z);
		assert.ok(Math.abs(hippodromeDistance(a.x, a.z)) < 1e-6);
	}
	assert.ok(Math.abs(length - hippodromeLength()) < 1);
	// The line is in front of the grandstand, on the south straight.
	const start = hippodromePoint(0);
	assert.equal(start.x, HIPPODROME.x);
	assert.ok(start.z > HIPPODROME.z);
});

await test('a lap counts only after every quarter post, in order', () => {
	const lap = startLap();
	lap.at = 0.99;
	assert.equal(advanceLap(lap, 0.01), false, 'leaving the line is not a lap');
	// Cutting straight across the infield skips the posts.
	assert.equal(advanceLap(lap, 0.52), false);
	assert.equal(advanceLap(lap, 0.97), false);
	assert.equal(advanceLap(lap, 0.02), false);
	const fair = startLap();
	fair.at = 0.99;
	for (let u = 0.01; u < 1; u += 0.02) assert.equal(advanceLap(fair, u), false);
	assert.equal(fair.posts, 3);
	assert.equal(advanceLap(fair, 0.005), true);
	assert.equal(fair.finished, true);
});

await test('places rank finishers by order and others by distance', () => {
	const a = startLap(),
		b = startLap(),
		c = startLap();
	Object.assign(a, { at: 0.6, posts: 2 });
	Object.assign(b, { at: 0.3, posts: 1 });
	Object.assign(c, { at: 0.97, posts: 0 });
	assert.equal(place(a, [a, b, c], []), 1);
	assert.equal(place(b, [a, b, c], []), 2);
	assert.equal(place(c, [a, b, c], []), 3, 'still behind the line');
	c.finished = true;
	assert.equal(place(c, [a, b, c], [c]), 1);
	assert.equal(formatTime(75.34), '1:15.3');
	assert.equal(formatTime(9.06), '0:09.1');
});

await test('rival racers gallop a lap in their lanes in about 75 seconds', () => {
	for (const [lane, pace] of [
		[-1, 0.1],
		[2.5, 0.2],
		[6, 0.28],
	] as const) {
		const points = Array.from({ length: 360 }, (_, i) =>
			hippodromePoint(i / 360, lane),
		);
		const start = Math.round((1 - 4 / hippodromeLength(lane)) * 360) % 360;
		const npc = createNpc(routeFromPoints(points, 3), start);
		const lap = startLap();
		lap.at = start / 360;
		let time = 0,
			widest = 0;
		while (!lap.finished && time < 150) {
			stepNpc(npc, 1 / 30, [], [], pace);
			time += 1 / 30;
			widest = Math.max(
				widest,
				Math.abs(hippodromeDistance(npc.state.x, npc.state.z) - lane),
			);
			advanceLap(lap, courseProgress(course, npc.state.x, npc.state.z));
		}
		assert.ok(lap.finished, `lane ${lane} finished`);
		assert.ok(time > 68 && time < 84, `lane ${lane}: ${time.toFixed(1)} s`);
		assert.ok(widest < 2.5, `lane ${lane} strayed ${widest.toFixed(2)} m`);
	}
});
