import * as THREE from 'three';
import type { Solid } from '../game/types.ts';
import { box, cylinder, ellipsoid, sign } from './primitives.ts';
import { stripes, texturedBox, placed } from './furniture.ts';
import { random, worldNoise } from './noise.ts';
import { createRegionGround } from './terrain.ts';
import { createForest, type TreeSpec } from './trees.ts';
import { mergeStatic } from '../rendering/merge.ts';
import { BEACH } from './region-layout.ts';
import type { SurfaceUniforms } from './lamps.ts';

const smooth = THREE.MathUtils.smoothstep;

/** Ground height at the seaside: the sea floor, the flat beach, the dunes. */
export function beachHeight(x: number, z: number) {
	const lx = x - BEACH.x,
		lz = z - BEACH.z;
	if (lx < BEACH.wade - 2) return Math.max(-14, (lx - BEACH.wade + 2) * 0.07);
	const rise = smooth(lx, BEACH.dunes - 1, BEACH.dunes + 9);
	if (rise <= 0) return 0;
	const dune =
		2.5 + 4.5 * worldNoise(x, z, 22, 5) + 1.8 * worldNoise(x, z, 8, 6);
	// The gap through the dunes and the car park behind are dug out flat.
	const gap =
		(1 - smooth(Math.abs(lz), BEACH.gapHalfWidth + 1, BEACH.gapHalfWidth + 7)) *
		(1 - smooth(lx, BEACH.parkEnd + 1, BEACH.parkEnd + 9));
	const inland = smooth(lx, 80, 420) * (10 + 25 * worldNoise(x, z, 90, 7));
	return rise * dune * (1 - gap) + inland;
}

const seaVertex = /* glsl */ `
varying vec3 vSeaPosition;`;

const seaFragment = /* glsl */ `
uniform float time, shoreX;
uniform vec3 shallow, deep;
varying vec3 vSeaPosition;
float seaHash(vec2 p) {
	return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}
float seaNoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), u.x),
		mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0)), u.x), u.y);
}`;

// The waterline surges up the beach and back; foam gathers at the edge and on
// lines of breaking waves rolling in.
const seaSurface = /* glsl */ `
float lx = vSeaPosition.x - shoreX;
float z = vSeaPosition.z;
float swash = sin(time * 0.55 + z * 0.021) * 2.2 + sin(time * 1.1 + z * 0.057 + 1.3) * 0.8;
float depth = swash - lx;
if (depth < 0.0) discard;
float roll = fract((lx + time * 2.4 + seaNoise(vec2(z * 0.05, 3.0)) * 4.0) / 13.0);
float breaking = smoothstep(0.86, 0.95, roll) * (1.0 - smoothstep(0.95, 1.0, roll))
	* smoothstep(2.0, 6.0, depth) * (1.0 - smoothstep(14.0, 34.0, depth));
float lace = seaNoise(vSeaPosition.xz * 0.9 + vec2(time * 0.3, 0.0));
float foam = max(1.0 - smoothstep(0.0, 1.8 + lace, depth), breaking * (0.5 + 0.5 * lace));
foam = clamp(foam, 0.0, 1.0);
vec3 water = mix(shallow, deep, smoothstep(2.0, 70.0, depth));
diffuseColor.rgb = mix(water, vec3(0.96, 0.98, 1.0), foam);
diffuseColor.a = max(mix(0.45, 0.94, smoothstep(0.0, 9.0, depth)), foam);`;

const seaNormal = /* glsl */ `
vec2 wp = vSeaPosition.xz;
vec2 slope = vec2(0.0);
// Ripples fade with distance, so the far sea does not shimmer.
float ripple = 1.0 - smoothstep(40.0, 320.0, distance(vSeaPosition, cameraPosition));
slope += cos(wp.x * 0.35 + time * 1.3 + wp.y * 0.12) * vec2(0.35, 0.12) * 0.12;
slope += cos(wp.x * 0.9 - wp.y * 0.6 + time * 2.1) * vec2(0.9, -0.6) * 0.035;
slope += cos(-wp.x * 0.3 + wp.y * 1.4 + time * 1.7) * vec2(-0.3, 1.4) * 0.03;
slope += (vec2(seaNoise(wp * 1.7 + time * 0.6), seaNoise(wp * 1.7 - time * 0.5)) - 0.5) * 0.14;
slope *= 0.25 + 0.75 * ripple;
vec3 seaUp = normalize(vec3(-slope.x, 1.0, -slope.y));
normal = normalize((viewMatrix * vec4(seaUp, 0.0)).xyz);`;

