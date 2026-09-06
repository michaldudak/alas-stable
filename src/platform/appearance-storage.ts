import { readStoredValue } from './storage.ts';
import { normalizeAppearance, type Appearance } from '../horse/appearance.ts';

const STORAGE_KEY = 'alas-stable-appearance';
type AppearanceStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Resolve storage lazily: some browsers throw merely when accessing localStorage.
export function createAppearanceStore(
	storage: () => AppearanceStorage = () => localStorage,
	key = STORAGE_KEY,
	defaults: Partial<Appearance> = {},
) {
	return {
		load(): Appearance {
			try {
				return normalizeAppearance({
					...defaults,
					...JSON.parse(readStoredValue(storage(), key) || '{}'),
				});
			} catch {
				return normalizeAppearance(defaults);
			}
		},
		save(appearance: Appearance): void {
			try {
				storage().setItem(key, JSON.stringify(appearance));
			} catch {
				/* Appearance changes remain usable for this session. */
			}
		},
	};
}
