import { createTerrain, terrainHeight } from './terrain.ts';
import { createForest, type TreeSpec } from './trees.ts';
import { createFlowers } from './flowers.ts';
import { random, worldNoise } from './noise.ts';
import { createGrass } from './grass.ts';
import { WORLD_RADIUS } from '../game/tuning.ts';
import { box, cylinder, sign } from './primitives.ts';
import type { Solid } from '../game/types.ts';
import { createJumps } from './jumps.ts';
import * as THREE from 'three';
import { createStable } from './stable.ts';
import { insideStable, STABLES } from './stable-layout.ts';
import { createSun } from './sun.ts';
import { createSky } from './sky.ts';
import {
	ARENA,
	BRIDLEWAY,
	PASTURE,
	PATHS,
	RACE_TRACK,
	inPasture,
	raceTrackDistance,
	type Point,
} from './layout.ts';
import { arc, railFence } from './fences.ts';
import { mergeStatic } from '../rendering/merge.ts';
import type { HorseModel } from '../horse/types.ts';
import { createHorse } from '../horse/model.ts';
import type { Appearance } from '../horse/appearance.ts';
import { createLamps, createSurfaceUniforms } from './lamps.ts';
import { createRain } from './rain.ts';
import type { Environment } from '../game/environment.ts';

const smooth = THREE.MathUtils.smoothstep;
const SUNLIGHT = new THREE.Color('#fff1dd'),
	LOW_SUN = new THREE.Color('#ffae6e'),
	MOONLIGHT = new THREE.Color('#a9bfe6'),
	DAY_SKY = new THREE.Color('#dbe8f5'),
	GOLDEN_SKY = new THREE.Color('#f3c79c'),
	NIGHT_SKY = new THREE.Color('#4a5d8c'),
	DAY_GROUND = new THREE.Color('#5f6344'),
	NIGHT_GROUND = new THREE.Color('#20261d');

function segmentDistance(p: Point, a: Point, b: Point) {
	const abx = b.x - a.x,
		abz = b.z - a.z;
	const t = Math.max(
		0,
		Math.min(
			1,
			((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1),
		),
	);
	return Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t);
}

