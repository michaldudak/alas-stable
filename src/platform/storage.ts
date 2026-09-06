type ReadableStorage = Pick<Storage, 'getItem'>;

/** Preserve preferences saved before the project rename on the same origin. */
export function readStoredValue(
	storage: ReadableStorage,
	key: string,
): string | null {
	const current = storage.getItem(key);
	if (current !== null || !key.startsWith('alas-stable')) return current;
	return storage.getItem(key.replace(/^alas-stable/, 'polana'));
}
