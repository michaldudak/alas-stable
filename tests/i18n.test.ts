import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { en } from '../src/i18n/en.ts';
import { pl } from '../src/i18n/pl.ts';
import {
	detectLanguage,
	translate,
	type MessageKey,
} from '../src/i18n/index.ts';

await test('browser languages respect priority, regional locales and English fallback', () => {
	assert.equal(detectLanguage(['pl-PL', 'en-US']), 'pl');
	assert.equal(detectLanguage(['en-GB', 'pl']), 'en');
	assert.equal(detectLanguage(['de-DE', 'PL-pl']), 'pl');
	assert.equal(detectLanguage(['fr-FR']), 'en');
	assert.equal(detectLanguage([]), 'en');
});

await test('catalogs cover shell messages and preserve interpolation parameters', () => {
	assert.deepEqual(Object.keys(pl).sort(), Object.keys(en).sort());
	for (const key of Object.keys(en) as MessageKey[]) {
		assert.ok(en[key].trim(), key);
		assert.ok(pl[key].trim(), key);
		assert.deepEqual(en[key].match(/\{\w+\}/g), pl[key].match(/\{\w+\}/g), key);
	}
	const shell = readFileSync('src/ui/shell.html', 'utf8');
	for (const [, key] of shell.matchAll(/\{\{([\w.]+)\}\}/g))
		assert.ok(Object.hasOwn(en, key), key);
});

await test('horse names are interpolated as data in either language', () => {
	assert.equal(
		translate('hint.waiting', 'en', { name: 'Raven' }),
		'Raven is waiting here.',
	);
	assert.equal(
		translate('hint.waiting', 'pl', { name: 'Raven' }),
		'Raven czeka tutaj.',
	);
	assert.equal(
		translate('hint.leading', 'en', { name: '<Raven>' }),
		'Leading: <Raven>',
	);
});
