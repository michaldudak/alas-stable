import * as THREE from 'three';
import { WORLD_RADIUS } from '../game/tuning.ts';
import { fbm, worldNoise } from './noise.ts';
import { proceduralTexture, rgb, mix } from './textures.ts';
import { LAMP_POOL_GLSL, type SurfaceUniforms } from './lamps.ts';
import { halfDepth, insideStable, STABLES } from './stable-layout.ts';
import { isSand } from './locations.ts';
import {
	ARENA,
	PATHS,
	RACE_TRACK,
	inPasture,
	insideClubhouse,
	raceTrackDistance,
} from './layout.ts';

/** Edge length, in metres, of the square covered by the surface mask. */
export const SURFACE_SIZE = 416;
const MASK_RESOLUTION = 1536;
const FLAT_RADIUS = WORLD_RADIUS + 10;
// Wooded slopes darken the hills beyond the ridden area.
const WOODS_START = (WORLD_RADIUS + 38).toFixed(1),
	WOODS_END = (WORLD_RADIUS + 98).toFixed(1);

type Point = { x: number; z: number };
type Track = { points: Point[]; halfWidth: number };

/** Ground height outside the playable disc; the ridden area is perfectly flat. */
export function terrainHeight(x: number, z: number) {
	const r = Math.hypot(x, z);
	if (r <= FLAT_RADIUS) return 0;
	const angle = Math.atan2(z, x);
	const ridge =
		14 +
		26 * fbm((angle / (Math.PI * 2) + 1) % 1, 0.5, 5, 3, 17) +
		10 * worldNoise(x, z, 45, 23);
	const rise = THREE.MathUtils.smoothstep(r, FLAT_RADIUS, FLAT_RADIUS + 150);
	const far = THREE.MathUtils.smoothstep(r, 320, 760);
	return rise * ridge + far * (30 + 50 * worldNoise(x, z, 160, 29));
}

// Arena footing reaches the fence line, slightly beyond the audible sand area.
function sandAmount(x: number, z: number, jitter: number) {
	if (isSand(x, z)) return 1;
	const outside = Math.max(
		Math.abs(x - ARENA.x) - ARENA.halfWidth - 0.1,
		Math.abs(z - ARENA.z) - ARENA.halfDepth - 0.1,
	);
	const track = Math.abs(raceTrackDistance(x, z)) - RACE_TRACK.halfWidth - 0.2;
	return (
		1 -
		THREE.MathUtils.smoothstep(
			Math.min(outside, track) + jitter * 0.4,
			-0.25,
			0.3,
		)
	);
}

function segmentDistance(p: Point, a: Point, b: Point) {
	const abx = b.x - a.x,
		abz = b.z - a.z;
	const t = THREE.MathUtils.clamp(
		((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1),
		0,
		1,
	);
	return Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t);
}

/**
 * Paints sand, worn earth, grass lushness and grass density into one texture:
 * R sand, G dirt, B lushness, A grass density.
 */
