import { readStoredValue } from './storage.ts';
import { normalizeHorseName } from '../horse/names.ts';

type NameStorage = Pick<Storage, 'getItem' | 'setItem'>;
const key = (id: string) => `alas-stable.horse-name.${id}`;

/** Horse names chosen by the player, one entry per horse ID. */
export function createNameStore(
	storage: () => NameStorage = () => localStorage,
) {
	return {
		load(id: string, fallback: string) {
			try {
				return normalizeHorseName(
					readStoredValue(storage(), key(id)),
					fallback,
				);
			} catch {
				return fallback;
			}
		},
		save(id: string, name: string) {
			try {
				storage().setItem(key(id), name);
			} catch {
				/* The name lasts for this session. */
			}
		},
	};
}
