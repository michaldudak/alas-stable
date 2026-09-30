import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Solid } from '../game/types.ts';
import { box, cylinder, ellipsoid, material, sign } from './primitives.ts';
import { placed } from './furniture.ts';
import { random, worldNoise } from './noise.ts';
import { createRegionGround } from './terrain.ts';
import { railFence } from './fences.ts';
import { mergeStatic } from '../rendering/merge.ts';
import { MOUNTAINS, PARKING } from './region-layout.ts';
import type { SurfaceUniforms } from './lamps.ts';
import type { Point } from './layout.ts';

const smooth = THREE.MathUtils.smoothstep;
const ridged = (x: number, z: number, scale: number, seed: number) =>
	1 - Math.abs(2 * worldNoise(x, z, scale, seed) - 1);

/** Ground height in the mountains: a flat valley floor ringed by peaks. */
export function mountainHeight(x: number, z: number) {
	const r = Math.hypot(x - MOUNTAINS.x, z - MOUNTAINS.z);
	if (r < MOUNTAINS.radius + 3) return 0;
	// Wooded foothills close by, then a wall of rocky peaks on the horizon.
	const foothills =
		smooth(r, MOUNTAINS.radius + 3, MOUNTAINS.radius + 90) *
		(12 + 34 * worldNoise(x, z, 60, 34));
	const massif =
		smooth(r, 400, 700) *
		(50 +
			190 * ridged(x, z, 240, 31) ** 2 +
			55 * worldNoise(x, z, 90, 32) +
			40 * ridged(x, z, 45, 33));
	return foothills + massif;
}