function surfaceMask(path: readonly Point[]) {
	const size = MASK_RESOLUTION,
		texel = SURFACE_SIZE / size;
	const toWorld = (i: number) => (i + 0.5) * texel - SURFACE_SIZE / 2;
	const toTexel = (v: number) => Math.floor((v + SURFACE_SIZE / 2) / texel);
	// Distance to the nearest track, normalised by each track's half width.
	const wear = new Float32Array(size * size).fill(9);
	const tracks: Track[] = [
		{ points: [...path, path[0]], halfWidth: 2.8 },
		{
			points: [
				{ x: 0, z: 19 },
				{ x: 0, z: 25 },
				{ x: 0, z: 32 },
			],
			halfWidth: 3,
		},
		{
			points: [
				{ x: STABLES[0].x, z: 11 },
				{ x: STABLES[0].x - 1, z: 19 },
				{ x: -44, z: 30 },
			],
			halfWidth: 3.3,
		},
		{
			points: [
				{ x: STABLES[0].x + 12, z: 16 },
				{ x: -17, z: 25 },
			],
			halfWidth: 1.6,
		},
		...STABLES.flatMap((spec) =>
			[-1, 1].map((end) => ({
				points: [
					{ x: spec.x, z: spec.z + end * (halfDepth(spec) - 1) },
					{ x: spec.x, z: spec.z + end * (halfDepth(spec) + 7) },
				],
				halfWidth: 3.6,
			})),
		),
		...PATHS,
	];
	for (const track of tracks)
		for (let i = 0; i < track.points.length - 1; i++) {
			const a = track.points[i],
				b = track.points[i + 1],
				reach = track.halfWidth * 2;
			const x0 = Math.max(0, toTexel(Math.min(a.x, b.x) - reach)),
				x1 = Math.min(size - 1, toTexel(Math.max(a.x, b.x) + reach)),
				z0 = Math.max(0, toTexel(Math.min(a.z, b.z) - reach)),
				z1 = Math.min(size - 1, toTexel(Math.max(a.z, b.z) + reach));
			for (let zi = z0; zi <= z1; zi++)
				for (let xi = x0; xi <= x1; xi++) {
					const d =
						segmentDistance({ x: toWorld(xi), z: toWorld(zi) }, a, b) /
						track.halfWidth;
					const index = zi * size + xi;
					if (d < wear[index]) wear[index] = d;
				}
		}
	const data = new Uint8Array(size * size * 4);
	for (let zi = 0; zi < size; zi++)
		for (let xi = 0; xi < size; xi++) {
			const x = toWorld(xi),
				z = toWorld(zi),
				index = zi * size + xi;
			const jitter = worldNoise(x, z, 1.7, 3) - 0.5;
			const sand = sandAmount(x, z, jitter);
			const edge = wear[index] + jitter * 0.45;
			let dirt = 1 - THREE.MathUtils.smoothstep(edge, 0.7, 1.3);
			// Trampled patches around gates and the stable doors.
			if (insideStable(x, z, 3)) dirt = Math.max(dirt, 0.85);
			const forest = THREE.MathUtils.smoothstep(-z, 36, 52);
			const pasture = inPasture(x, z, -0.5) ? 1 : 0;
			const lush = Math.max(worldNoise(x, z, 38, 7), pasture * 0.95);
			let grass =
				(1 - sand) * (1 - THREE.MathUtils.smoothstep(dirt, 0.05, 0.6));
			grass *= 1 - forest * 0.6 * worldNoise(x, z, 9, 11);
			if (insideStable(x, z, 0.5) || insideClubhouse(x, z, 0.4)) grass = 0;
			// A trodden patch in front of the clubhouse porch.
			if (insideClubhouse(x - 2.5, z, 0.2) && !insideClubhouse(x, z, 0.3))
				dirt = Math.max(dirt, 0.7);
			for (const spec of STABLES) {
				// Paved aprons and hay stores outside the doors.
				const localX = x - spec.x,
					localZ = z - spec.z,
					depth = halfDepth(spec);
				for (const end of spec.id === 'main' ? [1] : [-1, 1]) {
					const out = end * localZ - depth;
					if (Math.abs(localX) < 5 && out > -1 && out < 9) grass = 0;
				}
				if (
					localX > -10.2 &&
					localX < -6 &&
					localZ > depth + 1 &&
					localZ < depth + 4.6
				)
					grass = 0;
			}
			const offset = index * 4;
			data[offset] = sand * 255;
			data[offset + 1] = dirt * (1 - sand) * 255;
			data[offset + 2] = lush * 255;
			data[offset + 3] = grass * 255;
		}
	return maskTexture(data, size);
}

function maskTexture(data: Uint8Array, size: number) {
	const texture = new THREE.DataTexture(data, size, size);
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.needsUpdate = true;
	return texture;
}

