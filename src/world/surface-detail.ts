import * as THREE from 'three';
import { fbm, valueNoise } from './noise.ts';
import { proceduralTexture } from './textures.ts';

/**
 * Surface finishes for built objects. Each samples one channel of a shared detail
 * texture, projected in world space so boxes of any size keep a real-world scale.
 */
export type Finish =
	| 'plain'
	| 'paint'
	| 'wood'
	| 'post'
	| 'boards'
	| 'door'
	| 'siding'
	| 'concrete'
	| 'roofing'
	| 'straw';

type Recipe = {
	/** Weights of the R (grain), G (boards), B (speckle) and A (streaks) channels. */
	channels: [number, number, number, number];
	/** Metres covered by one texture tile. */
	tile: number;
	strength: number;
	/** Rotate the projection so grain runs vertically. */
	upright?: boolean;
	roughness: number;
};

const RECIPES: Record<Finish, Recipe> = {
	plain: { channels: [0, 0, 1, 0], tile: 3, strength: 0.25, roughness: 0.9 },
	paint: {
		channels: [0.6, 0, 0.4, 0],
		tile: 1.6,
		strength: 0.18,
		roughness: 0.7,
	},
	wood: { channels: [1, 0, 0, 0], tile: 1.4, strength: 0.55, roughness: 0.85 },
	post: {
		channels: [1, 0, 0, 0],
		tile: 1.4,
		strength: 0.5,
		upright: true,
		roughness: 0.85,
	},
	boards: {
		channels: [0.4, 0.6, 0, 0],
		tile: 2,
		strength: 0.6,
		roughness: 0.85,
	},
	door: {
		channels: [0.4, 0.6, 0, 0],
		tile: 2,
		strength: 0.6,
		upright: true,
		roughness: 0.85,
	},
	siding: {
		channels: [0.15, 0.6, 0, 0.25],
		tile: 2,
		strength: 0.45,
		upright: true,
		roughness: 0.8,
	},
	concrete: {
		channels: [0, 0, 0.7, 0.3],
		tile: 3,
		strength: 0.45,
		roughness: 0.95,
	},
	roofing: {
		channels: [0, 0, 0.35, 0.65],
		tile: 3,
		strength: 0.5,
		roughness: 0.55,
	},
	straw: { channels: [0.7, 0, 0.3, 0], tile: 0.6, strength: 0.8, roughness: 1 },
};

let shared: THREE.DataTexture | undefined;
function detailTexture() {
	if (shared) return shared;
	const texture = proceduralTexture(
		512,
		(u, v) => {
			// Long fibres with occasional knots.
			const fibre =
				valueNoise(u * 6, v * 90, 90, 1) * 0.6 + fbm(u, v, 8, 3, 2) * 0.4;
			const knot = Math.max(
				0,
				1 - Math.hypot(((u * 3) % 1) - 0.5, (((v * 2) % 1) - 0.5) * 3) * 5,
			);
			const grain = 0.5 + (fibre - 0.5) * 0.7 - knot * 0.25;
			// Eight horizontal boards per tile, dark grooves and slight per-board tone.
			const board = Math.floor(v * 8);
			const edge = Math.abs(((v * 8) % 1) - 0.5) * 2;
			const tone = valueNoise(board * 3.7, 0.5, 64, 3) - 0.5;
			const boards = edge > 0.93 ? 0.12 : 0.52 + tone * 0.22;
			const speckle =
				0.5 +
				(fbm(u, v, 16, 4, 4) - 0.5) * 0.9 +
				(valueNoise(u * 256, v * 256, 256, 5) - 0.5) * 0.15;
			// Vertical runoff streaks and grime.
			const streaks =
				0.5 +
				(valueNoise(u * 40, v * 3, 40, 6) - 0.5) * 0.5 +
				(fbm(u, v, 4, 3, 7) - 0.5) * 0.4;
			return [grain, boards, speckle, streaks];
		},
		THREE.NoColorSpace,
	);
	texture.addEventListener('dispose', () => {
		if (shared === texture) shared = undefined;
	});
	shared = texture;
	return texture;
}

const detailVertex = /* glsl */ `
varying vec3 vDetailPosition;
varying vec3 vDetailNormal;`;

const detailFragment = /* glsl */ `
uniform sampler2D detailMap;
uniform vec4 detailChannels;
uniform float detailTile, detailStrength, detailUpright;
varying vec3 vDetailPosition;
varying vec3 vDetailNormal;
float detailSample(vec2 p) {
	p = mix(p, p.yx, detailUpright);
	return dot(texture2D(detailMap, p / detailTile), detailChannels);
}`;

const detailColor = /* glsl */ `
#include <map_fragment>
vec3 detailBlend = pow(abs(normalize(vDetailNormal)), vec3(4.0));
detailBlend /= detailBlend.x + detailBlend.y + detailBlend.z;
float detail = detailSample(vDetailPosition.zy) * detailBlend.x +
	detailSample(vDetailPosition.xz) * detailBlend.y +
	detailSample(vDetailPosition.xy) * detailBlend.z;
diffuseColor.rgb *= clamp(1.0 + (detail - 0.5) * 2.0 * detailStrength, 0.0, 2.0);`;

/** A standard material with world-scale surface detail for the given finish. */
export function detailedMaterial(
	color: THREE.ColorRepresentation,
	finish: Finish,
	options: THREE.MeshStandardMaterialParameters = {},
) {
	const recipe = RECIPES[finish];
	const map = detailTexture();
	const material = new THREE.MeshStandardMaterial({
		color,
		roughness: recipe.roughness,
		...options,
	});
	material.name = finish;
	material.userData.textures = [map];
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, {
			detailMap: { value: map },
			detailChannels: { value: new THREE.Vector4(...recipe.channels) },
			detailTile: { value: recipe.tile },
			detailStrength: { value: recipe.strength },
			detailUpright: { value: recipe.upright ? 1 : 0 },
		});
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${detailVertex}`)
			.replace(
				'#include <worldpos_vertex>',
				`#include <worldpos_vertex>
vDetailPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDetailNormal = mat3(modelMatrix) * objectNormal;`,
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${detailFragment}`)
			.replace('#include <map_fragment>', detailColor);
	};
	return material;
}
