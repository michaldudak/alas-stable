import { readFile } from 'node:fs/promises';
import { parseHorseAsset } from '../../src/horse/asset.ts';

/** Loads the exported horse so tests can build horses without a browser. */
export async function loadTestHorseAsset() {
	const file = await readFile(
		new URL('../../src/assets/horse.glb', import.meta.url),
	);
	return parseHorseAsset(
		file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
	);
}