/** The sea: a transparent surface with waves, surf and a moving waterline. */
function createSea() {
	const uniforms = {
		time: { value: 0 },
		shoreX: { value: BEACH.x + BEACH.shore },
		shallow: { value: new THREE.Color('#5fb8b0') },
		deep: { value: new THREE.Color('#1d4f72') },
	};
	const material = new THREE.MeshStandardMaterial({
		color: '#ffffff',
		roughness: 0.07,
		metalness: 0,
		transparent: true,
		depthWrite: false,
	});
	material.name = 'Sea';
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${seaVertex}`)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvSeaPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${seaFragment}`)
			.replace('#include <map_fragment>', seaSurface)
			.replace(
				'#include <normal_fragment_maps>',
				`#include <normal_fragment_maps>\n${seaNormal}`,
			)
			.replace(
				'#include <roughnessmap_fragment>',
				'#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.7, foam);',
			);
	};
	const size = 1800;
	const sea = new THREE.Mesh(
		new THREE.PlaneGeometry(size, size, 1, 1),
		material,
	);
	sea.rotation.x = -Math.PI / 2;
	sea.position.set(BEACH.x + BEACH.shore + 6 - size / 2, 0.1, BEACH.z);
	sea.receiveShadow = true;
	sea.renderOrder = 1;
	sea.name = 'sea';
	return { sea, uniforms };
}

/** A tuft of marram grass: thin arching blades. */
function tuftGeometry() {
	const next = random(808);
	const positions: number[] = [];
	for (let i = 0; i < 9; i++) {
		const angle = next() * Math.PI * 2,
			lean = 0.2 + next() * 0.35,
			height = 0.5 + next() * 0.45;
		const dx = Math.cos(angle),
			dz = Math.sin(angle);
		const side = [-dz * 0.025, dx * 0.025];
		positions.push(
			side[0],
			0,
			side[1],
			-side[0],
			0,
			-side[1],
			dx * lean,
			height,
			dz * lean,
		);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.computeVertexNormals();
	return geometry;
}

/** A gull: two swept wings that flap as it circles. */
function gull(parent: THREE.Object3D, material: THREE.Material) {
	const bird = new THREE.Group();
	const wing = new THREE.BufferGeometry();
	wing.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(
			[
				0, 0, 0.18, 0, 0, -0.12, 0.75, 0.05, -0.2, 0, 0, 0.18, 0.75, 0.05, -0.2,
				0.4, 0.02, 0.05,
			],
			3,
		),
	);
	wing.computeVertexNormals();
	const wings = [1, -1].map((side) => {
		const mesh = new THREE.Mesh(wing, material);
		mesh.scale.x = side;
		bird.add(mesh);
		return mesh;
	});
	const body = new THREE.Mesh(
		new THREE.CapsuleGeometry(0.07, 0.35, 3, 6),
		material,
	);
	body.rotation.x = Math.PI / 2;
	bird.add(body);
	parent.add(bird);
	return { bird, wings };
}

/**
 * The seaside: a wide sandy beach with surf, windbreaks and umbrellas, a
 * lifeguard's chair, an ice-cream kiosk and beach huts, a long pier, dunes of
 * marram grass fenced with posts and rope, and pines behind. Gulls wheel over
 * the water.
 */
