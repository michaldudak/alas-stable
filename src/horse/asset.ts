import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Vector3Tuple } from '../rendering/types.ts';

/** Rest-pose joints of one leg, in body space (+Y up, +Z forward). */
export type LegLandmarks = {
	root: Vector3Tuple;
	knee: Vector3Tuple;
	fetlock: Vector3Tuple;
	ground: Vector3Tuple;
};

/**
 * Rig landmarks and surface samples written by `tools/horse/build_horse.py`.
 * Samples let tack, hair and ornaments sit on the sculpted body.
 */
export type HorseRig = {
	legs: LegLandmarks[];
	eye: Vector3Tuple;
	padBack: Vector3Tuple[];
	padFront: Vector3Tuple[];
	girth: Vector3Tuple[];
	topline: Vector3Tuple[];
	/** Half-width 0.15 and 0.4 below the topline. */
	toplineWidth: number[];
	toplineWidthLow: number[];
	head: {
		poll: [number, number];
		tilt: number;
		s: number[];
		t: number[];
		width: number[];
	};
};

export type HorseAsset = { geometry: THREE.BufferGeometry; rig: HorseRig };

let current: HorseAsset | undefined;

/**
 * Converts the exported attributes into three.js skinning data. Joint order is
 * body, four legs, four knees, four fetlocks (legs as LH, LF, RH, RF).
 */
function skinned(source: THREE.BufferGeometry) {
	const geometry = new THREE.BufferGeometry();
	geometry.setIndex(source.getIndex());
	geometry.setAttribute('position', source.getAttribute('position'));
	geometry.setAttribute('normal', source.getAttribute('normal'));
	geometry.setAttribute('ao', source.getAttribute('_ao'));
	geometry.setAttribute('mask', source.getAttribute('_mask'));
	const leg = source.getAttribute('_leg'),
		weight = source.getAttribute('_weight');
	const joints = new Uint16Array(leg.count * 4),
		weights = new Float32Array(leg.count * 4);
	for (let i = 0; i < leg.count; i++) {
		const index = Math.round(leg.getX(i));
		const limb = weight.getX(i),
			knee = weight.getY(i),
			fetlock = weight.getZ(i);
		joints.set([0, 1 + index, 5 + index, 9 + index], i * 4);
		weights.set([1 - limb - knee - fetlock, limb, knee, fetlock], i * 4);
	}
	geometry.setAttribute(
		'skinIndex',
		new THREE.Uint16BufferAttribute(joints, 4),
	);
	geometry.setAttribute(
		'skinWeight',
		new THREE.Float32BufferAttribute(weights, 4),
	);
	geometry.computeBoundingSphere();
	return geometry;
}

export async function parseHorseAsset(data: ArrayBuffer): Promise<HorseAsset> {
	const gltf = await new GLTFLoader().parseAsync(data, '');
	let mesh: THREE.Mesh | undefined;
	gltf.scene.traverse((object) => {
		if (object instanceof THREE.Mesh && object.name === 'HorseSkin')
			mesh = object;
	});
	if (!mesh) throw new Error('The horse asset has no HorseSkin mesh.');
	const rig = JSON.parse(String(mesh.userData.rig)) as HorseRig;
	current = { geometry: skinned(mesh.geometry), rig };
	mesh.geometry.dispose();
	return current;
}

export async function loadHorseAsset(url: string) {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Horse asset failed to load: ${response.status}`);
	return parseHorseAsset(await response.arrayBuffer());
}

/** The loaded asset; call `loadHorseAsset` before creating horses. */
export function horseAsset() {
	if (!current) throw new Error('Load the horse asset before creating horses.');
	return current;
}

/** Point in the head's own frame: `s` from poll to lips, `t` from forehead to jaw. */
export function headPoint(rig: HorseRig, s: number, t: number, x = 0) {
	const [y, z] = rig.head.poll,
		tilt = rig.head.tilt;
	return new THREE.Vector3(
		x,
		y - s * Math.sin(tilt) - t * Math.cos(tilt),
		z + s * Math.cos(tilt) - t * Math.sin(tilt),
	);
}

/** Head surface half-width at (s, t), bilinearly interpolated from the samples. */
export function headWidth(rig: HorseRig, s: number, t: number) {
	const { s: ss, t: ts, width } = rig.head;
	const locate = (values: number[], v: number) => {
		const step = values[1] - values[0];
		const f = THREE.MathUtils.clamp(
			(v - values[0]) / step,
			0,
			values.length - 1.001,
		);
		return [Math.floor(f), f - Math.floor(f)] as const;
	};
	const [i, fi] = locate(ss, s),
		[j, fj] = locate(ts, t);
	const at = (a: number, b: number) => width[a * ts.length + b];
	const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fi;
	const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fi;
	return top + (bottom - top) * fj;
}

/** A point on (or `offset` outside) the side of the head. */
export function onHead(
	rig: HorseRig,
	s: number,
	t: number,
	side: number,
	offset = 0.02,
) {
	return headPoint(rig, s, t, side * (headWidth(rig, s, t) + offset));
}

/** Height and half-widths below the midline topline at a given Z, from the samples. */
export function topline(rig: HorseRig, z: number) {
	const points = rig.topline;
	const step = points[1][2] - points[0][2];
	const f = THREE.MathUtils.clamp(
		(z - points[0][2]) / step,
		0,
		points.length - 1.001,
	);
	const i = Math.floor(f),
		t = f - i;
	return {
		y: points[i][1] + (points[i + 1][1] - points[i][1]) * t,
		width:
			rig.toplineWidth[i] + (rig.toplineWidth[i + 1] - rig.toplineWidth[i]) * t,
		lowWidth:
			rig.toplineWidthLow[i] +
			(rig.toplineWidthLow[i + 1] - rig.toplineWidthLow[i]) * t,
	};
}
