import * as THREE from 'three';
import { random } from './noise.ts';
import { SURFACE_SIZE } from './terrain.ts';
import { WORLD_RADIUS } from '../game/tuning.ts';

const CHUNK = 10;
const GRID = 11;
const CLUMPS_PER_CHUNK = 800;
const BLADES = 8;
const FADE_START = GRID * CHUNK * 0.33;
const FADE_END = GRID * CHUNK * 0.47;

/** A tuft of curved, tapering blades; `tip` runs from root (0) to tip (1). */
function clumpGeometry() {
	const next = random(4242);
	const positions: number[] = [],
		tips: number[] = [],
		normals: number[] = [],
		indices: number[] = [];
	for (let blade = 0; blade < BLADES; blade++) {
		const angle = next() * Math.PI * 2,
			radius = Math.sqrt(next()) * 0.22;
		const x = Math.cos(angle) * radius,
			z = Math.sin(angle) * radius;
		const facing = next() * Math.PI,
			lean = 0.1 + next() * 0.25,
			height = 0.65 + next() * 0.35,
			width = 0.05 + next() * 0.03;
		const fx = Math.cos(facing),
			fz = Math.sin(facing);
		const start = positions.length / 3;
		for (let row = 0; row <= 3; row++) {
			const t = row / 3,
				half = width * (1 - t * 0.92) * 0.5;
			const bend = lean * t * t;
			const cx = x - fz * bend,
				cz = z + fx * bend,
				y = height * t;
			positions.push(cx - fx * half, y, cz - fz * half);
			positions.push(cx + fx * half, y, cz + fz * half);
			tips.push(t, t);
			normals.push(0, 1, 0, 0, 1, 0);
			if (row)
				indices.push(
					start + row * 2 - 2,
					start + row * 2 - 1,
					start + row * 2,
					start + row * 2 - 1,
					start + row * 2 + 1,
					start + row * 2,
				);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('tip', new THREE.Float32BufferAttribute(tips, 1));
	geometry.setIndex(indices);
	return geometry;
}

const grassVertex = /* glsl */ `
attribute vec4 offset;
attribute float tip;
uniform sampler2D surfaceMask;
uniform float surfaceSize, time, fadeStart, fadeEnd, flatRadius;
varying float vTip;
varying float vLush;
float grassHash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}`;

const grassTransform = /* glsl */ `
vec3 tileOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vec3 local = vec3(offset.x, 0.0, offset.y);
float variation = grassHash(tileOrigin.xz + local.xz);
local.xz += (vec2(variation, grassHash(tileOrigin.zx + local.zx + 7.1)) - 0.5) * 0.7;
vec3 root = tileOrigin + local;
vec4 surface = textureLod(surfaceMask, root.xz / surfaceSize + 0.5, 0.0);
float insideMask = step(abs(root.x), surfaceSize * 0.5 - 2.0) * step(abs(root.z), surfaceSize * 0.5 - 2.0);
surface = mix(vec4(0.0, 0.0, 0.5, 1.0), surface, insideMask);
float cameraDistance = distance(root.xz, cameraPosition.xz);
float height = offset.w * (0.6 + 0.8 * surface.b) * (0.75 + 0.5 * variation);
height *= smoothstep(0.2, 0.75, surface.a);
height *= 1.0 - smoothstep(fadeStart, fadeEnd, cameraDistance);
height *= 1.0 - smoothstep(flatRadius - 6.0, flatRadius, length(root.xz));
float turn = offset.z + variation * 6.2831;
vec3 blade = position;
blade.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * blade.xz;
blade.y *= height;
// Masked or faded tufts collapse completely instead of lying flat on the ground.
blade.xz *= (0.7 + height * 0.8) * smoothstep(0.0, 0.08, height);
// Gusts roll across the meadow as travelling waves.
float gust = sin(time * 1.3 + root.x * 0.21 + root.z * 0.13) * 0.6 + sin(time * 2.7 + root.x * 0.8 - root.z * 0.5) * 0.25;
vec2 sway = vec2(0.8, 0.45) * (0.12 + 0.14 * gust) * tip * tip * height;
blade.xz += sway;
blade.y -= dot(sway, sway) * 1.5;
vec3 transformed = local + blade;
vTip = tip;
vLush = surface.b + (variation - 0.5) * 0.35;`;

const grassFragment = /* glsl */ `
varying float vTip;
varying float vLush;`;

const grassColor = /* glsl */ `
vec3 blade = mix(vec3(0.36, 0.35, 0.14), vec3(0.23, 0.33, 0.085), clamp(vLush, 0.0, 1.0));
// Darker roots stand in for the occlusion inside a dense sward.
diffuseColor.rgb *= blade * mix(0.55, 1.05, vTip);`;

/** Instanced meadow grass in a grid of tiles that follows the camera. */
export function createGrass(mask: THREE.Texture) {
	const clump = clumpGeometry();
	const next = random(97);
	const offsets = new Float32Array(CLUMPS_PER_CHUNK * 4);
	for (let i = 0; i < CLUMPS_PER_CHUNK; i++)
		offsets.set(
			[
				next() * CHUNK,
				next() * CHUNK,
				next() * Math.PI * 2,
				0.22 + next() * 0.2,
			],
			i * 4,
		);
	const offset = new THREE.InstancedBufferAttribute(offsets, 4);
	const uniforms = {
		surfaceMask: { value: mask },
		surfaceSize: { value: SURFACE_SIZE },
		time: { value: 0 },
		fadeStart: { value: FADE_START },
		fadeEnd: { value: FADE_END },
		flatRadius: { value: WORLD_RADIUS + 10 },
	};
	const material = new THREE.MeshStandardMaterial({
		roughness: 0.8,
		side: THREE.DoubleSide,
	});
	material.name = 'Grass';
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${grassVertex}`)
			.replace('#include <begin_vertex>', grassTransform);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${grassFragment}`)
			.replace('#include <map_fragment>', grassColor)
			// Blades share an upward normal, so both faces light like the ground.
			.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0');
	};
	const group = new THREE.Group();
	group.name = 'grass';
	const tiles: THREE.Mesh<THREE.InstancedBufferGeometry>[] = [];
	for (let i = 0; i < GRID * GRID; i++) {
		const geometry = new THREE.InstancedBufferGeometry();
		geometry.index = clump.index;
		for (const name of ['position', 'normal', 'tip'])
			geometry.setAttribute(name, clump.getAttribute(name));
		geometry.setAttribute('offset', offset);
		geometry.boundingSphere = new THREE.Sphere(
			new THREE.Vector3(CHUNK / 2, 0.4, CHUNK / 2),
			CHUNK * 0.75 + 1,
		);
		const tile = new THREE.Mesh(geometry, material);
		tile.receiveShadow = true;
		tile.matrixAutoUpdate = false;
		tiles.push(tile);
		group.add(tile);
	}
	const half = Math.floor(GRID / 2);
	return {
		group,
		update(time: number, camera: THREE.Camera) {
			uniforms.time.value = time;
			const cx = Math.floor(camera.position.x / CHUNK),
				cz = Math.floor(camera.position.z / CHUNK);
			tiles.forEach((tile, i) => {
				const x = (cx + (i % GRID) - half) * CHUNK,
					z = (cz + Math.floor(i / GRID) - half) * CHUNK;
				tile.position.set(x, 0, z);
				tile.updateMatrix();
				// Thin distant tiles; their shortened blades hide the lower density.
				const distance = Math.hypot(
					x + CHUNK / 2 - camera.position.x,
					z + CHUNK / 2 - camera.position.z,
				);
				const share = distance < 18 ? 1 : distance < 32 ? 0.55 : 0.3;
				tile.geometry.instanceCount = Math.round(CLUMPS_PER_CHUNK * share);
				tile.visible = distance < FADE_END + CHUNK;
			});
		},
	};
}