/** The valley trail: a loop of trodden snow past the hut and the tarn. */
function trail(): Point[] {
	const { x, z } = MOUNTAINS;
	return Array.from({ length: 48 }, (_, i) => {
		const a = (i / 48) * Math.PI * 2;
		const r = 92 + 14 * Math.sin(a * 3 + 1);
		return { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
	});
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

/** Stacked tiers of dark needles, each topped with a cap of snow. */
function spruceShapes() {
	const needles: THREE.BufferGeometry[] = [],
		snow: THREE.BufferGeometry[] = [];
	for (let i = 0; i < 5; i++) {
		const radius = 2.3 * (1 - i * 0.17),
			base = 1.1 + i * 1.55;
		const tier = new THREE.ConeGeometry(radius, 2.7, 9, 1);
		tier.translate(0, base + 1.35, 0);
		needles.push(tier);
		const cap = new THREE.ConeGeometry(radius * 0.86, 1.35, 9, 1);
		cap.translate(0, base + 2.05, 0);
		snow.push(cap);
	}
	const trunk = new THREE.CylinderGeometry(0.2, 0.32, 2.4, 7);
	trunk.translate(0, 1.2, 0);
	return {
		trunk,
		needles: mergeGeometries(needles),
		snow: mergeGeometries(snow),
	};
}

const smokeVertex = /* glsl */ `
attribute float seed;
uniform float time;
varying float vFade;
void main() {
	float age = fract(time * 0.12 + seed);
	vec3 p = position;
	p.y += age * 9.0;
	p.x += sin(seed * 40.0 + time * 0.6) * age * 1.6 + age * age * 3.0;
	p.z += cos(seed * 23.0 + time * 0.4) * age * 1.2;
	vFade = (1.0 - age) * smoothstep(0.0, 0.08, age);
	vec4 view = modelViewMatrix * vec4(p, 1.0);
	gl_Position = projectionMatrix * view;
	gl_PointSize = (90.0 + age * 260.0) / -view.z;
}`;

const smokeFragment = /* glsl */ `
uniform vec3 color;
varying float vFade;
void main() {
	float d = length(gl_PointCoord - 0.5) * 2.0;
	float puff = pow(max(0.0, 1.0 - d), 1.6);
	gl_FragColor = vec4(color, puff * vFade * 0.35);
}`;

/** Wood smoke curling from a chimney. */
function chimneySmoke(x: number, y: number, z: number) {
	const count = 40;
	const positions = new Float32Array(count * 3),
		seeds = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		positions.set([x, y, z], i * 3);
		seeds[i] = i / count;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
	const uniforms = {
		time: { value: 0 },
		color: { value: new THREE.Color('#d8dde2') },
	};
	const smoke = new THREE.Points(
		geometry,
		new THREE.ShaderMaterial({
			name: 'ChimneySmoke',
			uniforms,
			vertexShader: smokeVertex,
			fragmentShader: smokeFragment,
			transparent: true,
			depthWrite: false,
		}),
	);
	smoke.frustumCulled = false;
	smoke.renderOrder = 2;
	return { smoke, uniforms };
}

/** A snowman with a carrot nose, coal eyes, a scarf and stick arms. */
function snowman(parent: THREE.Object3D, scarf: string) {
	ellipsoid(parent, '#f7f9fc', [0.55, 0.5, 0.55], [0, 0.45, 0], 2);
	ellipsoid(parent, '#f7f9fc', [0.4, 0.38, 0.4], [0, 1.18, 0], 2);
	ellipsoid(parent, '#f7f9fc', [0.28, 0.27, 0.28], [0, 1.72, 0], 2);
	const nose = cylinder(parent, '#e27a3f', 0.05, 0.28, [0, 1.72, 0.36], 0.005);
	nose.rotation.x = Math.PI / 2;
	for (const side of [-1, 1]) {
		ellipsoid(parent, '#1f2123', [0.035, 0.035, 0.02], [side * 0.1, 1.8, 0.25]);
		const arm = cylinder(
			parent,
			'#5a3f2b',
			0.02,
			0.8,
			[side * 0.62, 1.3, 0],
			0.012,
			'wood',
		);
		arm.rotation.z = side * 1.1;
	}
	for (let i = 0; i < 3; i++)
		ellipsoid(
			parent,
			'#1f2123',
			[0.04, 0.04, 0.03],
			[0, 1.08 + i * 0.14, 0.37 - i * 0.02],
		);
	const wrap = cylinder(parent, scarf, 0.3, 0.12, [0, 1.48, 0], 0.26, 'plain');
	wrap.castShadow = true;
	box(
		parent,
		scarf,
		[0.12, 0.4, 0.04],
		[0.14, 1.28, 0.27],
		0,
		'plain',
	).rotation.z = 0.15;
	cylinder(parent, '#2b2622', 0.2, 0.28, [0, 2.05, 0], 0.2, 'plain');
	cylinder(parent, '#2b2622', 0.3, 0.03, [0, 1.92, 0], 0.3, 'plain');
}

/**
 * A snowy valley ringed by peaks: a log mountain hut with smoke rising from
 * its chimney, a fenced frozen tarn, snowy spruces, snowmen, a hay rack for
 * the deer and a trail marked in red and white.
 */
export function createMountains(
	scene: THREE.Scene,
	solids: Solid[],
	surface: SurfaceUniforms,
) {
	const { x: X, z: Z } = MOUNTAINS;
	const root = new THREE.Group();
	root.name = 'mountains';
	scene.add(root);
	const props = new THREE.Group();
	props.position.set(X, 0, Z);
	root.add(props);
	const fences = new THREE.Group();
	root.add(fences);
	const at = (x: number, z: number, w: number, d: number) =>
		solids.push({ x: X + x, z: Z + z, w, d });
	const path = trail();
	const parking = PARKING.mountains;
	const hut = MOUNTAINS.hut,
		tarn = MOUNTAINS.tarn;
	// Spurs to the car park and past the hut; the loop is searched by angle.
	const spurs: { a: Point; b: Point; width: number }[] = [
		{
			a: { x: parking.x, z: parking.z - 10 },
			b: { x: X + 4, z: Z + 100 },
			width: 3.4,
		},
		{
			a: { x: X + hut.x + hut.halfWidth + 2, z: Z + hut.z },
			b: { x: X - 60, z: Z - 62 },
			width: 2.4,
		},
	];
	/** Distance to the nearest trodden track, in track half-widths. */
	const trodden = (x: number, z: number) => {
		let best = 9;
		const lx = x - X,
			lz = z - Z;
		if (Math.abs(Math.hypot(lx, lz) - 92) < 20) {
			const turn = (Math.atan2(lx, lz) / (Math.PI * 2) + 1) % 1;
			const i = Math.floor(turn * path.length);
			for (let k = -1; k <= 1; k++) {
				const j = (i + k + path.length) % path.length;
				best = Math.min(
					best,
					segmentDistance({ x, z }, path[j], path[(j + 1) % path.length]) / 2.6,
				);
			}
		}
		for (const { a, b, width } of spurs)
			best = Math.min(best, segmentDistance({ x, z }, a, b) / width);
		return best;
	};
	const ground = createRegionGround(
		{
			origin: MOUNTAINS,
			size: 400,
			resolution: 768,
			flatRadius: MOUNTAINS.radius + 3,
			segments: 384,
			growth: 0.025,
			height: mountainHeight,
			outside: [0, 0, 0, 0],
			woodedHills: 0,
			snow: 1,
			rock: 1,
			paint(x, z) {
				const packed = 1 - smooth(trodden(x, z), 0.55, 1.1);
				const lx = x - X,
					lz = z - Z;
				const yard =
					Math.abs(lx - hut.x) < hut.halfWidth + 3 &&
					Math.abs(lz - hut.z) < hut.halfDepth + 3
						? 0.5
						: 0;
				const park =
					Math.abs(x - parking.x) < 4 && Math.abs(z - parking.z + 1) < 11
						? 0.7
						: 0;
				return [0, Math.max(packed * 0.8, yard, park), 0, 0];
			},
		},
		surface,
	);
	root.add(ground.ground);
	// The frozen tarn: ice with drifts of snow, fenced all round.
	const ice = new THREE.Mesh(
		new THREE.CircleGeometry(1, 48),
		new THREE.MeshStandardMaterial({
			color: '#b9d4e3',
			roughness: 0.12,
			metalness: 0.05,
		}),
	);
	ice.rotation.x = -Math.PI / 2;
	ice.scale.set(tarn.radiusX, tarn.radiusZ, 1);
	ice.position.set(X + tarn.x, 0.03, Z + tarn.z);
	ice.receiveShadow = true;
	root.add(ice);
	const next = random(3131);
	for (let i = 0; i < 14; i++) {
		const a = next() * Math.PI * 2,
			r = 0.3 + next() * 0.55;
		const drift = new THREE.Mesh(
			new THREE.CircleGeometry(1, 16),
			material('#f1f5fa', 'plain'),
		);
		drift.rotation.x = -Math.PI / 2;
		drift.scale.set(2 + next() * 3, 1 + next() * 2, 1);
		drift.position.set(
			X + tarn.x + Math.cos(a) * r * tarn.radiusX,
			0.04,
			Z + tarn.z + Math.sin(a) * r * tarn.radiusZ,
		);
		drift.rotation.z = next() * 3;
		root.add(drift);
	}
	const shore: Point[] = Array.from({ length: 29 }, (_, i) => {
		const a = (i / 28) * Math.PI * 2;
		return {
			x: X + tarn.x + Math.cos(a) * (tarn.radiusX + 2.5),
			z: Z + tarn.z + Math.sin(a) * (tarn.radiusZ + 2.5),
		};
	});
	railFence(fences, solids, shore, {
		post: '#6b5139',
		rail: '#8a6a4a',
		rails: [0.5, 0.95],
		postHeight: 1.2,
		spacing: 3,
		finish: 'wood',
		jumpable: false,
	});

	// The mountain hut: a log cabin under a steep, snow-laden roof.
	const cabin = placed(props, hut.x, hut.z);
	const logs = '#7a5a3e';
	const { halfWidth: hw, halfDepth: hd } = hut;
	for (let i = 0; i < 11; i++) {
		const y = 0.16 + i * 0.28;
		for (const side of [-1, 1]) {
			const along = cylinder(
				cabin,
				logs,
				0.16,
				hw * 2 + 0.6,
				[0, y, side * hd],
				0.16,
				'wood',
			);
			along.rotation.z = Math.PI / 2;
			const across = cylinder(
				cabin,
				logs,
				0.16,
				hd * 2 + 0.6,
				[side * hw, y + 0.14, 0],
				0.16,
				'wood',
			);
			across.rotation.x = Math.PI / 2;
		}
	}
	const wallTop = 3.2,
		rise = 3.4;
	const pitch = Math.atan2(rise, hd + 0.8),
		span = Math.hypot(hd + 0.8, rise);
	for (const side of [-1, 1]) {
		const slope = box(
			cabin,
			'#5a4636',
			[hw * 2 + 1.6, 0.22, span],
			[0, wallTop + rise / 2, (side * (hd + 0.8)) / 2],
			0,
			'roofing',
		);
		slope.rotation.x = side * pitch;
		const snowLayer = box(
			cabin,
			'#f4f7fb',
			[hw * 2 + 1.5, 0.3, span - 0.1],
			[
				0,
				wallTop + rise / 2 + 0.25 * Math.cos(pitch),
				(side * (hd + 0.8)) / 2 + side * 0.25 * Math.sin(pitch),
			],
			0,
			'plain',
		);
		snowLayer.rotation.x = side * pitch;
	}
	const gable = new THREE.Shape();
	gable.moveTo(-hd, 0);
	gable.lineTo(hd, 0);
	gable.lineTo(0, rise);
	gable.closePath();
	for (const side of [-1, 1]) {
		const end = new THREE.Mesh(
			new THREE.ShapeGeometry(gable),
			material('#6e5038', 'boards'),
		);
		end.position.set(side * (hw + 0.16), wallTop, 0);
		end.rotation.y = side * (Math.PI / 2);
		end.castShadow = true;
		cabin.add(end);
	}
	// Windows glowing warm, a door and a porch on the east end.
	const warm = new THREE.MeshStandardMaterial({
		color: '#f2d9a8',
		emissive: '#ffb865',
		emissiveIntensity: 0.3,
		roughness: 0.3,
	});
	warm.name = 'hut-window';
	for (const side of [-1, 1])
		for (const wx of [-3.4, 0, 3.4]) {
			const pane = box(
				cabin,
				'#f2d9a8',
				[1.1, 1.0, 0.1],
				[wx, 1.7, side * (hd + 0.14)],
			);
			pane.material = warm;
			for (const s of [-1, 1])
				box(
					cabin,
					'#2f5a3d',
					[0.5, 1.1, 0.06],
					[wx + s * 0.85, 1.7, side * (hd + 0.2)],
					0,
					'paint',
				);
			box(
				cabin,
				'#f4f7fb',
				[1.3, 0.12, 0.35],
				[wx, 1.13, side * (hd + 0.25)],
				0,
				'plain',
			);
		}
	box(cabin, '#4a3526', [0.12, 2.3, 1.3], [hw + 0.2, 1.15, 0], 0, 'door');
	const light = box(cabin, '#f2d9a8', [0.1, 0.8, 0.8], [-hw - 0.2, 1.8, 0]);
	light.material = warm;
	for (const s of [-1, 1])
		box(cabin, logs, [0.2, 2.8, 0.2], [hw + 2, 1.4, s * 1.6], 0, 'post');
	const porch = box(
		cabin,
		'#5a4636',
		[2.6, 0.16, 4],
		[hw + 1.1, 2.85, 0],
		0,
		'roofing',
	);
	porch.rotation.z = -0.3;
	box(
		cabin,
		'#f4f7fb',
		[2.5, 0.2, 3.9],
		[hw + 1.1, 3.02, 0],
		0,
		'plain',
	).rotation.z = -0.3;
	box(cabin, '#6b5139', [0.5, 0.08, 1.6], [hw + 0.6, 0.5, 2.9], 0, 'wood');
	// Stone chimney with smoke; firewood stacked along the south wall.
	box(
		cabin,
		'#8f8877',
		[0.8, 3.4, 0.8],
		[-hw + 1.6, wallTop + 2.4, -1.2],
		0,
		'concrete',
	);
	const smoke = chimneySmoke(
		X + hut.x - hw + 1.6,
		wallTop + 4.2,
		Z + hut.z - 1.2,
	);
	root.add(smoke.smoke);
	for (let row = 0; row < 4; row++)
		for (let i = 0; i < 12; i++) {
			const log = cylinder(
				cabin,
				i % 3 ? '#9a7652' : '#8a6645',
				0.13,
				1.1,
				[-3 + i * 0.28 + (row % 2) * 0.14, 0.13 + row * 0.25, hd + 0.9],
				0.13,
				'wood',
			);
			log.rotation.x = Math.PI / 2;
		}
	box(cabin, '#f4f7fb', [3.5, 0.12, 1.2], [-1.45, 1.1, hd + 0.9], 0, 'plain');
	// Skis leaning by the door and a wooden sledge.
	for (const s of [0, 0.25]) {
		const ski = box(
			cabin,
			s ? '#c8453c' : '#2f5aa8',
			[0.09, 1.9, 0.03],
			[hw + 0.35, 0.95, -1.1 - s],
			0,
			'paint',
		);
		ski.rotation.x = -0.15;
	}
	const sledge = placed(props, hut.x + hw + 4, hut.z + 4, 0.4);
	for (const s of [-1, 1]) {
		box(sledge, '#8a6645', [0.08, 0.08, 1.8], [s * 0.35, 0.08, 0], 0, 'wood');
		box(sledge, '#8a6645', [0.06, 0.3, 0.06], [s * 0.35, 0.25, 0.6], 0, 'post');
		box(
			sledge,
			'#8a6645',
			[0.06, 0.3, 0.06],
			[s * 0.35, 0.25, -0.6],
			0,
			'post',
		);
	}
	box(sledge, '#b8453c', [0.8, 0.06, 1.5], [0, 0.42, 0], 0, 'paint');
	sign(props, 'sign.hut', hut.x + hw + 3.2, hut.z - 3.4, Math.PI / 2);
	at(hut.x, hut.z, hw * 2 + 0.7, hd * 2 + 3.2);
	at(hut.x + hw + 2, hut.z - 1.6, 0.3, 0.3);
	at(hut.x + hw + 2, hut.z + 1.6, 0.3, 0.3);
	at(hut.x + hw + 4, hut.z + 4, 1.2, 1.8);

	// Snowmen, a hay rack for the deer and a trail signpost.
	for (const [sx, sz, scarf] of [
		[-12, -30, '#c8453c'],
		[-18, -24, '#2f5aa8'],
		[20, 70, '#3f8a6b'],
	] as const) {
		snowman(placed(props, sx, sz, next() * 1.5 - 0.75), scarf);
		at(sx, sz, 1.1, 1.1);
	}
	const rack = placed(props, -70, 30, 0.6);
	for (const s of [-1, 1])
		for (const e of [-1, 1])
			box(
				rack,
				'#6b5139',
				[0.16, 2.2, 0.16],
				[s * 1.3, 1.1, e * 0.7],
				0,
				'post',
			);
	for (let i = 0; i < 9; i++)
		box(
			rack,
			'#8a6a4a',
			[0.05, 0.9, 0.05],
			[-1.2 + i * 0.3, 1.25, 0],
			0,
			'wood',
		).rotation.x = 0.35;
	box(rack, '#c9ae6a', [2.4, 0.5, 0.8], [0, 1.6, 0.05], 0, 'straw');
	const rackRoof = box(
		rack,
		'#5a4636',
		[3.1, 0.12, 2],
		[0, 2.35, 0],
		0,
		'roofing',
	);
	rackRoof.rotation.x = 0.1;
	box(rack, '#f4f7fb', [3.0, 0.18, 1.9], [0, 2.48, 0], 0, 'plain').rotation.x =
		0.1;
	at(-70, 30, 3.2, 2.4);
	const post = placed(props, 14, 96, -0.3);
	cylinder(post, '#8a6a4a', 0.1, 2.8, [0, 1.4, 0], 0.1, 'post');
	for (const [y, color] of [
		[2.05, '#f4f1e8'],
		[1.95, '#c8453c'],
		[1.85, '#f4f1e8'],
	] as const)
		cylinder(post, color, 0.105, 0.1, [0, y, 0], 0.105, 'paint');
	for (const [y, turn] of [
		[2.5, 0.4],
		[2.2, -0.9],
	] as const) {
		const arrow = box(
			post,
			'#e9c341',
			[1.2, 0.22, 0.05],
			[0.5, y, 0],
			0,
			'paint',
		);
		arrow.rotation.y = turn;
	}
	at(14, 96, 0.3, 0.3);

	// Snowy spruces on the lower slopes and in groves on the valley floor.
	const parts = spruceShapes();
	const specs: THREE.Matrix4[] = [];
	const matrix = new THREE.Matrix4(),
		quaternion = new THREE.Quaternion(),
		scale = new THREE.Vector3(),
		position = new THREE.Vector3();
	const clear = (lx: number, lz: number) =>
		Math.hypot(lx - hut.x, lz - hut.z) < 16 ||
		((lx - tarn.x) / (tarn.radiusX + 7)) ** 2 +
			((lz - tarn.z) / (tarn.radiusZ + 7)) ** 2 <
			1 ||
		(Math.abs(X + lx - parking.x) < 10 && Math.abs(Z + lz - parking.z) < 22) ||
		trodden(X + lx, Z + lz) < 2.2;
	for (let i = 0; i < 2600 && specs.length < 900; i++) {
		const a = next() * Math.PI * 2,
			r = next() < 0.25 ? 40 + next() * 105 : 156 + next() ** 1.6 * 260;
		const lx = Math.sin(a) * r,
			lz = Math.cos(a) * r;
		if (r < 150 && (worldNoise(X + lx, Z + lz, 30, 44) < 0.55 || clear(lx, lz)))
			continue;
		const y = mountainHeight(X + lx, Z + lz);
		if (y > 170) continue;
		const size = 0.7 + next() * 0.8;
		quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, next() * 6.28);
		specs.push(
			matrix
				.compose(
					position.set(X + lx, y - 0.2, Z + lz),
					quaternion,
					scale.set(size, size * (0.9 + next() * 0.3), size),
				)
				.clone(),
		);
		if (r < 152)
			solids.push({ x: X + lx, z: Z + lz, w: 0.9 * size, d: 0.9 * size });
	}
	for (const [geometry, color] of [
		[parts.trunk, '#4f3a2a'],
		[parts.needles, '#2c4636'],
		[parts.snow, '#f3f6fa'],
	] as const) {
		const mesh = new THREE.InstancedMesh(
			geometry,
			new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
			specs.length,
		);
		specs.forEach((m, i) => mesh.setMatrixAt(i, m));
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		root.add(mesh);
	}
	mergeStatic(props);
	mergeStatic(fences);
	return {
		root,
		ground: new THREE.Color('#dfe6ef'),
		fog: 0.22,
		snowy: true,
		update(time: number, darkness: number) {
			smoke.uniforms.time.value = time;
			warm.emissiveIntensity =
				0.3 + THREE.MathUtils.smoothstep(darkness, 0.2, 0.7) * 1.6;
		},
	};
}
