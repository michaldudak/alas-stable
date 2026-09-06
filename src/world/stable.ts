import type { HorseModel } from '../horse/types.ts';
import type { Vector3Tuple } from '../rendering/types.ts';
import type { Solid } from '../game/types.ts';
import { context2d } from '../platform/dom.ts';
import * as THREE from 'three';
import { createHorse } from '../horse/model.ts';
import { STABLE, STABLE_WALLS, stableSolids } from './stable-layout.ts';

export function createStable(scene: THREE.Scene, solids: Solid[]) {
	const root = new THREE.Group();
	root.position.set(STABLE.x, 0, STABLE.z);
	scene.add(root);
	const cameraBlockers: THREE.Object3D[] = [],
		horses: HorseModel[] = [];
	const materials = new Map<
		THREE.ColorRepresentation,
		THREE.MeshStandardMaterial
	>();
	const mat = (color: THREE.ColorRepresentation) => {
		if (!materials.has(color))
			materials.set(
				color,
				new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
			);
		return materials.get(color)!;
	};
	function box(
		color: THREE.ColorRepresentation,
		size: Vector3Tuple,
		pos: Vector3Tuple,
		parent = root,
		blockCamera = false,
	) {
		const object = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color));
		object.position.set(...pos);
		object.castShadow = true;
		object.receiveShadow = true;
		parent.add(object);
		if (blockCamera) cameraBlockers.push(object);
		return object;
	}
	function cylinder(
		color: THREE.ColorRepresentation,
		radius: number,
		height: number,
		pos: Vector3Tuple,
		parent = root,
	) {
		const object = new THREE.Mesh(
			new THREE.CylinderGeometry(radius, radius, height, 12),
			mat(color),
		);
		object.position.set(...pos);
		object.castShadow = true;
		object.receiveShadow = true;
		parent.add(object);
		return object;
	}
	function oval(
		color: THREE.ColorRepresentation,
		scale: Vector3Tuple,
		pos: Vector3Tuple,
		parent = root,
	) {
		const object = new THREE.Mesh(
			new THREE.SphereGeometry(1, 16, 10),
			mat(color),
		);
		object.scale.set(...scale);
		object.position.set(...pos);
		object.castShadow = true;
		parent.add(object);
		return object;
	}
	function label(text: string, pos: Vector3Tuple, width = 3, rotation = 0) {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 128;
		const ctx = context2d(canvas);
		ctx.fillStyle = '#344b40';
		ctx.fillRect(0, 0, 512, 128);
		ctx.strokeStyle = '#cfb47b';
		ctx.lineWidth = 7;
		ctx.strokeRect(9, 9, 494, 110);
		ctx.fillStyle = '#fff2d4';
		ctx.font = '600 42px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, 256, 66);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		const object = new THREE.Mesh(
			new THREE.BoxGeometry(width, width / 4, 0.06),
			new THREE.MeshStandardMaterial({ map: texture }),
		);
		object.position.set(...pos);
		object.rotation.y = rotation;
		root.add(object);
	}
	solids.push(...stableSolids());
	// Paved, level thresholds and a broad central aisle, without a collision slab.
	box('#b4aaa0', [24, 0.08, 26], [0, -0.045, 0]);
	box('#bcae94', [9, 0.05, 9], [0, -0.01, 17]);
	for (let z = -12.5; z < 13; z += 1)
		for (let x = -3; x < 3.6; x += 1.2)
			box(
				(Math.round(z * 2) + Math.round(x * 5)) % 3 ? '#bdb8a9' : '#c7c1b1',
				[1.17, 0.025, 0.97],
				[x, 0, z],
			);
	for (const wall of STABLE_WALLS) {
		const outer = Math.abs(wall.x) >= 11 || Math.abs(wall.z) >= 13;
		box(
			outer ? '#e0d3b7' : '#976d48',
			[wall.w, wall.h, wall.d],
			[wall.x, wall.h / 2, wall.z],
			root,
			true,
		);
		if (outer) {
			box(
				'#8f8877',
				[wall.w + 0.04, 0.65, wall.d + 0.04],
				[wall.x, 0.325, wall.z],
			);
			box(
				'#735942',
				[wall.w + 0.08, 0.16, wall.d + 0.08],
				[wall.x, 5.95, wall.z],
			);
		}
		if (wall.stall) {
			for (
				let z = wall.z - wall.d / 2 + 0.25;
				z < wall.z + wall.d / 2;
				z += 0.42
			)
				box('#795338', [0.24, 1.72, 0.055], [wall.x, 0.9, z]);
			for (
				let z = wall.z - wall.d / 2 + 0.3;
				z < wall.z + wall.d / 2 - 0.2;
				z += 0.42
			) {
				if (wall.d < 8 || Math.abs(z - wall.z) > 1.25)
					cylinder('#454c47', 0.035, 1.7, [wall.x, 2.7, z]);
			}
			box('#4d534c', [0.23, 0.14, wall.d - 0.1], [wall.x, 3.6, wall.z]);
			box('#ccb487', [0.26, 0.13, wall.d - 0.1], [wall.x, 1.86, wall.z]);
			box(
				'#454c47',
				[0.3, 0.17, 0.4],
				[
					wall.x + (wall.x < 0 ? 0.18 : -0.18),
					1.45,
					wall.z + Math.min(1.1, wall.d / 2 - 0.3),
				],
			);
		}
	}
	// Tall openings at both ends; lintels leave room for horse and rider.
	for (const z of [-13, 13]) {
		box('#75553b', [7.6, 0.35, 0.65], [0, 5.65, z], root, true);
		for (const side of [-1, 1]) {
			box('#75553b', [0.32, 5.65, 0.65], [side * 3.8, 2.82, z]);
			// Sliding door leaves are already parked against the front wall.
			box(
				'#7b5137',
				[3.55, 5.2, 0.18],
				[side * 5.8, 2.62, z + (z > 0 ? 0.35 : -0.35)],
			);
			for (let x = -1.55; x < 1.7; x += 0.36)
				box(
					'#99704e',
					[0.045, 5.06, 0.04],
					[side * 5.8 + x, 2.62, z + (z > 0 ? 0.46 : -0.46)],
				);
			box(
				'#ddc9a0',
				[3.4, 0.16, 0.09],
				[side * 5.8, 0.3, z + (z > 0 ? 0.49 : -0.49)],
			);
			box(
				'#ddc9a0',
				[3.4, 0.16, 0.09],
				[side * 5.8, 4.95, z + (z > 0 ? 0.49 : -0.49)],
			);
			const brace = box(
				'#cfbb95',
				[0.16, 5.3, 0.1],
				[side * 5.8, 2.63, z + (z > 0 ? 0.5 : -0.5)],
			);
			brace.rotation.z = side * 0.57;
		}
		box('#3c443e', [15.5, 0.1, 0.18], [0, 5.38, z + (z > 0 ? 0.5 : -0.5)]);
	}
	// Continuous pitched roof, gables and exposed structural timber.
	const roofAngle = Math.atan2(3.2, 12.8),
		roofWidth = Math.hypot(12.8, 3.2);
	for (const side of [-1, 1]) {
		const roof = box(
			'#4c5c57',
			[roofWidth, 0.24, 28],
			[side * 6.4, 7.6, 0],
			root,
			true,
		);
		roof.rotation.z = -side * roofAngle;
		for (let z = -13.7; z <= 13.7; z += 0.58) {
			const rib = box(
				'#5a6b63',
				[roofWidth, 0.045, 0.045],
				[side * 6.4, 7.76, z],
			);
			rib.rotation.z = -side * roofAngle;
		}
		box('#514536', [0.18, 0.22, 28], [side * 12.65, 5.92, 0]);
		cylinder('#515950', 0.1, 5.9, [side * 12.5, 2.95, 12.7]);
	}
	for (const z of [-13, 13]) {
		const shape = new THREE.Shape();
		shape.moveTo(-12, 6);
		shape.lineTo(12, 6);
		shape.lineTo(0, 9);
		shape.closePath();
		const gable = new THREE.Mesh(
			new THREE.ShapeGeometry(shape),
			new THREE.MeshStandardMaterial({
				color: '#d5c4a0',
				side: THREE.DoubleSide,
			}),
		);
		gable.position.z = z;
		gable.castShadow = true;
		root.add(gable);
		cameraBlockers.push(gable);
		box('#71533b', [0.22, 2.75, 0.2], [0, 7.35, z + 0.05]);
	}
	for (const z of [-11, -5, 3, 11]) {
		box('#795e40', [23.8, 0.23, 0.25], [0, 6.03, z]);
		for (const side of [-1, 1]) {
			const beam = box(
				'#795e40',
				[roofWidth, 0.2, 0.23],
				[side * 6.25, 7.53, z],
			);
			beam.rotation.z = -side * roofAngle;
			box('#75573c', [0.22, 5.8, 0.22], [side * 3.7, 2.9, z]);
		}
		cylinder('#484c41', 0.045, 0.8, [0, 5.65, z]);
		const lamp = cylinder('#f0d298', 0.26, 0.2, [0, 5.2, z]);
		lamp.material = new THREE.MeshStandardMaterial({
			color: '#f3d49b',
			emissive: '#ffce80',
			emissiveIntensity: 0.5,
		});
		const light = new THREE.PointLight('#ffe3ad', 16, 15, 2);
		light.position.set(0, 4.9, z);
		root.add(light);
	}
	// High windows read as pale glass from both the inside and the outside.
	for (const side of [-1, 1])
		for (const z of [-9, -1, 7]) {
			for (const face of [-1, 1]) {
				const x = side * 12 + face * 0.22;
				box('#a0bbc0', [0.025, 1.35, 2.4], [x, 4.25, z]);
				for (const dz of [-1.28, 1.28])
					box('#f0e1bc', [0.06, 1.55, 0.14], [x + face * 0.03, 4.25, z + dz]);
				for (const y of [3.5, 5])
					box('#f0e1bc', [0.06, 0.14, 2.65], [x + face * 0.03, y, z]);
				box('#f0e1bc', [0.06, 1.5, 0.09], [x + face * 0.04, 4.25, z]);
			}
		}
	const stalls: [number, number, string, string | null][] = [
		[-1, -9, 'LUNA', '#e6e0d2'],
		[-1, -1, 'FUKS', '#aa6941'],
		[-1, 7, 'Raven', null],
		[1, -9, 'BURZA', '#343330'],
		[1, -1, 'KASZTAN', '#665046'],
	];
	for (const [side, z, name, color] of stalls) {
		box('#b7a16a', [7.65, 0.06, 7.65], [side * 7.8, 0.075, z]);
		for (let i = 0; i < 35; i++) {
			const straw = box(
				i % 2 ? '#d6bf78' : '#cbb074',
				[0.6, 0.016, 0.035],
				[
					side * 7.8 + Math.sin(i * 13.7) * 3.3,
					0.12,
					z + Math.cos(i * 8.3) * 3.3,
				],
			);
			straw.rotation.y = i * 1.7;
		}
		if (color !== null) {
			const horse = createHorse();
			horse.setAppearance({
				coat: color,
				hair: side < 0 ? '#47332d' : '#d7b879',
				maneStyle: name === 'LUNA' ? 'braided' : 'long',
			});
			horse.rider.visible = false;
			horse.tack.visible = false;
			horse.root.name = name;
			horse.root.position.set(side * 6.5, 0.09, z);
			horse.root.rotation.y = (-side * Math.PI) / 2;
			root.add(horse.root);
			horses.push(horse);
		}
		cylinder('#4e7977', 0.36, 0.48, [side * 4.5, 0.4, z - 2.8]);
		cylinder('#8cb6b8', 0.3, 0.025, [side * 4.5, 0.65, z - 2.8]);
		box('#8e7045', [1.5, 0.55, 0.9], [side * 10.5, 0.48, z - 2.8]);
		oval('#c9b170', [0.65, 0.28, 0.36], [side * 10.5, 0.87, z - 2.8]);
		label(name, [side * 3.53, 2.05, z + 2.8], 1.6, (-side * Math.PI) / 2);
	}
	// Tack room: wall-mounted saddle racks, bridles, folded pads and grooming kit.
	label('SIODLARNIA', [3.55, 4.1, 7], 3.2, -Math.PI / 2);
	box('#d0c2a5', [7.9, 0.035, 9.6], [7.8, -0.005, 8]);
	for (const z of [4.8, 7.8, 10.6]) {
		box('#6b5139', [0.15, 0.6, 0.15], [11.55, 2.7, z]);
		box('#6b5139', [1.3, 0.12, 0.14], [11, 2.65, z]);
		const saddle = new THREE.Group();
		saddle.position.set(10.8, 2.7, z);
		saddle.rotation.y = Math.PI / 2;
		root.add(saddle);
		oval('#704c31', [0.48, 0.12, 0.57], [0, 0.03, 0], saddle);
		for (const side of [-1, 1])
			oval('#825a39', [0.08, 0.4, 0.36], [side * 0.43, -0.23, 0.02], saddle);
		oval('#64452f', [0.48, 0.19, 0.12], [0, 0.13, -0.48], saddle);
		oval('#64452f', [0.33, 0.14, 0.1], [0, 0.12, 0.4], saddle);
		solids.push({ x: STABLE.x + 11, z: STABLE.z + z, w: 1.4, d: 1.4 });
		const bridle = new THREE.Mesh(
			new THREE.TorusGeometry(0.28, 0.025, 8, 28),
			mat('#634a35'),
		);
		bridle.position.set(11.73, 1.7, z);
		bridle.rotation.y = Math.PI / 2;
		root.add(bridle);
	}
	box('#8d6d49', [5.6, 0.16, 0.8], [7.6, 1.55, 12.15]);
	for (const x of [5.2, 10]) box('#785c3f', [0.17, 1.5, 0.6], [x, 0.75, 12.15]);
	solids.push({ x: STABLE.x + 7.6, z: STABLE.z + 12.15, w: 5.6, d: 0.8 });
	for (let i = 0; i < 6; i++)
		box(
			['#58857e', '#b6736a', '#c8b26d'][i % 3],
			[1.1, 0.13, 0.65],
			[5.7 + (i % 3) * 1.55, 1.72 + Math.floor(i / 3) * 0.14, 12.15],
		);
	box('#596f65', [1.1, 0.4, 0.65], [5, 0.3, 4]);
	for (let i = 0; i < 4; i++)
		box('#bc995d', [0.14, 0.25, 0.13], [4.65 + i * 0.22, 0.61, 4]);
	solids.push({ x: STABLE.x + 5, z: STABLE.z + 4, w: 1.1, d: 0.65 });
	label('KOŃSKA POLANA', [0, 6.55, 13.23], 6.5);
	label('SIODLARNIA  →', [0, 4.7, 4], 3.4);
	// Hay storage outside the entrance, clear of the driveway.
	for (let i = 0; i < 4; i++)
		box(
			'#c6ac69',
			[1.7, 1.2, 1.2],
			[-9 + (i % 2) * 1.85, 0.6, 15 + Math.floor(i / 2) * 1.35],
		);
	solids.push({ x: STABLE.x - 8.1, z: STABLE.z + 15.65, w: 3.6, d: 2.6 });
	root.updateMatrixWorld(true);
	return {
		root,
		cameraBlockers,
		horses,
		update(time: number, active?: HorseModel) {
			horses.forEach((horse, i) => {
				if (horse === active) return;
				horse.tail.rotation.z = Math.sin(time * 1.1 + i) * 0.1;
				horse.body.position.y = Math.sin(time * 0.9 + i) * 0.012;
			});
		},
	};
}
