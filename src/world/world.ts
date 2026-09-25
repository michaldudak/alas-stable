import { createTerrain, terrainHeight } from './terrain.ts';
import { createForest, type TreeSpec } from './trees.ts';
import { createFlowers } from './flowers.ts';
import { random } from './noise.ts';
import { createGrass } from './grass.ts';
import { WORLD_RADIUS } from '../game/tuning.ts';
import { box, sign } from './primitives.ts';
import type { Solid, Obstacle } from '../game/types.ts';
import * as THREE from 'three';
import { createStable } from './stable.ts';
import { insideStable } from './stable-layout.ts';
import { createSun } from './sun.ts';
import { createSky } from './sky.ts';

export function createWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
	const solids: Solid[] = [],
		obstacles: (Obstacle & { rails: THREE.Group })[] = [];
	const sky = createSky(scene, renderer);
	scene.add(new THREE.HemisphereLight('#dbe8f5', '#5f6344', 0.55));
	scene.add(createSun());
	// A continuous broad bridleway through the meadow and the forest.
	const curve = new THREE.CatmullRomCurve3(
		[
			new THREE.Vector3(0, 0.035, 31),
			new THREE.Vector3(36, 0.035, 40),
			new THREE.Vector3(70, 0.035, 10),
			new THREE.Vector3(63, 0.035, -57),
			new THREE.Vector3(10, 0.035, -80),
			new THREE.Vector3(-60, 0.035, -62),
			new THREE.Vector3(-72, 0.035, -4),
			new THREE.Vector3(-44, 0.035, 30),
		],
		true,
	);
	const points = curve.getPoints(240);
	const terrain = createTerrain(points);
	const grass = createGrass(terrain.mask);
	scene.add(terrain.ground, grass.group);
	function fence(x: number, z: number, length: number, alongZ = false) {
		const group = new THREE.Group();
		group.position.set(x, 0, z);
		group.rotation.y = alongZ ? Math.PI / 2 : 0;
		scene.add(group);
		for (let i = -length / 2; i <= length / 2 + 0.01; i += 4)
			box(group, '#eee3c8', [0.23, 1.55, 0.23], [i, 0.77, 0]);
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
	fence(-17, -9, 60, true);
	fence(17, -9, 60, true);
	fence(0, -39, 34);
	fence(-12, 21, 10);
	fence(12, 21, 10);
	for (const [z, color] of [
		[7, '#75968a'],
		[-8, '#bf795f'],
		[-24, '#d6aa54'],
	] as const) {
		const x = 0,
			width = 8;
		for (const side of [-1, 1]) {
			box(scene, '#f7edcf', [0.3, 1.9, 0.3], [x + side * 4.2, 0.95, z]);
			box(scene, color, [1.2, 0.16, 0.75], [x + side * 4.2, 0.1, z]);
			solids.push({ x: x + side * 4.2, z, w: 0.3, d: 0.3 });
		}
		const rails = new THREE.Group();
		rails.position.set(x, 0, z);
		scene.add(rails);
		for (const y of [0.5, 1])
			for (let i = 0; i < 8; i++)
				box(
					rails,
					i % 2 ? '#fff0d3' : color,
					[1, 0.16, 0.16],
					[-3.5 + i, y, 0],
				);
		obstacles.push({ x, z, width, rails, down: 0 });
	}
	const stable = createStable(scene, solids);
	sign(scene, 'sign.arena', -9, 26);
	sign(scene, 'sign.forest', 39, 34, -0.3);
	const next = random(521);
	const trees: TreeSpec[] = [];
	for (let i = 0; i < 230; i++) {
		const x = (next() - 0.5) * 224,
			z = (next() - 0.5) * 224;
		if (
			insideStable(x, z, 7) ||
			Math.hypot(x, z) > WORLD_RADIUS ||
			(Math.abs(x) < 24 && z > -46 && z < 36) ||
			(x < -20 && x > -49 && z > -5 && z < 27)
		)
			continue;
		if (points.some((p) => Math.hypot(x - p.x, z - p.z) < 6)) continue;
		if (z > 25 && next() > 0.2) continue;
		// Keep the original draw order so trunks and their colliders stay put.
		const size = 4 + next() * 5,
			shade = Math.floor(next() * 4);
		const conifer = z < -35;
		trees.push({
			x,
			z,
			height: conifer ? size * 1.55 + 3 : size * 1.5 + 1.5,
			kind: conifer ? 'conifer' : 'broadleaf',
			variant: i,
			tint: shade / 3,
			rotation: i * 2.39,
		});
		solids.push({ x, z, w: 0.65, d: 0.65 });
	}
	// Thicken the woodland north of the meadow, clear of the bridleway.
	const woodland = random(6007);
	for (let i = 0; i < 170; i++) {
		const x = (woodland() - 0.5) * 224,
			z = -42 - woodland() * 72,
			size = woodland(),
			tint = woodland();
		if (
			Math.hypot(x, z) > WORLD_RADIUS - 2 ||
			points.some((p) => Math.hypot(x - p.x, z - p.z) < 7) ||
			solids.some((solid) => Math.hypot(solid.x - x, solid.z - z) < 3.5)
		)
			continue;
		trees.push({
			x,
			z,
			height: 10 + size * 8,
			kind: tint < 0.8 ? 'conifer' : 'broadleaf',
			variant: i,
			tint,
			rotation: i * 1.93,
		});
		solids.push({ x, z, w: 0.65, d: 0.65 });
	}
	const flowerSpots: { x: number; z: number }[] = [];
	for (let i = 0; i < 450; i++) {
		const x = (next() - 0.5) * 210,
			z = (next() - 0.5) * 210;
		if (
			insideStable(x, z, 5) ||
			(Math.abs(x) < 20 && z > -42 && z < 30) ||
			points.some((p) => Math.hypot(x - p.x, z - p.z) < 3.3)
		)
			continue;
		next();
		if (z > -38) flowerSpots.push({ x, z });
	}
	// A backdrop of woodland on the surrounding hills, outside the ridden area.
	const backdrop = random(9001);
	for (let i = 0; i < 1100; i++) {
		const angle = backdrop() * Math.PI * 2,
			radius = WORLD_RADIUS + 16 + backdrop() ** 0.8 * 140;
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
	return {
		obstacles,
		solids,
		points,
		stable,
		update(time: number, camera: THREE.Camera) {
			sky.update(time);
			grass.update(time, camera);
			forest.update(time);
		},
		dispose() {
			sky.dispose();
		},
	};
}
