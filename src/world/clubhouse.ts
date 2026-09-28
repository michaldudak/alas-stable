import * as THREE from 'three';
import type { Solid } from '../game/types.ts';
import { box, cylinder, ellipsoid, material } from './primitives.ts';
import { CLUBHOUSE } from './layout.ts';

/**
 * A whitewashed timber clubhouse with a porch, shutters, flower boxes and a
 * bench. Its windows glow in the evening while the riders are inside.
 */
export function createClubhouse(parent: THREE.Object3D, solids: Solid[]) {
	const { x, z, halfWidth: w, halfDepth: d } = CLUBHOUSE;
	const group = new THREE.Group();
	group.position.set(x, 0, z);
	parent.add(group);
	const wall = '#efe6d2',
		trim = '#46604f',
		roof = '#9c4a3a',
		timber = '#6b5139';
	const height = 3.4;
	// Walls on a stone plinth, with dark corner posts.
	box(
		group,
		'#9d968a',
		[w * 2 + 0.3, 0.45, d * 2 + 0.3],
		[0, 0.22, 0],
		0,
		'concrete',
	);
	box(group, wall, [0.25, height, d * 2], [w, height / 2, 0], 0, 'siding');
	box(group, wall, [0.25, height, d * 2], [-w, height / 2, 0], 0, 'siding');
	for (const side of [-1, 1])
		box(
			group,
			wall,
			[w * 2, height, 0.25],
			[0, height / 2, side * d],
			0,
			'siding',
		);
	for (const cx of [-1, 1])
		for (const cz of [-1, 1])
			box(
				group,
				timber,
				[0.3, height + 0.1, 0.3],
				[cx * w, height / 2, cz * d],
				0,
				'post',
			);
	// A steep roof with gables at the north and south ends.
	const pitch = Math.atan2(1.9, w + 0.4),
		span = Math.hypot(w + 0.4, 1.9);
	for (const side of [-1, 1]) {
		const slope = box(
			group,
			roof,
			[span, 0.22, d * 2 + 1],
			[(side * (w + 0.4)) / 2, height + 0.95, 0],
			0,
			'roofing',
		);
		slope.rotation.z = -side * pitch;
	}
	box(
		group,
		timber,
		[0.2, 0.26, d * 2 + 1.05],
		[0, height + 1.92, 0],
		0,
		'wood',
	);
	const gable = new THREE.Shape();
	gable.moveTo(-w, 0);
	gable.lineTo(w, 0);
	gable.lineTo(0, 1.9);
	gable.closePath();
	for (const side of [-1, 1]) {
		const end = new THREE.Mesh(
			new THREE.ShapeGeometry(gable),
			material(wall, 'siding'),
		);
		end.position.set(0, height, side * (d + 0.13));
		end.rotation.y = side > 0 ? 0 : Math.PI;
		end.castShadow = true;
		group.add(end);
	}
	// Glass glows warm after dusk.
	const glass = new THREE.MeshStandardMaterial({
		color: '#a0bbc0',
		roughness: 0.2,
		emissive: '#ffc987',
		emissiveIntensity: 0,
	});
	glass.name = 'clubhouse-window';
	function addWindow(px: number, pz: number, facing: number) {
		const frame = new THREE.Group();
		frame.position.set(px, 1.85, pz);
		frame.rotation.y = facing;
		group.add(frame);
		const pane = box(frame, '#a0bbc0', [1.1, 1.1, 0.06], [0, 0, 0.12]);
		pane.material = glass;
		for (const y of [-0.6, 0.6])
			box(frame, '#f4efe4', [1.3, 0.1, 0.12], [0, y, 0.15]);
		for (const px2 of [-0.6, 0, 0.6])
			box(frame, '#f4efe4', [0.08, 1.2, 0.12], [px2, 0, 0.15]);
		box(frame, '#f4efe4', [1.1, 0.06, 0.1], [0, 0, 0.16]);
		// Shutters folded back and a box of flowers under the sill.
		for (const side of [-1, 1])
			box(frame, trim, [0.55, 1.2, 0.06], [side * 0.95, 0, 0.15]);
		box(frame, timber, [1.2, 0.26, 0.3], [0, -0.78, 0.28], 0, 'wood');
		for (let i = 0; i < 6; i++)
			ellipsoid(
				frame,
				['#d88aae', '#e9c341', '#f3f0e4'][i % 3],
				[0.09, 0.08, 0.09],
				[-0.5 + i * 0.2, -0.6, 0.3],
			);
	}
	// The east front: door in the middle, a window either side.
	addWindow(w + 0.02, -1.9, Math.PI / 2);
	addWindow(w + 0.02, 1.9, Math.PI / 2);
	addWindow(-w - 0.02, 0, -Math.PI / 2);
	for (const side of [-1, 1])
		addWindow(side * 1.9, side * (d + 0.02), side > 0 ? 0 : Math.PI);
	const door = box(group, trim, [0.1, 2.3, 1.2], [w + 0.08, 1.4, 0], 0, 'door');
	door.castShadow = true;
	box(group, '#f4efe4', [0.14, 2.45, 0.1], [w + 0.1, 1.45, -0.65]);
	box(group, '#f4efe4', [0.14, 2.45, 0.1], [w + 0.1, 1.45, 0.65]);
	box(group, '#f4efe4', [0.14, 0.12, 1.4], [w + 0.1, 2.62, 0]);
	cylinder(group, '#d8bd82', 0.04, 0.02, [w + 0.18, 1.35, 0.4]).rotation.z =
		Math.PI / 2;
	// A porch roof on two posts shelters the door; a bench waits beside it.
	for (const side of [-1, 1])
		box(
			group,
			timber,
			[0.16, 2.9, 0.16],
			[w + 1.5, 1.45, side * 1.25],
			0,
			'post',
		);
	const porch = box(
		group,
		roof,
		[1.9, 0.14, 3.1],
		[w + 0.85, 2.95, 0],
		0,
		'roofing',
	);
	porch.rotation.z = -0.25;
	box(group, timber, [0.5, 0.08, 1.6], [w + 0.55, 0.55, 2.5], 0, 'wood');
	box(group, timber, [0.1, 0.55, 1.6], [w + 0.35, 0.85, 2.5], 0, 'wood');
	for (const side of [-1, 1])
		box(
			group,
			timber,
			[0.4, 0.5, 0.08],
			[w + 0.55, 0.28, 2.5 + side * 0.7],
			0,
			'post',
		);
	// A chimney and a lantern by the door.
	box(
		group,
		'#8f8877',
		[0.55, 1.6, 0.55],
		[-1.3, height + 1.7, -1.2],
		0,
		'concrete',
	);
	solids.push({ x, z, w: w * 2 + 0.4, d: d * 2 + 0.4 });
	solids.push(
		{ x: x + w + 1.5, z: z - 1.25, w: 0.3, d: 0.3 },
		{ x: x + w + 1.5, z: z + 1.25, w: 0.3, d: 0.3 },
	);
	return { windowMaterial: glass };
}
