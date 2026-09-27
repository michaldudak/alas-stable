import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	advanceHour,
	createEnvironment,
	darkness,
	DAY_LENGTH,
	DAYLIGHT,
	isNightHour,
	START_HOUR,
	sunDirection,
} from '../src/game/environment.ts';

await test('a full day and night lasts fifteen minutes, with a shorter night', () => {
	let hour = START_HOUR,
		elapsed = 0,
		night = 0,
		wrapped = false;
	const dt = 0.05;
	while (!(wrapped && hour >= START_HOUR) && elapsed < DAY_LENGTH * 2) {
		const before = hour;
		hour = advanceHour(hour, dt);
		elapsed += dt;
		if (isNightHour(before)) night += dt;
		if (hour < before) wrapped = true;
	}
	assert.ok(Math.abs(elapsed - DAY_LENGTH) < 1, `day took ${elapsed}s`);
	assert.ok(night > DAY_LENGTH * 0.15 && night < DAY_LENGTH * 0.35);
});

await test('the sun rises in the east, stands in the south at noon and sets in the west', () => {
	const [noonEast, noonUp, noonSouth] = sunDirection(13);
	assert.ok(noonUp > 0.8 && noonSouth > 0.4 && Math.abs(noonEast) < 1e-9);
	const [morningEast, morningUp] = sunDirection(DAYLIGHT.sunrise + 0.5);
	assert.ok(morningEast > 0.5 && morningUp > 0);
	const [eveningEast, eveningUp] = sunDirection(DAYLIGHT.sunset - 0.5);
	assert.ok(eveningEast < -0.5 && eveningUp > 0);
	assert.ok(sunDirection(1)[1] < 0);
	assert.ok(Math.abs(sunDirection(DAYLIGHT.sunrise)[1]) < 1e-9);
	for (const hour of [0, 6, 13, 21]) {
		const [x, y, z] = sunDirection(hour);
		assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
	}
	assert.equal(darkness(sunDirection(13)[1]), 0);
	assert.equal(darkness(sunDirection(1)[1]), 1);
});

await test('weather changes on its own and rain only follows heavy cloud', () => {
	let seed = 7;
	const random = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};
	const environment = createEnvironment(random);
	const seen = new Set<string>();
	for (let i = 0; i < 20 * 60 * 20; i++) {
		environment.update(0.05);
		seen.add(environment.weather);
		if (environment.conditions.rain > 0.1)
			assert.ok(environment.conditions.overcast > 0.6);
	}
	assert.ok(seen.size >= 3, [...seen].join());
	environment.setWeather('rainy', true);
	for (let i = 0; i < 600; i++) environment.update(0.05);
	assert.ok(environment.wetness > 0.5);
	environment.setWeather('sunny', true);
	const wet = environment.wetness;
	for (let i = 0; i < 600; i++) environment.update(0.05);
	assert.ok(environment.wetness < wet);
});
