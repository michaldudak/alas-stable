import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Solid } from '../game/types.ts';
import { box, cylinder, ellipsoid, sign } from './primitives.ts';
import { paintedTexture, placed, stripes, texturedBox } from './furniture.ts';
import { random, worldNoise } from './noise.ts';
import { createRegionGround } from './terrain.ts';
import { createForest, type TreeSpec } from './trees.ts';
import { arc, railFence } from './fences.ts';
import { mergeStatic } from '../rendering/merge.ts';
import { HIPPODROME, PARKING, hippodromeDistance } from './region-layout.ts';
import type { SurfaceUniforms } from './lamps.ts';
import type { Point } from './layout.ts';
import { STABLES, halfDepth, insideStable } from './stable-layout.ts';
import { onLanguageChange, t } from '../i18n/index.ts';

const smooth = THREE.MathUtils.smoothstep;

/** Ground height at the racecourse: flat, with low wooded hills beyond. */
export function hippodromeHeight(x: number, z: number) {
	const r = Math.hypot(x - HIPPODROME.x, z - HIPPODROME.z);
	return (
		smooth(r, HIPPODROME.radius + 170, 620) *
		(18 + 46 * worldNoise(x, z, 120, 61))
	);
}

/** The spectators' shared body: a coat and a head, about a metre and a half. */
function spectatorGeometry() {
	const body = new THREE.CapsuleGeometry(0.22, 0.55, 3, 8);
	body.translate(0, 0.5, 0);
	const head = new THREE.SphereGeometry(0.14, 10, 8);
	head.translate(0, 1.08, 0);
	for (const part of [body, head]) part.deleteAttribute('uv');
	return mergeGeometries([body, head]);
}

/**
 * A grand racecourse: a wide dirt track inside white rails, a covered
 * grandstand full of spectators who cheer as the horses pass, a judge's
 * tower and striped finishing posts, a starting gate, a tote board, a pond
 * and flower beds in the infield, the racing stables and wooded hills around.
 */
