import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSkinGeometry } from '../src/horse/skin.ts';
import { createHorse } from '../src/horse/model.ts';
import { createHorseAnimation } from '../src/horse/animation.ts';

await test('horse skin is one closed connected surface with normalized joint weights', () => {
	const geometry = createSkinGeometry();
	const index = geometry.getIndex()!,
		count = geometry.getAttribute('position').count;
	const parents = Array.from({ length: count }, (_, i) => i);
	const find = (i: number): number => {
		while (parents[i] !== i) {
			parents[i] = parents[parents[i]];
			i = parents[i];
		}
		return i;
	};
	const edges = new Map<string, number>();
	for (let i = 0; i < index.count; i += 3)
		for (let j = 0; j < 3; j++) {
			const a = index.getX(i + j),
				b = index.getX(i + ((j + 1) % 3));
			parents[find(a)] = find(b);
			const key = a < b ? `${a}:${b}` : `${b}:${a}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		}
	assert.equal(new Set(parents.map((_, i) => find(i))).size, 1);
	assert.ok([...edges.values()].every((count) => count === 2));
	const weights = geometry.getAttribute('skinWeight');
	for (let i = 0; i < count; i++)
		assert.ok(
			Math.abs(
				weights.getX(i) +
					weights.getY(i) +
					weights.getZ(i) +
					weights.getW(i) -
					1,
			) < 1e-6,
		);
});

await test('animated skin deforms while its preview skeleton remains independent', () => {
	const horse = createHorse(),
		animation = createHorseAnimation(horse);
	const skin = horse.root.getObjectByName('horse-skin') as THREE.SkinnedMesh;
	const preview = clone(horse.root),
		copy = preview.getObjectByName('horse-skin') as THREE.SkinnedMesh;
	assert.notEqual(skin.skeleton, copy.skeleton);
	for (let i = 0; i < skin.skeleton.bones.length; i++)
		assert.notEqual(skin.skeleton.bones[i], copy.skeleton.bones[i]);
	const rest = copy.skeleton.bones.map((b) => b.quaternion.clone());
	const position = skin.geometry.getAttribute('position');
	let moved = 0;
	for (const state of [
		{ gait: 1, speed: 2.5, jump: -1 },
		{ gait: 2, speed: 5.5, jump: -1 },
		{ gait: 3, speed: 9, jump: -1 },
		{ gait: 0, speed: 0, jump: -1 },
		{ gait: 2, speed: 5.5, jump: 0.4 },
	]) {
		for (let frame = 0; frame < 60; frame++) {
			animation.update(1 / 60, state, frame / 60, 1);
			horse.root.updateMatrixWorld(true);
			skin.skeleton.update();
			for (let i = 0; i < position.count; i += 137) {
				const p = new THREE.Vector3().fromBufferAttribute(position, i);
				const original = p.clone();
				skin.applyBoneTransform(i, p);
				assert.ok(p.toArray().every(Number.isFinite));
				moved = Math.max(moved, p.distanceTo(original));
			}
		}
	}
	assert.ok(moved > 0.1);
	copy.skeleton.bones.forEach((bone, i) =>
		assert.ok(bone.quaternion.equals(rest[i])),
	);
});
