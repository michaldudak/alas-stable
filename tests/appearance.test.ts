import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppearance } from '../src/horse/appearance.ts';

await test('old flower and color saves migrate without losing the horse appearance', () => {
	const settings = normalizeAppearance({ coat: '#e6e0d2', flower: true });
	assert.equal(settings.coat, '#e6e0d2');
	assert.equal(settings.ornament, 'flower');
	assert.equal(settings.maneStyle, 'long');
	assert.equal(settings.tailStyle, 'long');
});
await test('invalid saved selections fall back safely and valid styles remain independent', () => {
	for (const input of [
		null,
		3,
		[],
		{ maneStyle: 'invalid', pattern: '__proto__' },
	]) {
		const settings = normalizeAppearance(input);
		assert.equal(settings.maneStyle, 'long');
		assert.equal(settings.pattern, 'plain');
	}
	const settings = normalizeAppearance({
		maneStyle: 'short',
		tailStyle: 'braided',
		ornament: 'none',
		flower: true,
		pattern: 'stars',
	});
	assert.equal(settings.maneStyle, 'short');
	assert.equal(settings.tailStyle, 'braided');
	assert.equal(settings.ornament, 'none');
	assert.equal(settings.pattern, 'stars');
});

await test('bareback equipment is explicit and old or invalid saves keep a saddle', () => {
	assert.equal(normalizeAppearance({}).equipment, 'saddled');
	assert.equal(
		normalizeAppearance({ equipment: 'invalid' }).equipment,
		'saddled',
	);
	const settings = normalizeAppearance({
		equipment: 'bareback',
		cloth: '#7275a3',
		pattern: 'stars',
	});
	assert.equal(settings.equipment, 'bareback');
	assert.equal(settings.cloth, '#7275a3');
	assert.equal(
		normalizeAppearance({ ...settings, equipment: 'saddled' }).pattern,
		'stars',
	);
});