export function createHippodrome(
	scene: THREE.Scene,
	solids: Solid[],
	surface: SurfaceUniforms,
) {
	const { x: X, z: Z, straight, radius: R, halfWidth: hw } = HIPPODROME;
	const root = new THREE.Group();
	root.name = 'hippodrome';
	scene.add(root);
	const props = new THREE.Group();
	props.position.set(X, 0, Z);
	root.add(props);
	const rails = new THREE.Group();
	root.add(rails);
	const at = (x: number, z: number, w: number, d: number) =>
		solids.push({ x: X + x, z: Z + z, w, d });
	const parking = PARKING.hippodrome;
	const stand = HIPPODROME.stand;
	const pond = { x: -52, z: 0, rx: 20, rz: 11 };
	const inPond = (lx: number, lz: number, margin = 0) =>
		((lx - pond.x) / (pond.rx + margin)) ** 2 +
			((lz - pond.z) / (pond.rz + margin)) ** 2 <
		1;
	// Gravel lanes from the car park and from the racing stables' south door
	// to the opening in the outer rail.
	const racing = STABLES.find((spec) => spec.id === 'racing')!;
	const opening = { x: X + HIPPODROME.gateX, z: Z - R - hw - 1 };
	const stableDoor = { x: racing.x, z: racing.z + halfDepth(racing) + 3 };
	const lanes: [Point, Point][] = [
		[{ x: parking.x + 8, z: parking.z }, opening],
		[stableDoor, { x: racing.x + 30, z: opening.z - 6 }],
		[{ x: racing.x + 30, z: opening.z - 6 }, opening],
	];
	const laneDistance = (x: number, z: number) =>
		Math.min(
			...lanes.map(([a, b]) => {
				const abx = b.x - a.x,
					abz = b.z - a.z;
				const k = THREE.MathUtils.clamp(
					((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz),
					0,
					1,
				);
				return Math.hypot(x - a.x - abx * k, z - a.z - abz * k);
			}),
		);
	/** Inside the racing stables, or on the trodden aprons at their doors. */
	const stableGround = (x: number, z: number) =>
		Math.abs(x - racing.x) < 5 && Math.abs(z - racing.z) < halfDepth(racing) + 8
			? 1
			: insideStable(x, z, 0.5)
				? 1
				: 0;
	const ground = createRegionGround(
		{
			origin: HIPPODROME,
			size: 460,
			resolution: 1024,
			flatRadius: 215,
			segments: 256,
			height: hippodromeHeight,
			outside: [0, 0, 0.5, 1],
			woodedHills: 1,
			paint(x, z) {
				const lx = x - X,
					lz = z - Z;
				const track =
					1 - smooth(Math.abs(hippodromeDistance(x, z)), hw - 0.3, hw + 0.4);
				const gravel = Math.max(
					1 - smooth(laneDistance(x, z), 2.2, 3.2),
					Math.abs(x - parking.x) < 12 && Math.abs(z - parking.z) < 6 ? 0.9 : 0,
					Math.abs(lx - stand.x) < stand.halfWidth + 3 &&
						lz > stand.z - stand.depth / 2 - 4 &&
						lz < stand.z + stand.depth / 2 + 3
						? 0.8
						: 0,
				);
				const infield = hippodromeDistance(x, z) < -hw ? 1 : 0;
				const dirt = Math.max(track, gravel, stableGround(x, z) * 0.85);
				const grass =
					(1 - dirt) * (inPond(lx, lz, 1) || stableGround(x, z) ? 0 : 1);
				return [0, dirt, 0.55 + infield * 0.35, grass * (infield ? 0.55 : 1)];
			},
		},
		surface,
	);
	root.add(ground.ground);

	// White running rails, the outer one open towards the car park.
	const inner = R - hw - 0.5,
		outer = R + hw + 0.5;
	const railStyle = {
		post: '#f4f1e8',
		rail: '#f7f4ec',
		rails: [1.05],
		postHeight: 1.15,
		spacing: 3,
	};
	const world = (points: Point[]) =>
		points.map((p) => ({ x: X + p.x, z: Z + p.z }));
	railFence(
		rails,
		solids,
		world([
			{ x: HIPPODROME.gateX + HIPPODROME.gateHalfWidth, z: -outer },
			...arc(straight, 0, outer, Math.PI, 0),
			...arc(-straight, 0, outer, 0, -Math.PI),
			{ x: HIPPODROME.gateX - HIPPODROME.gateHalfWidth, z: -outer },
		]),
		{ ...railStyle, rails: [0.55, 1.05] },
	);
	railFence(
		rails,
		solids,
		world([
			...arc(straight, 0, inner, Math.PI, 0),
			...arc(-straight, 0, inner, 0, -Math.PI),
			{ x: straight, z: -inner },
		]),
		railStyle,
	);
	// Distance poles on the inner rail, every hundred metres.
	for (let i = 1; i < 8; i++) {
		const s = i * 100;
		let px = 0,
			pz = inner + 0.6;
		if (s < straight) px = s;
		else if (s < straight + Math.PI * inner) {
			const a = (s - straight) / inner;
			px = straight + Math.sin(a) * (inner + 0.6);
			pz = Math.cos(a) * (inner + 0.6);
		} else continue;
		cylinder(props, i % 2 ? '#c8453c' : '#2f5aa8', 0.07, 1.8, [px, 0.9, pz]);
	}

	// The start and finish: a painted line, the start box behind it and
	// striped posts carrying the finishing disc.
	box(props, '#f7f4ec', [0.3, 0.02, hw * 2], [0, 0.02, R], 0, 'plain');
	for (const [bx, bz, w, d] of [
		[-5.5, R - hw + 0.1, 9, 0.12],
		[-5.5, R - hw + 4.2, 9, 0.12],
		[-10, R - hw + 2.15, 0.12, 4.2],
	] as const)
		box(props, '#f7f4ec', [w, 0.02, d], [bx, 0.02, bz], 0, 'plain');
	for (const edge of [inner - 0.7, outer + 0.7]) {
		for (let i = 0; i < 6; i++)
			box(
				props,
				i % 2 ? '#f7f4ec' : '#b8453c',
				[0.2, 0.5, 0.2],
				[0, 0.25 + i * 0.5, edge],
				0,
				'paint',
			);
		const disc = cylinder(props, '#b8453c', 0.55, 0.06, [0, 3.35, edge]);
		disc.rotation.x = Math.PI / 2;
		const middle = cylinder(props, '#f7f4ec', 0.3, 0.07, [0, 3.35, edge]);
		middle.rotation.x = Math.PI / 2;
		at(0, edge, 0.3, 0.3);
	}
	// The judges' tower beside the finish, on the infield.
	const tower = placed(props, 0, inner - 6);
	for (const tx of [-1.2, 1.2])
		for (const tz of [-1.2, 1.2])
			box(tower, '#e8e2d4', [0.25, 6, 0.25], [tx, 3, tz], 0, 'paint');
	box(tower, '#f2ece0', [3.4, 2.4, 3.4], [0, 7.2, 0], 0, 'siding');
	const towerGlass = box(tower, '#3a4a55', [3.42, 1.1, 2.6], [0, 7.5, 0]);
	towerGlass.castShadow = false;
	box(tower, '#2f5a3d', [4, 0.25, 4], [0, 8.5, 0], 0, 'roofing');
	cylinder(tower, '#e8e2d4', 0.05, 3, [0, 10, 0]);
	box(tower, '#c8453c', [1.1, 0.7, 0.03], [0.55, 11.1, 0], 0, 'plain');
	at(0, inner - 6, 3, 3);
	// A starting gate standing ready on the infield.
	const gate = placed(props, -30, inner - 7);
	const green = '#3f6b4f';
	for (let i = 0; i <= 6; i++) {
		const gx = -7.2 + i * 2.4;
		box(gate, green, [0.14, 2.6, 3.6], [gx, 1.6, 0], 0, 'paint');
		if (i < 6) {
			const number = paintedTexture(64, 64, (c) => {
				c.fillStyle = [
					'#c8453c',
					'#f7f4ec',
					'#2f5aa8',
					'#e9c341',
					'#3f8a6b',
					'#1f2123',
				][i];
				c.fillRect(0, 0, 64, 64);
				c.fillStyle = i === 1 || i === 3 ? '#1f2123' : '#f7f4ec';
				c.font = 'bold 44px sans-serif';
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.fillText(String(i + 1), 32, 35);
			});
			texturedBox(gate, number, [0.7, 0.7, 0.05], [gx + 1.2, 3.1, 1.83]);
			for (const s of [-1, 1])
				box(
					gate,
					green,
					[2.2, 0.08, 0.08],
					[gx + 1.2, 2.2, s * 1.8],
					0,
					'paint',
				);
		}
	}
	box(gate, green, [15, 0.3, 3.8], [0, 3.05, 0], 0, 'paint');
	for (const s of [-1, 1]) {
		box(gate, '#1f2123', [0.3, 0.9, 0.9], [s * 7.6, 0.45, 0], 0, 'plain');
		const tyre = cylinder(gate, '#1f2123', 0.45, 0.3, [s * 7.6, 0.45, 1.6]);
		tyre.rotation.z = Math.PI / 2;
	}
	at(-30, inner - 7, 15.5, 4);

	// The covered grandstand, full of spectators.
	const standGroup = placed(props, stand.x, stand.z - stand.depth / 2);
	const rows = 9,
		rowDepth = 1.8,
		rowRise = 0.6,
		width = stand.halfWidth * 2;
	for (let row = 0; row < rows; row++) {
		const top = 0.5 + row * rowRise;
		box(
			standGroup,
			'#bdb6a8',
			[width, top, rowDepth],
			[0, top / 2, 1 + row * rowDepth],
			0,
			'concrete',
		);
		box(
			standGroup,
			row % 2 ? '#2f5aa8' : '#3f6b8c',
			[width - 0.6, 0.12, 0.5],
			[0, top + 0.2, 0.8 + row * rowDepth],
			0,
			'paint',
		);
	}
	const back = 1 + rows * rowDepth;
	box(
		standGroup,
		'#e4dccb',
		[width + 1, 7.5, 0.4],
		[0, 3.75, back],
		0,
		'siding',
	);
	for (const s of [-1, 1])
		box(
			standGroup,
			'#e4dccb',
			[0.4, 7.5, back + 0.5],
			[s * (width / 2 + 0.5), 3.75, back / 2 - 0.2],
			0,
			'siding',
		);
	for (let c = -4; c <= 4; c++)
		box(
			standGroup,
			'#f4f1e8',
			[0.35, 10, 0.35],
			[c * (width / 8.5), 5, 0.2],
			0,
			'paint',
		);
	const canopy = box(
		standGroup,
		'#2f5a3d',
		[width + 3, 0.35, back + 3],
		[0, 10.4, back / 2 - 0.3],
		0,
		'roofing',
	);
	canopy.rotation.x = -0.06;
	const valance = texturedBox(
		standGroup,
		stripes(['#2f5a3d', '#f4f1e8'], 40),
		[width + 3, 0.7, 0.08],
		[0, 9.9, -1.2],
	);
	valance.castShadow = false;
	// Flags along the roof.
	for (let f = -5; f <= 5; f++) {
		cylinder(standGroup, '#e8e2d4', 0.05, 3, [
			f * (width / 10.5),
			12,
			back - 1,
		]);
		box(
			standGroup,
			['#c8453c', '#e9c341', '#2f5aa8', '#3f8a6b'][(f + 5) % 4],
			[1.3, 0.8, 0.03],
			[f * (width / 10.5) + 0.68, 13, back - 1],
			0,
			'plain',
		);
	}
	const title = paintedTexture(1024, 128, (c, w, h) => {
		c.fillStyle = '#2f5a3d';
		c.fillRect(0, 0, w, h);
		c.fillStyle = '#f4f1e8';
		c.font = '600 72px sans-serif';
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillText(t('sign.hippodrome'), w / 2, h / 2 + 4);
	});
	texturedBox(standGroup, title, [18, 2.2, 0.1], [0, 8.8, -1.3]).castShadow =
		false;
	at(stand.x, stand.z, width + 2, stand.depth + 2);
	// Spectators fill most seats; they cheer as the horses gallop past.
	const next = random(90210);
	const crowd: { x: number; y: number; z: number }[] = [];
	for (let row = 0; row < rows; row++)
		for (
			let seat = -stand.halfWidth + 1;
			seat < stand.halfWidth - 1;
			seat += 0.75
		)
			if (next() < 0.72)
				crowd.push({
					x: stand.x + seat + (next() - 0.5) * 0.2,
					y: 0.5 + row * rowRise,
					z: stand.z - stand.depth / 2 + 1.1 + row * rowDepth,
				});
	const excitement = { value: 0 },
		time = { value: 0 };
	const people = new THREE.InstancedMesh(
		spectatorGeometry(),
		new THREE.MeshStandardMaterial({ roughness: 0.8 }),
		crowd.length,
	);
	people.material.onBeforeCompile = (shader) => {
		shader.uniforms.excitement = excitement;
		shader.uniforms.time = time;
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				'#include <common>\nuniform float excitement, time;',
			)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nfloat cheer = float(gl_InstanceID);\ntransformed.y += (0.02 + excitement * 0.22) * abs(sin(time * (3.0 + excitement * 5.0) + cheer * 1.7));',
			);
	};
	const shirts = [
		'#c8453c',
		'#2f5aa8',
		'#e9c341',
		'#f4f1e8',
		'#3f8a6b',
		'#8c3b6b',
		'#1f2123',
		'#e27a3f',
	];
	const matrix = new THREE.Matrix4(),
		colour = new THREE.Color();
	crowd.forEach((p, i) => {
		const size = 0.9 + next() * 0.2;
		matrix.makeScale(size, size, size).setPosition(X + p.x, p.y, Z + p.z);
		people.setMatrixAt(i, matrix);
		people.setColorAt(
			i,
			colour.set(shirts[Math.floor(next() * shirts.length)]),
		);
	});
	people.castShadow = true;
	people.receiveShadow = true;
	people.computeBoundingSphere();
	root.add(people);

	// A tote board in the middle of the infield.
	const board = placed(props, 20, 0);
	for (const s of [-1, 1])
		box(board, '#6d7471', [0.4, 5, 0.4], [s * 6, 2.5, 0], 0, 'paint');
	const tote = paintedTexture(512, 192, () => {});
	const drawTote = () => {
		const c = (tote.image as HTMLCanvasElement).getContext('2d')!;
		c.fillStyle = '#1b2a24';
		c.fillRect(0, 0, 512, 192);
		c.fillStyle = '#e9c341';
		c.font = '600 40px sans-serif';
		c.textAlign = 'center';
		c.fillText(t('sign.hippodrome'), 256, 50);
		c.font = '500 26px monospace';
		c.fillStyle = '#f4f1e8';
		for (let i = 0; i < 4; i++)
			c.fillText(
				`${i + 1}   ${['2.4', '3.1', '5.0', '7.5'][i]}`,
				128 + (i % 2) * 256,
				105 + Math.floor(i / 2) * 50,
			);
		tote.needsUpdate = true;
	};
	drawTote();
	const unsubscribe = onLanguageChange(drawTote);
	tote.addEventListener('dispose', unsubscribe);
	box(board, '#2b2f2d', [13, 5, 0.5], [0, 7, 0], 0, 'paint');
	texturedBox(board, tote, [12.4, 4.4, 0.05], [0, 7, 0.28], 0.6).castShadow =
		false;
	at(20, 0, 13, 1);

	// The infield pond and flower beds.
	const water = new THREE.Mesh(
		new THREE.CircleGeometry(1, 48),
		new THREE.MeshStandardMaterial({ color: '#4f7f8c', roughness: 0.08 }),
	);
	water.rotation.x = -Math.PI / 2;
	water.scale.set(pond.rx, pond.rz, 1);
	water.position.set(X + pond.x, 0.04, Z + pond.z);
	water.receiveShadow = true;
	root.add(water);
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		ellipsoid(
			props,
			'#8a8f8c',
			[0.7, 0.35, 0.6],
			[
				pond.x + Math.cos(a) * (pond.rx + 0.4),
				0.1,
				pond.z + Math.sin(a) * (pond.rz + 0.4),
			],
		);
	}
	for (let i = 0; i < 28; i++) {
		const a = (i / 28) * Math.PI * 2;
		solids.push({
			x: X + pond.x + Math.cos(a) * pond.rx * 0.95,
			z: Z + pond.z + Math.sin(a) * pond.rz * 0.95,
			w: 3.2,
			d: 3.2,
		});
	}
	for (const bx of [-straight + 20, -10, straight - 20]) {
		for (let i = 0; i < 26; i++)
			ellipsoid(
				props,
				['#e9c341', '#c8453c', '#f4f1e8', '#8c3b6b'][i % 4],
				[0.28, 0.22, 0.28],
				[bx - 6 + (i % 13), 0.2, inner - 2 - Math.floor(i / 13) * 0.7],
			);
		box(
			props,
			'#4f6b3a',
			[13.4, 0.2, 1.8],
			[bx, 0.1, inner - 2.35],
			0,
			'plain',
		);
	}

	sign(props, 'sign.hippodrome', HIPPODROME.gateX + 9, -outer - 6, 0);

	// Woods on the hills round the course.
	const trees: TreeSpec[] = [];
	for (let i = 0; i < 700; i++) {
		const a = next() * Math.PI * 2,
			r = 175 + next() ** 0.7 * 260;
		const x = X + Math.sin(a) * r,
			z = Z + Math.cos(a) * r;
		const lx = x - X,
			lz = z - Z;
		if (lz < -60 && lz > -140 && lx > -125 && lx < 60) continue;
		trees.push({
			x,
			z,
			y: hippodromeHeight(x, z) - 0.3,
			height: 9 + next() * 8,
			kind: next() < 0.7 ? 'broadleaf' : 'conifer',
			variant: i,
			tint: next(),
			rotation: next() * 6.28,
			castShadow: r < 230,
		});
		if (r < 200) solids.push({ x, z, w: 0.7, d: 0.7 });
	}
	for (const [tx, tz] of [
		[70, 0],
		[80, -18],
		[64, 20],
		[-90, 20],
		[-96, -10],
	] as const)
		trees.push({
			x: X + tx,
			z: Z + tz,
			height: 12,
			kind: 'broadleaf',
			variant: tx,
			tint: 0.3,
			rotation: tz,
		});
	const forest = createForest(trees);
	scene.add(forest.group);
	for (const [tx, tz] of [
		[70, 0],
		[80, -18],
		[64, 20],
		[-90, 20],
		[-96, -10],
	] as const)
		at(tx, tz, 0.8, 0.8);

	mergeStatic(props);
	mergeStatic(rails);
	return {
		root,
		extra: [forest.group],
		grass: { mask: ground.mask, size: 460, flatRadius: 215 },
		ground: new THREE.Color('#5f6a44'),
		fog: 0.85,
		/** Sets how loudly the crowd cheers, 0–1. */
		cheer(level: number) {
			excitement.value += (level - excitement.value) * 0.1;
		},
		update(timeNow: number, wind: number, windPhase: number) {
			time.value = timeNow;
			forest.update(windPhase, wind);
		},
	};
}
