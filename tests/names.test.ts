import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	NAME_IDEAS,
	NAME_LENGTH,
	normalizeHorseName,
	suggestName,
} from '../src/horse/names.ts';
import { createNameStore } from '../src/platform/name-storage.ts';
import { ROSTER, resident, stallNumber } from '../src/world/roster.ts';
import { STABLES } from '../src/world/stable-layout.ts';

await test('horse names are trimmed, limited and never empty', () => {
	assert.equal(normalizeHorseName('  Pier  niczek ', 'Fuks'), 'Pier niczek');
	assert.equal(normalizeHorseName('<b>Iskra</b>\u0007', 'Fuks'), 'bIskra/b');
	assert.equal(normalizeHorseName('   ', 'Fuks'), 'Fuks');
	assert.equal(normalizeHorseName(42, 'Fuks'), 'Fuks');
	assert.equal(
		normalizeHorseName('Łąka-Źrebaczek-Długi', 'Fuks').length,
		NAME_LENGTH,
	);
	assert.equal(normalizeHorseName('🐴🐴', 'Fuks'), '🐴🐴');
});

await test('name suggestions avoid names already in use', () => {
	const taken = NAME_IDEAS.pl.slice(1);
	assert.equal(suggestName('pl', taken), NAME_IDEAS.pl[0]);
	assert.ok(
		(NAME_IDEAS.en as readonly string[]).includes(suggestName('en', [])),
	);
});

await test('saved names survive reloads and broken storage', () => {
	const data = new Map<string, string>();
	const store = createNameStore(() => ({
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
	}));
	assert.equal(store.load('FUKS', 'Fuks'), 'Fuks');
	store.save('FUKS', 'Cynamon');
	assert.equal(store.load('FUKS', 'Fuks'), 'Cynamon');
	const broken = createNameStore(() => {
		throw new Error('blocked');
	});
	assert.equal(broken.load('FUKS', 'Fuks'), 'Fuks');
	broken.save('FUKS', 'Cynamon');
});

await test('every horse has its own stall and every stall a number', () => {
	const homes = new Set(
		ROSTER.map((h) => `${h.home.stable}:${h.home.bay}:${h.home.side}`),
	);
	assert.equal(homes.size, ROSTER.length);
	for (const spec of STABLES) {
		const numbers = new Set<number>();
		for (const side of [-1, 1] as const)
			for (let bay = 0; bay < spec.bays; bay++) {
				if (side > 0 && spec.tackRoom && bay === spec.bays - 1) {
					assert.equal(resident(spec.id, bay, side), undefined);
					continue;
				}
				numbers.add(stallNumber(spec, bay, side));
			}
		assert.equal(numbers.size, spec.bays * 2 - (spec.tackRoom ? 1 : 0));
	}
});