export function createBeach(
	scene: THREE.Scene,
	solids: Solid[],
	surface: SurfaceUniforms,
) {
	const { x: X, z: Z } = BEACH;
	const root = new THREE.Group();
	root.name = 'beach';
	scene.add(root);
	const props = new THREE.Group();
	root.add(props);
	const at = (x: number, z: number, w: number, d: number) =>
		solids.push({ x: X + x, z: Z + z, w, d });
	const inPark = (lx: number, lz: number) =>
		lx > BEACH.dunes - 2 &&
		lx < BEACH.parkEnd + 1 &&
		Math.abs(lz) < BEACH.gapHalfWidth + 1;
	const ground = createRegionGround(
		{
			origin: BEACH,
			size: 440,
			resolution: 1024,
			flatRadius: 180,
			segments: 256,
			height: beachHeight,
			outside: [1, 0, 0.2, 0],
			woodedHills: 0,
			sandTint: [1.14, 1.08, 0.97],
			paint(x, z) {
				const lx = x - X,
					lz = z - Z;
				const park = inPark(lx, lz) && lx > BEACH.dunes + 2 ? 1 : 0;
				// Marram grass at the foot of the dunes, where the ground is flat.
				const foot =
					smooth(lx, BEACH.dunes - 6, BEACH.dunes - 1) *
					(1 - smooth(lx, BEACH.dunes, BEACH.dunes + 2)) *
					(inPark(lx, lz) ? 0 : 1) *
					smooth(worldNoise(x, z, 6, 12), 0.35, 0.6);
				return [1 - park * 0.6, park * 0.9, 0.15, foot * 0.8];
			},
		},
		surface,
	);
	ground.shore.set(BEACH.shore + 3.2, 5, 1, 0);
	root.add(ground.ground);
	const { sea, uniforms: seaUniforms } = createSea();
	root.add(sea);

	// Riders may wade into the shallows, but no further; dunes and the car
	// park are fenced.
	// The edge of the shallows has a gap where the pier runs out to sea.
	const pierEdge = BEACH.pier.z - BEACH.pier.halfWidth,
		pierFar = BEACH.pier.z + BEACH.pier.halfWidth;
	at(BEACH.wade - 0.5, (pierEdge - 350) / 2, 1, 350 + pierEdge);
	at(BEACH.wade - 0.5, (pierFar + 350) / 2, 1, 350 - pierFar);
	const fenceX = BEACH.dunes - 1.2,
		reach = 215,
		gap = BEACH.gapHalfWidth;
	for (const side of [-1, 1]) {
		at(fenceX, (side * (gap + reach)) / 2, 0.3, reach - gap);
		at(
			(fenceX + BEACH.parkEnd) / 2,
			side * (gap + 1),
			BEACH.parkEnd - fenceX,
			0.4,
		);
	}
	at(BEACH.parkEnd + 0.5, 0, 0.4, gap * 2 + 2);
	// Posts strung with rope keep feet off the dunes.
	const rope = new THREE.MeshStandardMaterial({
		color: '#cfc2a0',
		roughness: 0.9,
	});
	for (const side of [-1, 1])
		for (let lz = gap + 1; lz < reach; lz += 3) {
			const post = cylinder(
				props,
				'#8b6d4c',
				0.07,
				1.1,
				[fenceX, 0.45, side * lz],
				0.06,
				'post',
			);
			post.rotation.z = Math.sin(lz) * 0.06;
			if (lz + 3 < reach) {
				const strand = cylinder(props, '#cfc2a0', 0.015, 3, [
					fenceX,
					0.8,
					side * (lz + 1.5),
				]);
				strand.rotation.x = Math.PI / 2;
				strand.material = rope;
			}
		}
	for (const side of [-1, 1])
		for (let lx = BEACH.dunes; lx < BEACH.parkEnd; lx += 3)
			cylinder(
				props,
				'#8b6d4c',
				0.07,
				1.0,
				[lx, 0.45, side * (gap + 1)],
				0.06,
				'post',
			);
	// A boardwalk from the car park down onto the beach.
	for (let lx = 6; lx < BEACH.dunes + 8; lx += 0.5)
		box(
			props,
			lx % 1 ? '#b99a70' : '#a88a62',
			[0.45, 0.06, 2.4],
			[lx, 0.03, -3.5],
			0,
			'boards',
		);
	sign(props, 'sign.beach', BEACH.dunes + 1, -6.5, Math.PI / 2);

	// Windbreaks, umbrellas and towels along the top of the beach.
	const next = random(4242);
	const palettes = [
		['#2f5aa8', '#f4f1e8'],
		['#c8453c', '#f4f1e8', '#e9c341'],
		['#3f8a6b', '#f4f1e8'],
		['#e27a3f', '#f7d9a8'],
	];
	const fabrics = palettes.map((colors) => stripes(colors, 8));
	const towels = palettes.map((colors) => stripes(colors, 6, false));
	for (let i = 0; i < 7; i++) {
		const lz = -70 + i * 17 + next() * 6,
			lx = -2 + next() * 12;
		if (Math.abs(lz + 3.5) < 5) continue;
		const fabric = fabrics[i % fabrics.length];
		const camp = placed(props, lx, lz, (next() - 0.5) * 0.6);
		// Three panels in a U, open to the sea.
		for (const [px, pz, turn, width] of [
			[0, -1.6, 0, 3.6],
			[-1.8, 0, Math.PI / 2, 3.2],
			[1.8, 0, Math.PI / 2, 3.2],
		] as const) {
			const panel = placed(camp, px, pz, turn);
			texturedBox(panel, fabric, [width, 1.25, 0.03], [0, 0.78, 0]);
			for (let p = -width / 2; p <= width / 2 + 0.01; p += width / 3)
				cylinder(panel, '#8b6d4c', 0.025, 1.5, [p, 0.7, 0]);
		}
		texturedBox(
			camp,
			towels[(i + 1) % towels.length],
			[0.9, 0.02, 1.8],
			[-0.6, 0.02, 0.1],
		).rotation.y = 0.1;
		if (i % 2)
			texturedBox(
				camp,
				towels[(i + 2) % towels.length],
				[0.9, 0.02, 1.8],
				[0.6, 0.02, 0.2],
			).rotation.y = -0.15;
		ellipsoid(camp, '#f1ece0', [0.25, 0.18, 0.18], [1.1, 0.12, -1.0]);
		at(lx, lz, 3.9, 3.5);
	}
	for (let i = 0; i < 5; i++) {
		const lz = -55 + i * 26 + next() * 8,
			lx = -14 + next() * 8;
		if (Math.abs(lz - BEACH.pier.z) < 8) continue;
		cylinder(props, '#f4f1e8', 0.035, 2.3, [lx, 1.15, lz]);
		const canopy = new THREE.Mesh(
			new THREE.ConeGeometry(1.5, 0.55, 16, 1, true),
			new THREE.MeshStandardMaterial({
				map: fabrics[(i + 2) % 4],
				side: THREE.DoubleSide,
				roughness: 0.8,
			}),
		);
		canopy.position.set(lx, 2.3, lz);
		canopy.rotation.z = (next() - 0.5) * 0.2;
		canopy.castShadow = true;
		props.add(canopy);
		texturedBox(
			props,
			towels[i % 4],
			[0.9, 0.02, 1.8],
			[lx + 0.7, 0.02, lz + 0.4],
		).rotation.y = next();
		at(lx, lz, 0.3, 0.3);
	}

	// The lifeguard's tall chair with its flag and life ring.
	const guard = placed(props, -9, 34, -Math.PI / 2);
	for (const gx of [-0.8, 0.8])
		for (const gz of [-0.6, 0.6]) {
			const leg = box(
				guard,
				'#e8e2d4',
				[0.12, 2.6, 0.12],
				[gx, 1.3, gz],
				0,
				'paint',
			);
			leg.rotation.z = -gx * 0.06;
		}
	box(guard, '#c8453c', [1.9, 0.12, 1.5], [0, 2.6, 0], 0, 'paint');
	box(guard, '#e8e2d4', [1.2, 0.5, 0.1], [0, 3.0, -0.55], 0, 'paint');
	box(guard, '#e8e2d4', [1.2, 0.08, 0.6], [0, 2.95, -0.25], 0, 'paint');
	for (let step = 0; step < 6; step++)
		box(
			guard,
			'#e8e2d4',
			[0.7, 0.05, 0.14],
			[0, 0.35 + step * 0.4, 0.85 + step * 0.05],
		);
	const roof = box(guard, '#c8453c', [2.4, 0.08, 2], [0, 4.3, 0], 0, 'paint');
	roof.rotation.x = 0.1;
	for (const gx of [-1, 1])
		box(guard, '#e8e2d4', [0.06, 1.3, 0.06], [gx * 1.05, 3.6, -0.8]);
	cylinder(guard, '#e8e2d4', 0.04, 6, [1.3, 3, 0.2]);
	box(guard, '#f4f1e8', [0.02, 0.55, 0.9], [1.3, 5.6, 0.65]);
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(0.32, 0.08, 8, 16),
		new THREE.MeshStandardMaterial({ color: '#e0492f', roughness: 0.6 }),
	);
	ring.position.set(-0.95, 1.8, 0);
	ring.rotation.y = Math.PI / 2;
	ring.castShadow = true;
	guard.add(ring);
	at(-9, 34, 2, 2.4);

	// An ice-cream kiosk and striped beach huts at the top of the beach.
	const kiosk = placed(props, 14, -22, -Math.PI / 2);
	box(kiosk, '#f2e7cf', [4, 2.6, 3], [0, 1.3, 0], 0, 'siding');
	box(kiosk, '#5b8fb0', [4.4, 0.18, 3.6], [0, 2.7, 0.15], 0, 'paint');
	const awning = texturedBox(
		kiosk,
		stripes(['#e27a3f', '#f7f1e3'], 10),
		[4.2, 0.05, 1.3],
		[0, 2.3, 2.05],
	);
	awning.rotation.x = 0.35;
	box(kiosk, '#3a4a55', [2.6, 1.0, 0.05], [0, 1.55, 1.51]);
	box(kiosk, '#c9a36b', [3, 0.1, 0.5], [0, 1.02, 1.7], 0, 'wood');
	for (const [kx, color] of [
		[-0.6, '#f3c6d6'],
		[0, '#f7e8b8'],
		[0.6, '#9fd2c4'],
	] as const) {
		ellipsoid(kiosk, color, [0.09, 0.09, 0.09], [kx, 1.25, 1.7]);
		cylinder(kiosk, '#d8a860', 0.02, 0.16, [kx, 1.12, 1.7], 0.08);
	}
	sign(props, 'sign.kiosk', 10.5, -25.5, -Math.PI / 2);
	at(14, -22, 3.2, 4.4);
	for (let i = 0; i < 4; i++) {
		const hut = placed(props, 16, -34 - i * 3.2, -Math.PI / 2);
		const fabric = fabrics[i % 4];
		texturedBox(hut, fabric, [2.2, 2.3, 2.2], [0, 1.2, 0]);
		const top = new THREE.Mesh(
			new THREE.ConeGeometry(1.75, 0.8, 4),
			new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.7 }),
		);
		top.position.y = 2.75;
		top.rotation.y = Math.PI / 4;
		top.castShadow = true;
		hut.add(top);
		box(hut, '#6b5139', [0.9, 1.8, 0.05], [0, 0.95, 1.11], 0, 'door');
	}
	at(16, -38.8, 2.4, 13);

	// Driftwood and shells.
	for (let i = 0; i < 9; i++) {
		const lx = -30 + next() * 26,
			lz = -140 + next() * 280;
		if (Math.abs(lz - BEACH.pier.z) < 6 || Math.abs(lz + 3.5) < 4) continue;
		const length = 1.6 + next() * 2.4;
		const log = cylinder(
			props,
			'#b8a790',
			0.14 + next() * 0.08,
			length,
			[lx, 0.14, lz],
			0.1,
			'wood',
		);
		log.rotation.z = Math.PI / 2;
		log.rotation.y = next() * Math.PI;
		at(lx, lz, length * 0.8, length * 0.8);
	}
	for (let i = 0; i < 90; i++)
		ellipsoid(
			props,
			['#f3ece0', '#e8c9b8', '#d9d2c4', '#9c948a'][i % 4],
			[0.05, 0.02, 0.04],
			[-36 + next() * 30, 0.01, -150 + next() * 300],
			0,
		);

	// A long wooden pier on piles: a ramp up from the sand, a railed deck and
	// a wide platform with a pavilion and benches at the far end.
	const pier = BEACH.pier;
	const { deck, platform } = pier;
	const pierGroup = placed(props, 0, pier.z);
	const plank = (lx: number, width: number) =>
		box(
			pierGroup,
			Math.round(lx / 0.6) % 2 ? '#9b7b58' : '#8a6c4c',
			[0.55, 0.1, width],
			[lx, deck - 0.05, 0],
			0,
			'boards',
		);
	const platformStart = pier.end + platform.length;
	for (let lx = pier.start; lx > platformStart; lx -= 0.6)
		plank(lx, pier.halfWidth * 2);
	for (let lx = platformStart; lx > pier.end; lx -= 0.6)
		plank(lx, platform.halfWidth * 2);
	// The ramp, sloping from the deck down onto the sand.
	const ramp = new THREE.Group();
	ramp.position.set(pier.start, deck - 0.05, 0);
	const run = pier.foot - pier.start;
	ramp.rotation.z = -Math.atan2(deck, run);
	pierGroup.add(ramp);
	const slope = Math.hypot(run, deck);
	for (let s = 0.3; s < slope; s += 0.6)
		box(
			ramp,
			Math.round(s / 0.6) % 2 ? '#9b7b58' : '#8a6c4c',
			[0.55, 0.1, pier.halfWidth * 2],
			[s, 0, 0],
			0,
			'boards',
		);
	// Piles into the sea bed, a white rail along both sides.
	for (let lx = pier.start - 2; lx > pier.end; lx -= 6) {
		const half = lx > platformStart ? pier.halfWidth : platform.halfWidth;
		for (const side of [-1, 1])
			cylinder(
				pierGroup,
				'#5d4a3a',
				0.16,
				deck + 6,
				[lx, deck - 0.12 - (deck + 6) / 2, side * (half - 0.25)],
				0.16,
				'post',
			);
	}
	const rail = (x0: number, x1: number, z0: number, z1: number) => {
		const length = Math.hypot(x1 - x0, z1 - z0);
		const angle = Math.atan2(z1 - z0, x1 - x0);
		const count = Math.max(1, Math.round(length / 3));
		for (let i = 0; i <= count; i++) {
			const t = i / count;
			box(
				pierGroup,
				'#e8e2d4',
				[0.12, 1.05, 0.12],
				[x0 + (x1 - x0) * t, deck + 0.5, z0 + (z1 - z0) * t],
				0,
				'paint',
			);
		}
		for (const y of [0.55, 1.05])
			box(
				pierGroup,
				'#e8e2d4',
				[length, 0.08, 0.08],
				[(x0 + x1) / 2, deck + y, (z0 + z1) / 2],
				-angle,
				'paint',
			);
		solids.push({
			x: X + (x0 + x1) / 2,
			z: Z + pier.z + (z0 + z1) / 2,
			w: Math.max(0.3, Math.abs(x1 - x0)),
			d: Math.max(0.3, Math.abs(z1 - z0)),
		});
	};
	for (const side of [-1, 1]) {
		const edge = side * pier.halfWidth,
			wide = side * platform.halfWidth;
		rail(pier.start, platformStart, edge, edge);
		// The ramp's sides are closed too, so nobody steps off its edge.
		solids.push({
			x: X + (pier.foot + pier.start) / 2,
			z: Z + pier.z + edge,
			w: pier.foot - pier.start,
			d: 0.3,
		});
		box(
			pierGroup,
			'#e8e2d4',
			[0.12, 1.05, 0.12],
			[pier.foot - 0.3, 0.5, edge],
			0,
			'paint',
		);
		rail(platformStart, platformStart, edge, wide);
		rail(platformStart, pier.end, wide, wide);
	}
	rail(pier.end, pier.end, -platform.halfWidth, platform.halfWidth);
	// The pavilion and benches facing the sunset.
	const pavilion = placed(pierGroup, pier.end + platform.length / 2, 0);
	for (const px of [-3.5, 3.5])
		for (const pz of [-3.5, 3.5]) {
			cylinder(pavilion, '#e8e2d4', 0.12, 3.2, [px, deck + 1.6, pz]);
			solids.push({
				x: X + pier.end + platform.length / 2 + px,
				z: Z + pier.z + pz,
				w: 0.35,
				d: 0.35,
			});
		}
	const cap = new THREE.Mesh(
		new THREE.ConeGeometry(5.6, 2, 8),
		new THREE.MeshStandardMaterial({ color: '#2f5aa8', roughness: 0.6 }),
	);
	cap.position.y = deck + 4.2;
	cap.rotation.y = Math.PI / 8;
	cap.castShadow = true;
	pavilion.add(cap);
	for (const pz of [-1, 1]) {
		const bench = placed(pierGroup, pier.end + 2.2, pz * 3.5, Math.PI / 2);
		box(bench, '#8a6c4c', [2.2, 0.08, 0.5], [0, deck + 0.45, 0], 0, 'wood');
		box(
			bench,
			'#8a6c4c',
			[2.2, 0.45, 0.08],
			[0, deck + 0.75, -0.22],
			0,
			'wood',
		);
		for (const bx of [-0.9, 0.9])
			box(
				bench,
				'#5d4a3a',
				[0.08, 0.45, 0.45],
				[bx, deck + 0.22, 0],
				0,
				'post',
			);
		solids.push({
			x: X + pier.end + 2.2,
			z: Z + pier.z + pz * 3.5,
			w: 0.6,
			d: 2.3,
		});
	}
	// A life ring on a post halfway out.
	const ringPost = placed(
		pierGroup,
		(pier.start + platformStart) / 2,
		pier.halfWidth - 0.1,
	);
	box(ringPost, '#e8e2d4', [0.12, 1.6, 0.12], [0, deck + 0.8, 0], 0, 'paint');
	const lifeRing = new THREE.Mesh(
		new THREE.TorusGeometry(0.3, 0.07, 8, 16),
		new THREE.MeshStandardMaterial({ color: '#e0492f', roughness: 0.6 }),
	);
	lifeRing.position.set(0, deck + 1.25, -0.1);
	lifeRing.castShadow = true;
	ringPost.add(lifeRing);

	// Marram grass on the dunes and pines beyond them.
	const tuft = tuftGeometry();
	const tuftMaterial = new THREE.MeshStandardMaterial({
		color: '#b9b27a',
		roughness: 0.85,
		side: THREE.DoubleSide,
	});
	tuftMaterial.name = 'marram';
	const spots: THREE.Matrix4[] = [];
	const matrix = new THREE.Matrix4(),
		quaternion = new THREE.Quaternion(),
		scale = new THREE.Vector3(),
		position = new THREE.Vector3();
	const trees: TreeSpec[] = [];
	for (let i = 0; i < 5200; i++) {
		const lx = BEACH.dunes - 1 + next() * 60,
			lz = -200 + next() * 400;
		if (inPark(lx, lz)) continue;
		const y = beachHeight(X + lx, Z + lz);
		if (next() > smooth(worldNoise(X + lx, Z + lz, 9, 3), 0.3, 0.55)) continue;
		quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, next() * 6.28);
		const size = 0.8 + next() * 0.9;
		spots.push(
			matrix
				.compose(
					position.set(X + lx, y - 0.05, Z + lz),
					quaternion,
					scale.set(size, size, size),
				)
				.clone(),
		);
	}
	const tufts = new THREE.InstancedMesh(tuft, tuftMaterial, spots.length);
	spots.forEach((m, i) => tufts.setMatrixAt(i, m));
	tufts.receiveShadow = true;
	tufts.computeBoundingSphere();
	root.add(tufts);
	for (let i = 0; i < 900; i++) {
		const lx = 44 + next() ** 0.7 * 260,
			lz = -300 + next() * 600;
		if (lx < 62 && Math.abs(lz) < 22) continue;
		const x = X + lx,
			z = Z + lz;
		trees.push({
			x,
			z,
			y: beachHeight(x, z) - 0.3,
			height: 9 + next() * 8,
			kind: 'conifer',
			variant: i,
			tint: 0.3 + next() * 0.4,
			rotation: next() * 6.28,
			castShadow: lx < 110,
		});
	}
	const forest = createForest(trees);
	scene.add(forest.group);

	// Gulls wheel above the surf.
	const gullMaterial = new THREE.MeshStandardMaterial({
		color: '#f4f4f0',
		roughness: 0.8,
		side: THREE.DoubleSide,
	});
	const flock = Array.from({ length: 7 }, (_, i) => ({
		...gull(root, gullMaterial),
		centre: new THREE.Vector3(
			X - 30 - next() * 40,
			9 + next() * 8,
			Z - 60 + next() * 120,
		),
		radius: 12 + next() * 18,
		speed: (0.18 + next() * 0.12) * (i % 2 ? 1 : -1),
		phase: next() * 6.28,
	}));

	props.position.set(X, 0, Z);
	mergeStatic(props);
	return {
		root,
		extra: [forest.group],
		grass: {
			mask: ground.mask,
			size: 440,
			flatRadius: 180,
			tint: [1.45, 1.3, 1.05] as [number, number, number],
		},
		ground: new THREE.Color('#b8a47e'),
		fog: 0.8,
		update(time: number, wind: number, windPhase: number) {
			seaUniforms.time.value = time;
			forest.update(windPhase, wind);
			for (const g of flock) {
				const a = g.phase + time * g.speed;
				g.bird.position.set(
					g.centre.x + Math.cos(a) * g.radius,
					g.centre.y + Math.sin(time * 0.7 + g.phase) * 1.5,
					g.centre.z + Math.sin(a) * g.radius,
				);
				g.bird.rotation.y = a + (g.speed > 0 ? Math.PI : 0);
				g.bird.rotation.z = Math.sign(g.speed) * 0.25;
				const flap = Math.sin(time * 7 + g.phase) * 0.45;
				g.wings[0].rotation.z = flap;
				g.wings[1].rotation.z = -flap;
			}
		},
	};
}
