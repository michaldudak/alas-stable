import {
	RIDER_MODEL_IDS,
	loadRiderAsset,
	type RiderFiles,
	type RiderModelId,
} from './rider-asset.ts';

// Vite resolves every file of every model folder; a new model only needs its
// folder under `src/assets/riders/` and its id in `RIDER_MODEL_IDS`.
const urls = import.meta.glob<string>('../assets/riders/*/*', {
	query: '?url',
	import: 'default',
	eager: true,
});

const NAMES: Record<keyof RiderFiles, string> = {
	model: 'rider.glb',
	skin: 'skin.webp',
	face: 'face.webp',
	outfit: 'outfit.webp',
	outfitNormal: 'outfit-normal.webp',
};

function bundledFiles(id: RiderModelId): RiderFiles {
	const url = (name: string) => urls[`../assets/riders/${id}/${name}`];
	const model = url(NAMES.model);
	if (!model) throw new Error(`The rider model "${id}" is not bundled.`);
	return {
		model,
		skin: url(NAMES.skin),
		face: url(NAMES.face),
		outfit: url(NAMES.outfit),
		outfitNormal: url(NAMES.outfitNormal),
	};
}

/** Loads every bundled rider model. */
export const loadRiderAssets = () =>
	Promise.all(
		RIDER_MODEL_IDS.map((id) => loadRiderAsset(id, bundledFiles(id))),
	);