export function createWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
	const solids: Solid[] = [];
	const sky = createSky(scene, renderer);
	const hemisphere = new THREE.HemisphereLight(DAY_SKY, DAY_GROUND, 0.35);
	scene.add(hemisphere);
	const sun = createSun();
	scene.add(sun);
	const focus = new THREE.Vector3(),
		forward = new THREE.Vector3(),
		sunVector = new THREE.Vector3(),
		keyLight = new THREE.Vector3();
	const surface = createSurfaceUniforms();
	// Everything built here is static and merges into a few draw calls at the end.
	const scenery = new THREE.Group();
	scenery.name = 'scenery';
	scene.add(scenery);
	// A continuous broad bridleway through the meadow and the forest.
	const curve = new THREE.CatmullRomCurve3(
		BRIDLEWAY.map((p) => new THREE.Vector3(p.x, 0.035, p.z)),
		true,
	);
	const points = curve.getPoints(240);
	const terrain = createTerrain(points, surface);
	const grass = createGrass(terrain.mask, surface);
	scene.add(terrain.ground, grass.group);
	function fence(x: number, z: number, length: number, alongZ = false) {
		const group = new THREE.Group();
		group.position.set(x, 0, z);
		group.rotation.y = alongZ ? Math.PI / 2 : 0;
		scenery.add(group);
		for (let i = -length / 2; i <= length / 2 + 0.01; i += 4)
			box(group, '#eee3c8', [0.23, 1.55, 0.23], [i, 0.77, 0], 0, 'post');
		for (const y of [0.6, 1.15])
			box(group, '#e8ddc2', [length, 0.16, 0.13], [0, y, 0]);
		solids.push({
			x,
			z,
			w: alongZ ? 0.2 : length,
			d: alongZ ? length : 0.2,
			jumpable: true,
		});
	}
	const arenaNorth = ARENA.z - ARENA.halfDepth,
		arenaSouth = ARENA.z + ARENA.halfDepth;
	fence(-ARENA.halfWidth, ARENA.z, ARENA.halfDepth * 2, true);
	fence(ARENA.halfWidth, ARENA.z, ARENA.halfDepth * 2, true);
	fence(0, arenaNorth, ARENA.halfWidth * 2);
	fence(-12, arenaSouth, 10);
	fence(12, arenaSouth, 10);
	const obstacles = createJumps(scene);
	const stables = STABLES.map((spec) => createStable(scene, solids, spec));
	const trees: TreeSpec[] = [];
	const treeSolid = (x: number, z: number) =>
		solids.push({ x, z, w: 0.65, d: 0.65 });
	buildRaceTrack(scenery, solids);
	buildPasture(scenery, solids, trees, treeSolid);
	sign(scenery, 'sign.arena', -9, 26);
	sign(scenery, 'sign.forest', 39, 34, -0.3);
	sign(scenery, 'sign.raceTrack', 47, 50, -0.65);
	sign(scenery, 'sign.pasture', 76, -1, -Math.PI / 2);
	const paths = [
		...PATHS,
		{ points: points.map((p) => ({ x: p.x, z: p.z })), halfWidth: 2.8 },
	];
	const nearPath = (x: number, z: number, margin: number) =>
		paths.some(({ points: line, halfWidth }) =>
			line.some(
				(a, i) =>
					i < line.length - 1 &&
					segmentDistance({ x, z }, a, line[i + 1]) < halfWidth + margin,
			),
		);
	/** Areas kept clear of trees: buildings, riding surfaces and their approaches. */
	const reserved = (x: number, z: number, margin: number) =>
		insideStable(x, z, 7 + margin) ||
		(Math.abs(x - ARENA.x) < ARENA.halfWidth + 7 + margin &&
			z > arenaNorth - 7 - margin &&
			z < arenaSouth + 15 + margin) ||
		raceTrackDistance(x, z) < RACE_TRACK.halfWidth + 10 + margin ||
		inPasture(x, z, 5 + margin) ||
		// The stable yard west of the arena and the meadow stables to the south.
		(x > -58 && x < -18 && z > -36 && z < 72) ||
		(x > -24 && x < 12 && z > 20 && z < 72) ||
		// The grandstand beside the racecourse.
		(x > 70 && x < 104 && z > 58 && z < 76) ||
		nearPath(x, z, 3 + margin);
	const next = random(521);
	for (let i = 0; i < 1400; i++) {
		const angle = next() * Math.PI * 2,
			radius = Math.sqrt(next()) * (WORLD_RADIUS - 2);
		const x = Math.cos(angle) * radius,
			z = Math.sin(angle) * radius;
		const size = next(),
			tint = next(),
			keep = next();
		// Dense woodland to the north, loose groves on the open meadows.
		const forest = z < -40 ? 1 : z < -25 ? 0.4 : 0;
		const grove = worldNoise(x, z, 34, 71);
		const density = Math.max(forest * 0.9, (grove - 0.52) * 3.2);
		if (keep > density || reserved(x, z, 0)) continue;
		if (solids.some((s) => Math.abs(s.x - x) < 3.2 && Math.abs(s.z - z) < 3.2))
			continue;
		const conifer = z < -35 ? tint < 0.8 : tint < 0.12;
		trees.push({
			x,
			z,
			height: conifer ? 11 + size * 8 : 8 + size * 7,
			kind: conifer ? 'conifer' : 'broadleaf',
			variant: i,
			tint,
			rotation: i * 2.39,
		});
		treeSolid(x, z);
	}
	const flowerSpots: { x: number; z: number }[] = [];
	for (let i = 0; i < 900; i++) {
		const angle = next() * Math.PI * 2,
			radius = Math.sqrt(next()) * (WORLD_RADIUS - 4);
		const x = Math.cos(angle) * radius,
			z = Math.sin(angle) * radius;
		if (z < -38 || insideStable(x, z, 5)) continue;
		if (
			(Math.abs(x) < 20 && z > -42 && z < 30) ||
			raceTrackDistance(x, z) < RACE_TRACK.halfWidth + 1.5 ||
			nearPath(x, z, 0.5)
		)
			continue;
		flowerSpots.push({ x, z });
	}
	// The pasture is thick with clover and buttercups.
	const meadow = random(77);
	for (let i = 0; i < 90; i++)
		flowerSpots.push({
			x: PASTURE.x + (meadow() - 0.5) * (PASTURE.halfWidth * 2 - 4),
			z: PASTURE.z + (meadow() - 0.5) * (PASTURE.halfDepth * 2 - 4),
		});
	// A backdrop of woodland on the surrounding hills, outside the ridden area.
	const backdrop = random(9001);
	for (let i = 0; i < 1500; i++) {
		const angle = backdrop() * Math.PI * 2,
			radius = WORLD_RADIUS + 16 + backdrop() ** 0.8 * 150;
		const x = Math.cos(angle) * radius,
			z = Math.sin(angle) * radius;
		trees.push({
			x,
			z,
			y: terrainHeight(x, z) - 0.3,
			height: 11 + backdrop() * 9,
			kind: backdrop() < (z < 0 ? 0.75 : 0.35) ? 'conifer' : 'broadleaf',
			variant: i,
			tint: backdrop(),
			rotation: backdrop() * Math.PI * 2,
			castShadow: false,
		});
	}
	const forest = createForest(trees);
	scene.add(forest.group, createFlowers(flowerSpots));
	const lamps = createLamps(
		scene,
		scenery,
		solids,
		stables.flatMap((stable) => stable.lamps),
		surface,
	);
	mergeStatic(scenery);
	const rain = createRain(scene);
	const horses: HorseModel[] = [
		...stables.flatMap((stable) => stable.horses),
		...pastureHerd(scene),
	];
	return {
		obstacles,
		solids,
		points,
		stables,
		horses,
		cameraBlockers: stables.flatMap((stable) => stable.cameraBlockers),
		update(
			time: number,
			camera: THREE.Camera,
			environment: Environment,
			viewportHeight = 800,
		) {
			const conditions = environment.conditions,
				darkness = environment.darkness,
				daylight = 1 - darkness;
			sunVector.set(...environment.sun);
			const height = sunVector.y;
			// One shadowing key light: the sun by day and the moon by night.
			const sunUp = smooth(height, -0.03, 0.1),
				moonUp = 1 - smooth(height, -0.12, -0.02);
			if (height > -0.05)
				keyLight.set(sunVector.x, Math.max(height, 0.08), sunVector.z);
			else keyLight.set(-sunVector.x, Math.abs(height) + 0.55, -sunVector.z);
			keyLight.normalize();
			sun.intensity =
				3.1 * sunUp * (1 - 0.78 * conditions.overcast) +
				0.55 * moonUp * (1 - 0.7 * conditions.overcast);
			if (height > -0.05)
				sun.color.copy(LOW_SUN).lerp(SUNLIGHT, smooth(height, 0.04, 0.4));
			else sun.color.copy(MOONLIGHT);
			// Golden hour warms the whole sky light, not just the sun.
			hemisphere.color
				.copy(DAY_SKY)
				.lerp(GOLDEN_SKY, (1 - smooth(height, 0.02, 0.3)) * daylight * 0.7)
				.lerp(NIGHT_SKY, darkness);
			hemisphere.groundColor.copy(DAY_GROUND).lerp(NIGHT_GROUND, darkness);
			hemisphere.intensity =
				(0.35 + 0.3 * conditions.overcast) * daylight + 0.75 * darkness;
			scene.environmentIntensity =
				(0.65 + 0.3 * conditions.overcast) * daylight + 1.4 * darkness;
			renderer.toneMappingExposure = 1.05 + 0.3 * darkness;
			// Spend the shadow map ahead of the camera, where the player looks.
			camera.getWorldDirection(forward).setY(0).normalize();
			focus.copy(camera.position).addScaledVector(forward, 35).setY(0);
			sun.follow(focus, keyLight);
			sky.update(time, {
				sun: sunVector,
				conditions,
				darkness,
				windPhase: environment.windPhase,
			});
			surface.wind.value = conditions.wind;
			surface.wetness.value = environment.wetness;
			grass.update(environment.windPhase, camera);
			forest.update(environment.windPhase, conditions.wind);
			rain.update(time, camera, conditions.rain, conditions.wind, daylight);
			lamps.update(camera, darkness, viewportHeight);
			// Lit stables glow through their windows after dusk.
			const night = smooth(darkness, 0.25, 0.7);
			for (const stable of stables) {
				stable.lampMaterial.emissiveIntensity = 0.4 + night * 0.6;
				stable.windowMaterial.emissiveIntensity = night * 0.9;
			}
		},
		dispose() {
			sky.dispose();
		},
	};
}

