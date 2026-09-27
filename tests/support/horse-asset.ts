import { readFile } from 'node:fs/promises';
import { parseHorseAsset } from '../../src/horse/asset.ts';
import { parseRiderAsset } from '../../src/horse/rider-asset.ts';

async function asset(name: string) {
	const file = await readFile(
		new URL(`../../src/assets/${name}`, import.meta.url),
	);
	return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

/** Loads the exported horse and rider so tests can build them without a browser. */
export async function loadTestHorseAsset() {
	await parseRiderAsset(await asset('rider.glb'));
	return parseHorseAsset(await asset('horse.glb'));
}
