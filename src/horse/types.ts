import type * as THREE from 'three';
import type { Appearance } from './appearance.ts';
import type { LegSegments } from '../game/gaits.ts';

/** Rest geometry the animation adapter needs for one leg, in body space. */
export interface LegRig {
	segments: LegSegments;
	/** Fetlock to hoof marker, (y, z) in the leg's plane. */
	pastern: readonly [number, number];
	/** Rest (x, z) of the hoof marker under the body. */
	foot: readonly [number, number];
	/** Comfortable distance from the leg root to the fetlock, just short of straight. */
	reach: number;
}

/** A replaceable visual model: +Y up, +Z forward, origin at ground level.
 * Limb order is left hind, left fore, right hind, right fore. Hoof markers sit
 * 0.12 above the ground when a hoof is planted.
 * Animation owns transforms; appearance owns materials and variant visibility.
 */
export interface HorseModel {
	root: THREE.Group;
	body: THREE.Group;
	legs: THREE.Bone[];
	knees: THREE.Bone[];
	fetlocks: THREE.Bone[];
	hooves: THREE.Object3D[];
	legRigs: LegRig[];
	tail: THREE.Group;
	rider: THREE.Group;
	tack: THREE.Group;
	halter: THREE.Group;
	bridle: THREE.Group;
	leadAnchor: THREE.Group;
	/** Neck root, mid-neck and head bones; rotations bend the neck from its base. */
	neck: THREE.Bone[];
	/** The hindquarters, carrying the hind legs and the tail; rolls and tilts at the loins. */
	croup: THREE.Bone;
	/** A point on the forehead, following the head, for a stroking hand. */
	forehead: THREE.Object3D;
	/**
	 * The seated rider leans over to pat the neck (`lean` 0–1) on `side`
	 * (+1 left, -1 right) and lifts the hand between pats.
	 */
	gesture(lean: number, lift: number, side?: number): void;
	mane: THREE.Group;
	decoration: THREE.Group;
	coat: THREE.MeshStandardMaterial;
	hair: THREE.MeshStandardMaterial;
	cloth: THREE.MeshStandardMaterial;
	leather: THREE.MeshStandardMaterial;
	/** Frees cached appearance textures; scene ownership covers mesh resources. */
	dispose(): void;
	getAppearance(): Appearance;
	setAppearance(value: unknown): Appearance;
}
