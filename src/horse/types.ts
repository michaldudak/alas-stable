import type * as THREE from 'three';
import type { Appearance } from './appearance.ts';

/** A replaceable visual model: +Y up, +Z forward, origin at ground level.
 * Limb order is left hind, left fore, right hind, right fore.
 * Animation owns transforms; appearance owns materials and variant visibility.
 */
export interface HorseModel {
	root: THREE.Group;
	body: THREE.Group;
	legs: THREE.Group[];
	knees: THREE.Group[];
	hooves: THREE.Mesh[];
	tail: THREE.Group;
	rider: THREE.Group;
	tack: THREE.Group;
	mane: THREE.Group;
	decoration: THREE.Group;
	coat: THREE.MeshStandardMaterial;
	hair: THREE.MeshStandardMaterial;
	cloth: THREE.MeshStandardMaterial;
	leather: THREE.MeshStandardMaterial;
	/** Frees cached appearance textures; scene ownership covers mesh resources. */
	dispose(): void;
	setAppearance(value: unknown): Appearance;
}