function groundTextures() {
	const grassBase = rgb('#687c3d'),
		grassDry = rgb('#948f55'),
		grassDark = rgb('#4f6431');
	const grass = proceduralTexture(512, (u, v) => {
		const broad = fbm(u, v, 6, 4, 1);
		const blades = fbm(u, v, 96, 2, 2);
		const straw = fbm(u, v, 40, 3, 3);
		let color = mix(
			grassDark,
			grassBase,
			THREE.MathUtils.smoothstep(broad, 0.25, 0.7),
		);
		color = mix(
			color,
			grassDry,
			THREE.MathUtils.smoothstep(straw, 0.6, 0.8) * 0.7,
		);
		const shade = 0.82 + blades * 0.36;
		return [color[0] * shade, color[1] * shade, color[2] * shade];
	});
	const earth = rgb('#86745a'),
		earthLight = rgb('#a19072'),
		earthDark = rgb('#6e5d47');
	const dirt = proceduralTexture(512, (u, v) => {
		const broad = fbm(u, v, 5, 4, 4);
		const grain = fbm(u, v, 128, 2, 5);
		const stones = fbm(u, v, 48, 1, 6);
		let color = mix(
			earthDark,
			earth,
			THREE.MathUtils.smoothstep(broad, 0.2, 0.6),
		);
		color = mix(
			color,
			earthLight,
			THREE.MathUtils.smoothstep(stones, 0.74, 0.8),
		);
		const shade = 0.9 + grain * 0.2;
		return [color[0] * shade, color[1] * shade, color[2] * shade];
	});
	const sandLight = rgb('#cdb895'),
		sandDark = rgb('#b39d7b');
	const sand = proceduralTexture(512, (u, v) => {
		const hoof = fbm(u, v, 14, 3, 7);
		const grain = fbm(u, v, 160, 2, 8);
		const color = mix(
			sandDark,
			sandLight,
			THREE.MathUtils.smoothstep(hoof, 0.28, 0.62),
		);
		const shade = 0.88 + grain * 0.24;
		return [color[0] * shade, color[1] * shade, color[2] * shade];
	});
	return { grass, dirt, sand };
}
function snowTexture() {
	const light = rgb('#f7f9fc'),
		shade = rgb('#d3deeb');
	return proceduralTexture(512, (u, v) => {
		const drift = fbm(u, v, 5, 4, 41);
		const crust = fbm(u, v, 90, 2, 42);
		const color = mix(
			shade,
			light,
			THREE.MathUtils.smoothstep(drift, 0.25, 0.7),
		);
		const shadeBy = 0.94 + crust * 0.08;
		return [color[0] * shadeBy, color[1] * shadeBy, color[2] * shadeBy];
	});
}

const groundVertex = /* glsl */ `
varying vec3 vGroundPosition;
varying vec3 vGroundNormal;`;

const groundFragment = /* glsl */ `
uniform sampler2D surfaceMask, grassMap, dirtMap, sandMap, snowMap;
uniform float surfaceSize, wetness, homeGround, woodedHills, snowCover, rockSlopes;
uniform vec2 maskOrigin;
uniform vec3 sandTint;
uniform vec4 outside, shore;
${LAMP_POOL_GLSL}
varying vec3 vGroundPosition;
varying vec3 vGroundNormal;
vec3 twoScale(sampler2D map, vec2 p, float scale) {
	// Blending two rotated scales hides the repetition of each detail texture.
	vec3 near = texture2D(map, p / scale).rgb;
	vec3 far = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * p / (scale * 4.3)).rgb;
	return mix(near, far, 0.4);
}`;

