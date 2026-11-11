import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vector3Tuple } from '../rendering/types.ts';

/** Every rider model built by `tools/rider/build_rider.py`. */
export const RIDER_MODEL_IDS = ['adult-female'] as const;
export type RiderModelId = (typeof RIDER_MODEL_IDS)[number];
export const DEFAULT_RIDER_MODEL: RiderModelId = 'adult-female';

/** Written by the build; bones are listed parents first, in game units. */
export type RiderRig = {
	bones: Record<string, { parent: string | null; position: Vector3Tuple }>;
	/** Tips of the chains that end without a child bone (head, hands, toes, fingers). */
	ends: Record<string, Vector3Tuple>;
	eye: Vector3Tuple;
	crown: number;
	scale: number;
};

/** The files of one model; textures are optional so tests can load geometry alone. */
export type RiderFiles = {
	model: string;
	skin?: string;
	face?: string;
	outfit?: string;
	outfitNormal?: string;
};

export type RiderTextures = {
	skin?: THREE.Texture;
	face?: THREE.Texture;
	outfit?: THREE.Texture;
	outfitNormal?: THREE.Texture;
};

/** One skinned geometry with a group per material, named in `materials`. */
export type RiderAsset = {
	id: RiderModelId;
	geometry: THREE.BufferGeometry;
	materials: string[];
	rig: RiderRig;
	textures: RiderTextures;
};

const assets = new Map<RiderModelId, RiderAsset>();

/** Where a model's files sit below `base`, as the build writes them. */
export const riderFiles = (base: string, id: RiderModelId): RiderFiles => ({
	model: `${base}/${id}/rider.glb`,
	skin: `${base}/${id}/skin.webp`,
	face: `${base}/${id}/face.webp`,
	outfit: `${base}/${id}/outfit.webp`,
	outfitNormal: `${base}/${id}/outfit-normal.webp`,
});

export async function parseRiderAsset(
	id: RiderModelId,
	data: ArrayBuffer,
	textures: RiderTextures = {},
): Promise<RiderAsset> {
	const gltf = await new GLTFLoader().parseAsync(data, '');
	const parts: THREE.Mesh[] = [];
	let rig: RiderRig | undefined;
	gltf.scene.traverse((object) => {
		if (object instanceof THREE.Mesh) parts.push(object);
		if (object.userData.rig) rig = object.userData.rig as RiderRig;
	});
	if (!rig || !parts.length)
		throw new Error(`The rider asset "${id}" has no rig or mesh.`);
	const geometry = mergeGeometries(
		parts.map((part) => part.geometry),
		true,
	);
	geometry.setAttribute('ao', geometry.getAttribute('_ao'));
	geometry.deleteAttribute('_ao');
	geometry.computeBoundingSphere();
	for (const part of parts) part.geometry.dispose();
	const asset: RiderAsset = {
		id,
		geometry,
		materials: parts.map((part) =>
			Array.isArray(part.material) ? '' : part.material.name,
		),
		rig,
		textures,
	};
	assets.set(id, asset);
	return asset;
}

async function loadTexture(url: string | undefined, colour: boolean) {
	if (!url) return undefined;
	const texture = await new THREE.TextureLoader().loadAsync(url);
	// glTF texture coordinates start at the top left of the image.
	texture.flipY = false;
	texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	texture.anisotropy = 4;
	return texture;
}

export async function loadRiderAsset(id: RiderModelId, files: RiderFiles) {
	const [response, skin, face, outfit, outfitNormal] = await Promise.all([
		fetch(files.model),
		loadTexture(files.skin, true),
		loadTexture(files.face, true),
		loadTexture(files.outfit, true),
		loadTexture(files.outfitNormal, false),
	]);
	if (!response.ok)
		throw new Error(`Rider asset failed to load: ${response.status}`);
	return parseRiderAsset(id, await response.arrayBuffer(), {
		skin,
		face,
		outfit,
		outfitNormal,
	});
}

/** A loaded rider model; call `loadRiderAsset` before creating horses or walkers. */
export function riderAsset(id: RiderModelId = DEFAULT_RIDER_MODEL) {
	const asset = assets.get(id);
	if (!asset)
		throw new Error(`Load the rider asset "${id}" before creating riders.`);
	return asset;
}
