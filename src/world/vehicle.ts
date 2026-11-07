import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { box, cylinder, material } from './primitives.ts';
import { RIG, type RigPose } from '../game/trailer.ts';
import { mergeStatic } from '../rendering/merge.ts';
import type { Vector3Tuple } from '../rendering/types.ts';

const PAINT = '#3f5f4a',
	CREAM = '#efe6d2',
	TRIM = '#26292b',
	CHROME = '#c7cdcf';

/** A box with rounded edges, for the car's body panels. */
function rounded(
	parent: THREE.Object3D,
	color: string,
	size: Vector3Tuple,
	position: Vector3Tuple,
	radius = 0.08,
	finish: Parameters<typeof material>[1] = 'paint',
) {
	const mesh = new THREE.Mesh(
		new RoundedBoxGeometry(...size, 3, radius),
		material(color, finish),
	);
	mesh.position.set(...position);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	parent.add(mesh);
	return mesh;
}

function wheel(parent: THREE.Object3D, x: number, z: number, radius: number) {
	const tyre = cylinder(
		parent,
		'#1f2123',
		radius,
		0.3,
		[x, radius, z],
		radius,
		'plain',
	);
	tyre.rotation.z = Math.PI / 2;
	const hub = cylinder(
		parent,
		'#b9bec0',
		radius * 0.55,
		0.32,
		[x, radius, z],
		radius * 0.55,
		'paint',
	);
	hub.rotation.z = Math.PI / 2;
	const cap = cylinder(parent, '#8d9496', radius * 0.2, 0.34, [x, radius, z]);
	cap.rotation.z = Math.PI / 2;
}

/**
 * A boxy green four-by-four and a two-tone horse trailer with its ramp down,
 * built in the rig's frame (see `RIG`). Headlights and tail lights glow at
 * night.
 */
