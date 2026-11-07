import assert from 'node:assert/strict';
import test from 'node:test';
import { Soundscape } from '../src/platform/audio.ts';

/** Ticks once with birds and crickets due; counts the tones, some on timers. */
async function tones(darkness: number, wildlife: boolean) {
	const audio = new Soundscape();
	let played = 0;
	audio.tone = () => {
		played++;
	};
	audio.darkness = darkness;
	audio.birdTime = 0;
	audio.cricketTime = 0;
	audio.tick(0.01, { z: 0 }, false, 0, wildlife);
	await new Promise((resolve) => setTimeout(resolve, 200));
	return played;
}

await test('birds sing by day except where there is no wildlife', async () => {
	assert.ok((await tones(0, true)) > 0);
	assert.equal(await tones(0, false), 0);
});

await test('crickets chirp at night except where there is no wildlife', async () => {
	assert.ok((await tones(1, true)) > 0);
	assert.equal(await tones(1, false), 0);
});