/** Horses turned out to graze on the pasture. */
function pastureHerd(scene: THREE.Scene) {
	const herd: [string, number, number, number, Partial<Appearance>][] = [
		['WIATR', -8, 6, 1.2, { coat: '#343330', hair: '#47332d' }],
		[
			'ZORZA',
			5,
			-4,
			-2,
			{ coat: '#e1c39a', hair: '#e9e3d1', maneStyle: 'short' },
		],
		[
			'GRAFIT',
			2,
			16,
			0.4,
			{ coat: '#e6e0d2', hair: '#47332d', tailStyle: 'short' },
		],
	];
	return herd.map(([name, dx, dz, heading, appearance]) => {
		const horse = createHorse();
		horse.setAppearance(appearance);
		horse.rider.visible = false;
		horse.tack.visible = false;
		horse.root.name = name;
		horse.root.position.set(PASTURE.x + dx, 0, PASTURE.z + dz);
		horse.root.rotation.y = heading;
		scene.add(horse.root);
		return horse;
	});
}

/** Oval racecourse with white rails, a finish post and a small grandstand. */
function buildRaceTrack(parent: THREE.Object3D, solids: Solid[]) {
	const { x, z, straight, radius, halfWidth, gateX, gateHalfWidth } =
		RACE_TRACK;
	const west = x - straight,
		east = x + straight;
	const style = {
		post: '#f4f1e8',
		rail: '#f7f4ec',
		rails: [0.55, 1.1],
		postHeight: 1.25,
		spacing: 3,
	};
	const outer = radius + halfWidth + 0.5,
		inner = radius - halfWidth - 0.5;
	railFence(
		parent,
		solids,
		[
			{ x: gateX - gateHalfWidth, z: z - outer },
			...arc(west, z, outer, Math.PI, Math.PI * 2),
			...arc(east, z, outer, 0, Math.PI),
			{ x: gateX + gateHalfWidth, z: z - outer },
		],
		style,
	);
	railFence(
		parent,
		solids,
		[
			...arc(west, z, inner, Math.PI, Math.PI * 2),
			...arc(east, z, inner, 0, Math.PI),
			{ x: west, z: z - inner },
		],
		{ ...style, rails: [1] },
	);
	// Finish line: a painted stripe between two striped posts.
	box(parent, '#f7f4ec', [0.3, 0.02, halfWidth * 2], [x, 0.02, z - radius]);
	for (const edge of [inner - 0.6, outer + 0.6]) {
		for (let i = 0; i < 5; i++)
			box(
				parent,
				i % 2 ? '#f7f4ec' : '#b8453c',
				[0.18, 0.5, 0.18],
				[x, 0.25 + i * 0.5, z - edge],
				0,
				'paint',
			);
		cylinder(parent, '#b8453c', 0.45, 0.06, [x, 2.75, z - edge]).rotation.x =
			Math.PI / 2;
		solids.push({ x, z: z - edge, w: 0.3, d: 0.3 });
	}
	// Covered grandstand facing the home straight.
	const standX = x + 17,
		standZ = z - outer - 5;
	for (let tier = 0; tier < 3; tier++) {
		box(
			parent,
			'#8d6d49',
			[16, 0.5 + tier * 0.55, 1.1],
			[standX, (0.5 + tier * 0.55) / 2, standZ + 1.1 - tier * 1.1],
			0,
			'boards',
		);
		box(
			parent,
			'#b75f59',
			[15.6, 0.1, 0.45],
			[standX, 0.55 + tier * 0.55, standZ + 1.1 - tier * 1.1],
			0,
			'paint',
		);
	}
	box(
		parent,
		'#e0d3b7',
		[16.4, 4.2, 0.25],
		[standX, 2.1, standZ - 1.3],
		0,
		'siding',
	);
	for (const side of [-1, 1]) {
		box(
			parent,
			'#e0d3b7',
			[0.25, 4.2, 3.4],
			[standX + side * 8.1, 2.1, standZ],
			0,
			'siding',
		);
		box(
			parent,
			'#75573c',
			[0.22, 4.4, 0.22],
			[standX + side * 8.1, 2.2, standZ + 1.9],
			0,
			'post',
		);
	}
	const roof = box(
		parent,
		'#4c5c57',
		[17.2, 0.2, 4.4],
		[standX, 4.45, standZ + 0.2],
		0,
		'roofing',
	);
	roof.rotation.x = -0.12;
	solids.push({ x: standX, z: standZ, w: 16.6, d: 3.6 });
}

