import * as THREE from 'three';
import { cord, mesh, surface } from './geometry.ts';
import { headPoint, onHead, topline, type HorseRig } from './asset.ts';
import type { Vector3Tuple } from '../rendering/types.ts';

const tuple = (v: THREE.Vector3): Vector3Tuple => [v.x, v.y, v.z];

/** Webbing halter fitted to the sculpted head, with a lead ring under the chin. */
export function createHalter(body: THREE.Group, rig: HorseRig) {
	const halter = new THREE.Group();
	halter.name = 'choice:headgear:halter';
	body.add(halter);
	const webbing = surface('#437f79'),
		metal = surface('#c7c6ac', 0.35);
	const poll = topline(rig, 1.42);
	const nose = 0.7,
		chin = headPoint(rig, nose, 0.36);
	for (const side of [-1, 1]) {
		const cheek = onHead(rig, 0.22, 0.24, side, 0.03),
			ring = onHead(rig, nose, 0.2, side, 0.035);
		cord(
			halter,
			webbing,
			[
				[0, poll.y + 0.035, 1.4],
				tuple(onHead(rig, 0.02, 0.08, side, 0.03)),
				tuple(cheek),
				tuple(onHead(rig, 0.48, 0.22, side, 0.03)),
				tuple(ring),
			],
			0.035,
		);
		// Throat strap from the cheek junction down behind the jaw.
		cord(
			halter,
			webbing,
			[
				tuple(cheek),
				tuple(onHead(rig, 0.22, 0.42, side, 0.03)),
				tuple(headPoint(rig, 0.26, 0.56)),
			],
			0.03,
		);
		const loop = mesh(
			halter,
			new THREE.TorusGeometry(0.06, 0.013, 6, 16),
			metal,
			tuple(ring),
		);
		loop.rotation.y = Math.PI / 2;
	}
	// Noseband around the face, joining both rings.
	const band: Vector3Tuple[] = [];
	for (const [t, side] of [
		[0.2, -1],
		[0.08, -1],
		[0.02, 0],
		[0.08, 1],
		[0.2, 1],
		[0.3, 1],
		[0.36, 0],
		[0.3, -1],
		[0.2, -1],
	] as const)
		band.push(
			tuple(
				side
					? onHead(rig, nose, t, side, 0.035)
					: headPoint(rig, nose, t < 0.1 ? t - 0.13 : t + 0.04),
			),
		);
	cord(halter, webbing, band, 0.033);
	const leadAnchor = new THREE.Group();
	leadAnchor.position.copy(chin).add(new THREE.Vector3(0, -0.04, 0));
	halter.add(leadAnchor);
	mesh(leadAnchor, new THREE.TorusGeometry(0.057, 0.013, 6, 16), metal);
	return { halter, leadAnchor };
}