const groundColor = /* glsl */ `
vec2 groundXZ = vGroundPosition.xz;
vec2 maskXZ = groundXZ - maskOrigin;
vec2 maskUv = maskXZ / surfaceSize + 0.5;
float insideMask = step(abs(maskXZ.x), surfaceSize * 0.5 - 2.0) *
	step(abs(maskXZ.y), surfaceSize * 0.5 - 2.0);
vec4 surface = mix(outside, texture2D(surfaceMask, maskUv), insideMask);
vec3 grassColor = twoScale(grassMap, groundXZ, 5.0);
grassColor *= mix(vec3(1.08, 1.0, 0.8), vec3(0.9, 1.04, 0.9), surface.b);
vec3 groundColor = mix(grassColor, twoScale(dirtMap, groundXZ, 4.0), surface.g);
groundColor = mix(groundColor, twoScale(sandMap, groundXZ, 3.5) * sandTint, surface.r);
// Forest floor under the conifers, then a dark wooded skirt on the distant hills.
float forestFloor = (1.0 - smoothstep(-52.0, -36.0, groundXZ.y)) * (1.0 - surface.g) * insideMask * homeGround;
groundColor = mix(groundColor, groundColor * vec3(0.72, 0.66, 0.6), forestFloor * 0.6);
float radius = length(maskXZ);
float woods = smoothstep(${WOODS_START}, ${WOODS_END}, radius) * smoothstep(0.45, 0.55, texture2D(grassMap, groundXZ / 173.0).g * 2.2);
groundColor = mix(groundColor, vec3(0.13, 0.19, 0.1), woods * 0.75 * woodedHills);
// Snow lies everywhere but on trodden tracks; steep mountain faces show rock.
vec3 snow = twoScale(snowMap, groundXZ, 6.0);
groundColor = mix(groundColor, snow, snowCover * (1.0 - surface.g * 0.55));
float steep = smoothstep(0.8, 0.6, vGroundNormal.y) * rockSlopes;
vec3 rock = mix(vec3(0.3, 0.3, 0.32), vec3(0.46, 0.45, 0.44), texture2D(dirtMap, groundXZ / 23.0).r);
groundColor = mix(groundColor, rock, steep);
// Sand darkens where the waves have just run up the beach.
float wetSand = shore.z * (1.0 - smoothstep(shore.x, shore.x + shore.y, maskXZ.x));
// Rain darkens the ground, sand and bare earth most of all.
groundColor *= 1.0 - max(wetness, wetSand) * (0.22 + 0.16 * max(surface.r, surface.g));
diffuseColor.rgb *= groundColor;`;

type HeightField = (x: number, z: number) => number;