/** A fenced pasture with a field shelter, a water trough, a hay feeder and shade trees. */
function buildPasture(
	parent: THREE.Object3D,
	solids: Solid[],
	trees: TreeSpec[],
	treeSolid: (x: number, z: number) => void,
) {
	const { x, z, halfWidth, halfDepth, gateHalfWidth } = PASTURE;
	const west = x - halfWidth,
		east = x + halfWidth,
		north = z - halfDepth,
		south = z + halfDepth;
	const style = {
		post: '#6b5139',
		rail: '#8a6a4a',
		rails: [0.45, 0.85, 1.25],
		postHeight: 1.5,
		spacing: 3,
		finish: 'wood' as const,
	};
	railFence(
		parent,
		solids,
		[
			{ x: west, z: z - gateHalfWidth },
			{ x: west, z: north },
			{ x: east, z: north },
			{ x: east, z: south },
			{ x: west, z: south },
			{ x: west, z: z + gateHalfWidth },
		],
		style,
	);
	// The gate stands open against the fence.
	const gate = new THREE.Group();
	gate.position.set(west, 0, z - gateHalfWidth);
	gate.rotation.y = -2.3;
	parent.add(gate);
	for (let i = 0; i < 5; i++)
		box(
			gate,
			'#8a6a4a',
			[0.1, 0.12, 3.4],
			[0, 0.35 + i * 0.25, 1.7],
			0,
			'wood',
		);
	box(gate, '#6b5139', [0.12, 1.4, 0.12], [0, 0.7, 3.3], 0, 'post');
	const brace = box(
		gate,
		'#6b5139',
		[0.08, 0.1, 3.6],
		[0, 0.85, 1.7],
		0,
		'wood',
	);
	brace.rotation.x = 0.3;
	// Field shelter in the north-east corner, open to the south.
	const shelterX = east - 8,
		shelterZ = north + 4;
	box(
		parent,
		'#7a624b',
		[11, 3, 0.22],
		[shelterX, 1.5, shelterZ - 2.4],
		0,
		'siding',
	);
	for (const side of [-1, 1])
		box(
			parent,
			'#7a624b',
			[0.22, 3, 4.8],
			[shelterX + side * 5.4, 1.5, shelterZ],
			0,
			'siding',
		);
	for (const side of [-1, 1, -0.33, 0.33])
		box(
			parent,
			'#6b5139',
			[0.22, 2.7, 0.22],
			[shelterX + side * 5.4, 1.35, shelterZ + 2.3],
			0,
			'post',
		);
	const roof = box(
		parent,
		'#5b6a44',
		[11.8, 0.18, 5.8],
		[shelterX, 3.05, shelterZ],
		0,
		'roofing',
	);
	roof.rotation.x = 0.1;
	box(
		parent,
		'#b7a16a',
		[10.6, 0.05, 4.4],
		[shelterX, 0.03, shelterZ],
		0,
		'straw',
	);
	solids.push(
		{ x: shelterX, z: shelterZ - 2.4, w: 11, d: 0.3 },
		{ x: shelterX - 5.4, z: shelterZ, w: 0.3, d: 4.8 },
		{ x: shelterX + 5.4, z: shelterZ, w: 0.3, d: 4.8 },
	);
	// Water trough and a round-bale feeder.
	box(
		parent,
		'#7d8a8c',
		[3, 0.75, 0.95],
		[x + 6, 0.38, north + 12],
		0,
		'paint',
	);
	box(
		parent,
		'#6f9aa0',
		[2.8, 0.04, 0.75],
		[x + 6, 0.72, north + 12],
		0,
		'plain',
	);
	solids.push({ x: x + 6, z: north + 12, w: 3, d: 0.95 });
	const feederX = x - 10,
		feederZ = z - 8;
	cylinder(
		parent,
		'#c6ac69',
		0.95,
		1.25,
		[feederX, 0.62, feederZ],
		0.95,
		'straw',
	);
	for (const y of [0.25, 1.15]) {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(1.08, 0.05, 6, 24),
			new THREE.MeshStandardMaterial({
				color: '#56605c',
				roughness: 0.5,
				metalness: 0.4,
			}),
		);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(feederX, y, feederZ);
		ring.castShadow = true;
		parent.add(ring);
	}
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2;
		box(
			parent,
			'#56605c',
			[0.06, 0.95, 0.06],
			[feederX + Math.sin(a) * 1.08, 0.7, feederZ + Math.cos(a) * 1.08],
		);
	}
	solids.push({ x: feederX, z: feederZ, w: 2.2, d: 2.2 });
	for (const [tx, tz, variant] of [
		[x - 17, z + 22, 1],
		[x + 16, z + 20, 2],
		[x - 20, z - 24, 0],
	] as const) {
		trees.push({
			x: tx,
			z: tz,
			height: 13,
			kind: 'broadleaf',
			variant,
			tint: 0.3,
			rotation: tx,
		});
		treeSolid(tx, tz);
	}
}
