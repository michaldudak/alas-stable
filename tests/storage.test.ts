import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppearanceStore } from '../src/platform/appearance-storage.ts';

await test('appearance storage survives malformed saves and unavailable browser storage', () => {
	const corrupt = createAppearanceStore(() => ({
		getItem: () => '{broken',
		setItem() {},
	}));
	assert.equal(corrupt.load().maneStyle, 'long');
	const denied = createAppearanceStore(() => {
		throw new Error('Storage denied');
	});
	assert.equal(denied.load().ornament, 'none');
	assert.doesNotThrow(() => denied.save(denied.load()));
});

await test('appearance storage migrates legacy data and roundtrips current selections', () => {
	let saved = JSON.stringify({ flower: true, coat: '#e6e0d2' });
	const store = createAppearanceStore(() => ({
		getItem: (key) => {
			assert.equal(key, 'polana-appearance');
			return saved;
		},
		setItem: (key, value) => {
			assert.equal(key, 'polana-appearance');
			saved = value;
		},
	}));
	const appearance = store.load();
	assert.equal(appearance.ornament, 'flower');
	assert.equal(appearance.coat, '#e6e0d2');
	store.save({ ...appearance, tailStyle: 'braided' });
	assert.equal(store.load().tailStyle, 'braided');
});