/** Rings of vertices around `origin`, dense on the flat and sparser on the hills. */
function groundGeometry(
	height: HeightField,
	origin: Point,
	flatRadius: number,
	segments = 192,
	outer = 900,
) {
	const radii: number[] = [];
	for (let r = 0; r < flatRadius; r += 6) radii.push(r);
	for (let r = flatRadius; r < outer; r += 6 + (r - flatRadius) * 0.08)
		radii.push(r);
	const positions: number[] = [],
		indices: number[] = [];
	for (const [ring, r] of radii.entries()) {
		for (let s = 0; s <= segments; s++) {
			const angle = (s / segments) * Math.PI * 2;
			const x = origin.x + Math.cos(angle) * r,
				z = origin.z + Math.sin(angle) * r;
			positions.push(x, height(x, z), z);
			if (ring && s < segments) {
				const a = ring * (segments + 1) + s,
					b = a - segments - 1;
				indices.push(b, b + 1, a, b + 1, a + 1, a);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

/** How a ground looks away from its mask and which regional effects it uses. */
export interface GroundLook {
	origin: Point;
	/** Edge length, in metres, of the square the mask covers. */
	size: number;
	/** Mask channels beyond the painted square: sand, dirt, lushness, grass. */
	outside?: [number, number, number, number];
	/** Home-only touches: the forest floor to the north. */
	home?: boolean;
	woodedHills?: number;
	snow?: number;
	rock?: number;
	sandTint?: [number, number, number];
}

function groundMaterial(
	mask: THREE.Texture,
	look: GroundLook,
	surfaceUniforms: SurfaceUniforms,
) {
	const { grass, dirt, sand } = groundTextures();
	const snow = snowTexture();
	const material = new THREE.MeshStandardMaterial({ roughness: 1 });
	material.name = 'Terrain';
	// Custom samplers are not material properties, so list them for disposal.
	material.userData.textures = [mask, grass, dirt, sand, snow];
	/** Beach wetness: x shoreline and y width in metres from the origin, z strength. */
	const shore = new THREE.Vector4(0, 1, 0, 0);
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, {
			surfaceMask: { value: mask },
			grassMap: { value: grass },
			dirtMap: { value: dirt },
			sandMap: { value: sand },
			snowMap: { value: snow },
			surfaceSize: { value: look.size },
			maskOrigin: { value: new THREE.Vector2(look.origin.x, look.origin.z) },
			outside: {
				value: new THREE.Vector4(...(look.outside ?? [0, 0, 0.5, 1])),
			},
			homeGround: { value: look.home ? 1 : 0 },
			woodedHills: { value: look.woodedHills ?? 1 },
			snowCover: { value: look.snow ?? 0 },
			rockSlopes: { value: look.rock ?? 0 },
			sandTint: { value: new THREE.Vector3(...(look.sandTint ?? [1, 1, 1])) },
			shore: { value: shore },
			wetness: surfaceUniforms.wetness,
			lampPools: surfaceUniforms.lampPools,
			lampStrength: surfaceUniforms.lampStrength,
		});
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${groundVertex}`)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvGroundPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGroundNormal = normalize(mat3(modelMatrix) * objectNormal);',
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${groundFragment}`)
			.replace('#include <map_fragment>', groundColor)
			.replace(
				'#include <roughnessmap_fragment>',
				'#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - max(wetness, wetSand) * 0.4 * max(surface.r, surface.g);',
			)
			.replace(
				'#include <emissivemap_fragment>',
				'#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * lampLight(groundXZ);',
			);
	};
	return { material, shore };
}

/** One continuous ground: flat meadow, arena sand, worn tracks and hills to the horizon. */
export function createTerrain(
	path: readonly Point[],
	surfaceUniforms: SurfaceUniforms,
) {
	const mask = surfaceMask(path);
	const { material } = groundMaterial(
		mask,
		{ origin: { x: 0, z: 0 }, size: SURFACE_SIZE, home: true },
		surfaceUniforms,
	);
	const ground = new THREE.Mesh(
		groundGeometry(terrainHeight, { x: 0, z: 0 }, FLAT_RADIUS),
		material,
	);
	ground.name = 'terrain';
	ground.receiveShadow = true;
	return { ground, mask };
}

/** Mask channels at a point: sand, dirt, lushness and grass density, 0–1. */
export type SurfacePaint = (
	x: number,
	z: number,
) => [number, number, number, number];

/**
 * The ground of a place away from home: its own painted surface around
 * `look.origin`, flat out to `flatRadius`, then shaped by `height`.
 */
export function createRegionGround(
	look: GroundLook & {
		resolution: number;
		paint: SurfacePaint;
		height: HeightField;
		flatRadius: number;
		segments?: number;
	},
	surfaceUniforms: SurfaceUniforms,
) {
	const size = look.resolution,
		texel = look.size / size;
	const data = new Uint8Array(size * size * 4);
	for (let zi = 0; zi < size; zi++)
		for (let xi = 0; xi < size; xi++) {
			const x = look.origin.x + (xi + 0.5) * texel - look.size / 2,
				z = look.origin.z + (zi + 0.5) * texel - look.size / 2;
			const channels = look.paint(x, z);
			const offset = (zi * size + xi) * 4;
			for (let c = 0; c < 4; c++)
				data[offset + c] = THREE.MathUtils.clamp(channels[c], 0, 1) * 255;
		}
	const mask = maskTexture(data, size);
	const { material, shore } = groundMaterial(mask, look, surfaceUniforms);
	const ground = new THREE.Mesh(
		groundGeometry(look.height, look.origin, look.flatRadius, look.segments),
		material,
	);
	ground.name = 'region-ground';
	ground.receiveShadow = true;
	return { ground, mask, shore };
}
