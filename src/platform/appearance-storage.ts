import { normalizeAppearance, type Appearance } from '../horse/appearance.ts';

const STORAGE_KEY = 'polana-appearance';
type AppearanceStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Resolve storage lazily: some browsers throw merely when accessing localStorage.
export function createAppearanceStore(
	storage: () => AppearanceStorage = () => localStorage,
) {
	return {
		load(): Appearance {
			try {
				return normalizeAppearance(
					JSON.parse(storage().getItem(STORAGE_KEY) || '{}'),
				);
			} catch {
				return normalizeAppearance({});
			}
		},
		save(appearance: Appearance): void {
			try {
				storage().setItem(STORAGE_KEY, JSON.stringify(appearance));
			} catch {
				/* Appearance changes remain usable for this session. */
			}
		},
	};
}
