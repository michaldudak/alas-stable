import { readStoredValue } from '../src/platform/storage.ts';
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
			assert.equal(key, 'alas-stable-appearance');
			return saved;
		},
		setItem: (key, value) => {
			assert.equal(key, 'alas-stable-appearance');
			saved = value;
		},
	}));
	const appearance = store.load();
	assert.equal(appearance.ornament, 'flower');
	assert.equal(appearance.coat, '#e6e0d2');
	store.save({ ...appearance, tailStyle: 'braided' });
	assert.equal(store.load().tailStyle, 'braided');
});

await test('renamed storage keys retain existing preferences and prefer new values', () => {
	for (const suffix of [
		'-appearance',
		'-appearance-LUNA',
		'.language',
		'.touchControls',
	]) {
		const values = new Map([['polana' + suffix, 'legacy']]);
		const storage = { getItem: (key: string) => values.get(key) ?? null };
		assert.equal(readStoredValue(storage, 'alas-stable' + suffix), 'legacy');
		values.set('alas-stable' + suffix, 'current');
		assert.equal(readStoredValue(storage, 'alas-stable' + suffix), 'current');
		values.set('alas-stable' + suffix, '');
		assert.equal(readStoredValue(storage, 'alas-stable' + suffix), '');
	}
	assert.equal(
		readStoredValue({ getItem: () => null }, 'alas-stable.language'),
		null,
	);
});