export function createVehicle(scene: THREE.Scene) {
	const root = new THREE.Group();
	root.name = 'vehicle';
	scene.add(root);
	const glass = new THREE.MeshStandardMaterial({
		color: '#1d2a33',
		roughness: 0.08,
		metalness: 0.3,
	});
	glass.name = 'vehicle-glass';
	const lamp = new THREE.MeshStandardMaterial({
		color: '#fff7df',
		emissive: '#fff1c8',
		emissiveIntensity: 0.1,
		roughness: 0.2,
	});
	lamp.name = 'vehicle-headlight';
	const tail = new THREE.MeshStandardMaterial({
		color: '#b3261e',
		emissive: '#ff3a2a',
		emissiveIntensity: 0.1,
		roughness: 0.3,
	});
	tail.name = 'vehicle-taillight';
	const pane = (size: Vector3Tuple, position: Vector3Tuple) => {
		const mesh = box(root, '#1d2a33', size, position);
		mesh.material = glass;
		mesh.castShadow = false;
		return mesh;
	};

	// The car: body, cabin, bonnet, bumpers and wheels.
	const { car } = RIG;
	const length = car.front - car.back,
		middle = (car.front + car.back) / 2;
	rounded(root, PAINT, [2.0, 0.95, length], [0, 0.95, middle], 0.12);
	rounded(root, PAINT, [1.94, 0.95, 2.9], [0, 1.85, middle - 0.55], 0.1);
	rounded(root, CREAM, [1.98, 0.08, 3.0], [0, 2.35, middle - 0.55], 0.04);
	// Windscreen, side windows and the rear window.
	const glassFront = pane([1.7, 0.72, 0.05], [0, 1.9, middle + 0.93]);
	glassFront.rotation.x = -0.18;
	for (const side of [-1, 1]) {
		pane([0.05, 0.62, 1.05], [side * 0.975, 1.92, middle + 0.25]);
		pane([0.05, 0.62, 1.2], [side * 0.975, 1.92, middle - 1.05]);
		box(root, PAINT, [0.06, 0.66, 0.08], [side * 0.98, 1.92, middle - 0.36]);
		// Door seams, handles and a mirror on each side.
		box(root, TRIM, [0.02, 0.9, 0.02], [side * 1.005, 1.1, middle + 0.85]);
		box(root, TRIM, [0.02, 0.9, 0.02], [side * 1.005, 1.1, middle - 0.36]);
		box(root, CHROME, [0.03, 0.04, 0.2], [side * 1.02, 1.3, middle + 0.55]);
		box(root, TRIM, [0.2, 0.16, 0.1], [side * 1.1, 1.78, middle + 1.0]);
		// Black wheel arches and wide sills.
		for (const z of [car.front - 1.05, car.back + 0.95])
			rounded(
				root,
				TRIM,
				[0.16, 0.5, 1.2],
				[side * 0.98, 0.72, z],
				0.06,
				'plain',
			);
		box(root, TRIM, [0.12, 0.1, 2.2], [side * 1.0, 0.5, middle], 0, 'plain');
	}
	pane([1.6, 0.55, 0.05], [0, 1.95, middle - 2.0]);
	// Grille, headlights, bumpers and a spare wheel on the back door.
	box(root, TRIM, [1.3, 0.34, 0.05], [0, 1.05, car.front + 0.005], 0, 'plain');
	for (let i = 0; i < 5; i++)
		box(
			root,
			CHROME,
			[1.2, 0.025, 0.02],
			[0, 0.93 + i * 0.06, car.front + 0.03],
		);
	for (const side of [-1, 1]) {
		const light = cylinder(root, '#fff7df', 0.13, 0.06, [
			side * 0.78,
			1.08,
			car.front + 0.01,
		]);
		light.rotation.x = Math.PI / 2;
		light.material = lamp;
		const back = box(
			root,
			'#b3261e',
			[0.12, 0.3, 0.04],
			[side * 0.9, 1.1, car.back - 0.005],
		);
		back.material = tail;
	}
	rounded(
		root,
		TRIM,
		[2.06, 0.26, 0.24],
		[0, 0.55, car.front + 0.05],
		0.05,
		'plain',
	);
	rounded(
		root,
		TRIM,
		[2.06, 0.22, 0.2],
		[0, 0.52, car.back - 0.05],
		0.05,
		'plain',
	);
	const spare = cylinder(
		root,
		'#1f2123',
		0.4,
		0.26,
		[0, 1.35, car.back - 0.16],
		0.4,
		'plain',
	);
	spare.rotation.x = Math.PI / 2;
	const spareCover = cylinder(root, CREAM, 0.3, 0.28, [
		0,
		1.35,
		car.back - 0.16,
	]);
	spareCover.rotation.x = Math.PI / 2;
	// A roof rack with a bale of hay tied on.
	for (const x of [-0.8, 0.8])
		box(root, TRIM, [0.05, 0.05, 2.4], [x, 2.45, middle - 0.55]);
	for (const z of [-1.1, 0, 1.1])
		box(root, TRIM, [1.65, 0.04, 0.05], [0, 2.47, middle - 0.55 + z]);
	box(root, '#d6bd72', [0.9, 0.42, 0.55], [0, 2.7, middle - 0.9], 0.1, 'straw');
	for (const z of [car.front - 1.05, car.back + 0.95])
		for (const side of [-1, 1]) wheel(root, side * 0.88, z, 0.42);
	// The tow bar reaching back to the hitch.
	box(root, TRIM, [0.12, 0.1, car.back], [0, 0.48, car.back / 2]);
	const ball = cylinder(root, CHROME, 0.06, 0.1, [0, 0.58, 0]);
	ball.castShadow = false;

	// The trailer: aluminium sides below, a canvas top above, ramp lowered.
	const { trailer, ramp } = RIG;
	const tLength = trailer.front - trailer.back,
		tMiddle = (trailer.front + trailer.back) / 2,
		floor = trailer.floor,
		height = trailer.roof;
	const shell = '#dfe3e4',
		canvas = '#2f4a3d';
	box(
		root,
		'#6d7471',
		[2.1, 0.12, tLength],
		[0, floor - 0.06, tMiddle],
		0,
		'plain',
	);
	for (const side of [-1, 1]) {
		box(
			root,
			shell,
			[0.05, 1.4, tLength],
			[side * (trailer.halfWidth - 0.03), floor + 0.7, tMiddle],
			0,
			'paint',
		);
		box(
			root,
			canvas,
			[0.05, height - floor - 1.4, tLength - 0.7],
			[
				side * (trailer.halfWidth - 0.03),
				floor + 1.4 + (height - floor - 1.4) / 2,
				tMiddle + 0.35,
			],
			0,
			'plain',
		);
		// A little window in each side of the canvas.
		pane(
			[0.07, 0.5, 0.9],
			[side * (trailer.halfWidth - 0.03), floor + 2.6, trailer.front - 1.1],
		);
		box(
			root,
			'#c5ccce',
			[0.07, 0.06, tLength],
			[side * (trailer.halfWidth - 0.02), floor + 1.4, tMiddle],
		);
		// Mudguards over the axle.
		rounded(
			root,
			shell,
			[0.3, 0.12, 1.3],
			[side * (trailer.halfWidth + 0.1), 0.72, tMiddle],
			0.04,
		);
		wheel(root, side * (trailer.halfWidth - 0.05), tMiddle, 0.33);
		// Open upper rear doors folded against the sides.
		box(
			root,
			canvas,
			[0.04, height - floor - 1.45, 0.95],
			[
				side * (trailer.halfWidth + 0.05),
				floor + 1.45 + (height - floor - 1.45) / 2,
				trailer.back + 0.48,
			],
		).rotation.y = side * 0.1;
	}
	// A rounded polyester nose and roof.
	rounded(
		root,
		shell,
		[2.16, height - floor, 0.7],
		[0, floor + (height - floor) / 2, trailer.front - 0.2],
		0.3,
	);
	rounded(root, shell, [2.2, 0.14, tLength + 0.05], [0, height, tMiddle], 0.06);
	// The lower rear frame, a centre post and the drawbar.
	for (const side of [-1, 1])
		box(
			root,
			shell,
			[0.14, height - floor, 0.12],
			[
				side * (trailer.halfWidth - 0.06),
				floor + (height - floor) / 2,
				trailer.back + 0.06,
			],
		);
	box(root, shell, [2.1, 0.18, 0.12], [0, height - 0.12, trailer.back + 0.06]);
	for (const side of [-1, 1]) {
		const arm = box(
			root,
			TRIM,
			[0.1, 0.1, 1.45],
			[side * 0.3, 0.52, trailer.front + 0.62],
		);
		arm.rotation.y = side * 0.4;
	}
	box(root, TRIM, [0.12, 0.12, 0.9], [0, 0.55, -0.45]);
	cylinder(root, TRIM, 0.05, 0.45, [0.2, 0.3, trailer.front + 0.35]);
	const jockey = cylinder(root, '#1f2123', 0.1, 0.06, [
		0.2,
		0.1,
		trailer.front + 0.35,
	]);
	jockey.rotation.z = Math.PI / 2;
	for (const side of [-1, 1]) {
		const light = box(
			root,
			'#b3261e',
			[0.22, 0.1, 0.04],
			[side * 0.85, 0.3, trailer.back - 0.02],
		);
		light.material = tail;
	}
	// Straw on the floor and a hay net at the front of the stall.
	box(
		root,
		'#c9ae6a',
		[1.9, 0.03, tLength - 0.3],
		[0, floor + 0.015, tMiddle],
		0,
		'straw',
	);
	const net = new THREE.Mesh(
		new THREE.IcosahedronGeometry(0.3, 1),
		material('#c9ae6a', 'straw'),
	);
	net.scale.set(1, 1.2, 0.8);
	net.position.set(0.55, floor + 1.35, trailer.front - 0.4);
	root.add(net);
	// The ramp: boards with cleats, sloping to the ground.
	const rampGroup = new THREE.Group();
	rampGroup.position.set(0, floor, trailer.back);
	const drop = trailer.back - ramp.end;
	rampGroup.rotation.x = -Math.atan2(floor, drop);
	root.add(rampGroup);
	const rampLength = Math.hypot(drop, floor);
	box(
		rampGroup,
		'#8a8f8c',
		[ramp.halfWidth * 2, 0.08, rampLength],
		[0, -0.04, -rampLength / 2],
		0,
		'plain',
	);
	for (let i = 1; i < 7; i++)
		box(
			rampGroup,
			'#5d5f5b',
			[ramp.halfWidth * 2 - 0.1, 0.04, 0.05],
			[0, 0.01, -(i * rampLength) / 7],
		);
	for (const side of [-1, 1])
		box(
			rampGroup,
			shell,
			[0.05, 0.25, rampLength],
			[side * ramp.halfWidth, 0.1, -rampLength / 2],
		);
	mergeStatic(root);
	return {
		root,
		/** Parks the rig: the hitch at (x, z), the car facing `heading`. */
		place(pose: RigPose) {
			root.position.set(pose.x, 0, pose.z);
			root.rotation.y = pose.heading;
			root.updateMatrixWorld(true);
		},
		update(darkness: number) {
			const night = THREE.MathUtils.smoothstep(darkness, 0.3, 0.7);
			lamp.emissiveIntensity = 0.1 + night * 1.6;
			tail.emissiveIntensity = 0.1 + night * 1.2;
		},
	};
}
