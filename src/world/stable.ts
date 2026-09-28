import { t, onLanguageChange, type MessageKey } from '../i18n/index.ts';
import type { HorseModel } from '../horse/types.ts';
import type { Vector3Tuple } from '../rendering/types.ts';
import type { Solid } from '../game/types.ts';
import { context2d } from '../platform/dom.ts';
import * as THREE from 'three';
import { createHorse } from '../horse/model.ts';
import { detailedMaterial, type Finish } from './surface-detail.ts';
import {
	AISLE_HALF_WIDTH,
	bayCenter,
	halfDepth,
	stableSolids,
	stableWalls,
	type StableSpec,
} from './stable-layout.ts';
import { mergeStatic } from '../rendering/merge.ts';
import { profile, resident, stallNumber } from './roster.ts';

// Building colours double as material keys for their surface finish.
const FINISHES: Record<string, Finish> = {
	'#e0d3b7': 'siding',
	'#9a4a3b': 'siding',
	'#7a624b': 'siding',
	'#976d48': 'boards',
	'#8a6446': 'boards',
	'#8f8877': 'concrete',
	'#b4aaa0': 'concrete',
	'#bcae94': 'concrete',
	'#bdb8a9': 'concrete',
	'#c7c1b1': 'concrete',
	'#d0c2a5': 'concrete',
	'#4c5c57': 'roofing',
	'#5a6b63': 'roofing',
	'#3e4547': 'roofing',
	'#4b5456': 'roofing',
	'#5b6a44': 'roofing',
	'#687a4f': 'roofing',
	'#7b5137': 'door',
	'#8e4436': 'door',
	'#46604f': 'door',
	'#99704e': 'post',
	'#a3503f': 'post',
	'#557060': 'post',
	'#795338': 'post',
	'#75573c': 'post',
	'#785c3f': 'post',
	'#6b5139': 'post',
	'#735942': 'wood',
	'#75553b': 'wood',
	'#795e40': 'wood',
	'#71533b': 'wood',
	'#514536': 'wood',
	'#8d6d49': 'wood',
	'#8e7045': 'wood',
	'#ddc9a0': 'paint',
	'#eee6d4': 'paint',
	'#e3d7bd': 'paint',
	'#cfbb95': 'paint',
	'#ccb487': 'paint',
	'#b7a16a': 'straw',
	'#d6bf78': 'straw',
	'#cbb074': 'straw',
	'#c6ac69': 'straw',
	'#c9b170': 'straw',
};

type Palette = {
	siding: string;
	inner: string;
	gable: string;
	roof: string;
	rib: string;
	door: string;
	batten: string;
	trim: string;
	sign: MessageKey;
};

const PALETTES: Record<StableSpec['id'], Palette> = {
	main: {
		siding: '#e0d3b7',
		inner: '#976d48',
		gable: '#d5c4a0',
		roof: '#4c5c57',
		rib: '#5a6b63',
		door: '#7b5137',
		batten: '#99704e',
		trim: '#ddc9a0',
		sign: 'sign.glade',
	},
	// A red-painted barn with white trim.
	linden: {
		siding: '#9a4a3b',
		inner: '#8a6446',
		gable: '#8e4638',
		roof: '#3e4547',
		rib: '#4b5456',
		door: '#8e4436',
		batten: '#a3503f',
		trim: '#eee6d4',
		sign: 'sign.linden',
	},
	// Weathered timber under a moss-green roof.
	meadow: {
		siding: '#7a624b',
		inner: '#8a6446',
		gable: '#735c47',
		roof: '#5b6a44',
		rib: '#687a4f',
		door: '#46604f',
		batten: '#557060',
		trim: '#e3d7bd',
		sign: 'sign.meadow',
	},
};

export function createStable(
	scene: THREE.Scene,
	solids: Solid[],
	spec: StableSpec,
) {
	const palette = PALETTES[spec.id];
	const depth = halfDepth(spec),
		last = bayCenter(spec, spec.bays - 1);
	const root = new THREE.Group();
	root.name = `stable-${spec.id}`;
	root.position.set(spec.x, 0, spec.z);
	scene.add(root);
	const blockers = new Set<THREE.Object3D>(),
		horses: HorseModel[] = [],
		lamps: THREE.Vector3[] = [];
	const materials = new Map<string, THREE.MeshStandardMaterial>();
	const mat = (color: string) => {
		if (!materials.has(color))
			materials.set(color, detailedMaterial(color, FINISHES[color] ?? 'plain'));
		return materials.get(color)!;
	};
	function box(
		color: string,
		size: Vector3Tuple,
		pos: Vector3Tuple,
		parent: THREE.Object3D = root,
		blockCamera = false,
	) {
		const object = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color));
		object.position.set(...pos);
		object.castShadow = true;
		object.receiveShadow = true;
		parent.add(object);
		if (blockCamera) blockers.add(object);
		return object;
	}
	function cylinder(
		color: string,
		radius: number,
		height: number,
		pos: Vector3Tuple,
		parent: THREE.Object3D = root,
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
		color: string,
		scale: Vector3Tuple,
		pos: Vector3Tuple,
		parent: THREE.Object3D = root,
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
	/**
	 * A stall nameplate: the stall number on a brass disc and the resident's
	 * name, or a horseshoe on a vacant stall. Returns a renamer.
	 */
	function nameplate(
		number: number,
		name: string | undefined,
		pos: Vector3Tuple,
		rotation: number,
	) {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 128;
		const ctx = context2d(canvas);
		const draw = (text: string | undefined) => {
			ctx.fillStyle = '#2f4a3f';
			ctx.fillRect(0, 0, 512, 128);
			ctx.strokeStyle = '#cfb47b';
			ctx.lineWidth = 7;
			ctx.strokeRect(9, 9, 494, 110);
			ctx.fillStyle = '#d8bd82';
			ctx.beginPath();
			ctx.arc(70, 64, 40, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#2f4a3f';
			ctx.font = '700 44px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(number), 70, 67, 64);
			if (text) {
				ctx.fillStyle = '#fff2d4';
				ctx.font = '600 46px sans-serif';
				ctx.textAlign = 'left';
				ctx.fillText(text.toLocaleUpperCase('pl'), 132, 67, 360);
			} else {
				// A vacant stall shows a horseshoe instead of a name.
				ctx.strokeStyle = '#a8a58f';
				ctx.lineWidth = 12;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.arc(300, 60, 30, Math.PI * 0.15, Math.PI * 0.85, true);
				ctx.stroke();
			}
		};
		draw(name);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
		const plate = new THREE.Mesh(
			new THREE.BoxGeometry(1.6, 0.4, 0.06),
			new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 }),
		);
		plate.position.set(...pos);
		plate.rotation.y = rotation;
		root.add(plate);
		return (text: string) => {
			draw(text);
			texture.needsUpdate = true;
		};
	}
	function label(text: string, pos: Vector3Tuple, width = 3, rotation = 0) {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 128;
		const ctx = context2d(canvas);
		const draw = () => {
			ctx.fillStyle = '#344b40';
			ctx.fillRect(0, 0, 512, 128);
			ctx.strokeStyle = '#cfb47b';
			ctx.lineWidth = 7;
			ctx.strokeRect(9, 9, 494, 110);
			ctx.fillStyle = '#fff2d4';
			ctx.font = '600 42px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(
				text.startsWith('sign.') ? t(text as MessageKey) : text,
				256,
				66,
				470,
			);
		};
		draw();
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		const unsubscribe = onLanguageChange(() => {
			draw();
			texture.needsUpdate = true;
		});
		texture.addEventListener('dispose', unsubscribe);
		const object = new THREE.Mesh(
			new THREE.BoxGeometry(width, width / 4, 0.06),
			new THREE.MeshStandardMaterial({ map: texture }),
		);
		object.position.set(...pos);
		object.rotation.y = rotation;
		root.add(object);
	}
	const solid = (x: number, z: number, w: number, d: number) =>
		solids.push({ x: spec.x + x, z: spec.z + z, w, d });
	solids.push(...stableSolids(spec));
	// Paved, level thresholds and a broad central aisle, without a collision slab.
	box('#b4aaa0', [24, 0.08, depth * 2], [0, -0.045, 0]);
	for (const end of [-1, 1])
		if (end > 0 || spec.id !== 'main')
			box('#bcae94', [9, 0.05, 9], [0, -0.01, end * (depth + 4)]);
	for (let z = -depth + 0.5; z < depth; z += 1)
		for (let x = -3; x < 3.6; x += 1.2)
			box(
				(Math.round(z * 2) + Math.round(x * 5)) % 3 ? '#bdb8a9' : '#c7c1b1',
				[1.17, 0.025, 0.97],
				[x, 0, z],
			);
	for (const wall of stableWalls(spec)) {
		const outer = Math.abs(wall.x) >= 11 || Math.abs(wall.z) >= depth;
		box(
			outer ? palette.siding : palette.inner,
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
			)
				cylinder('#454c47', 0.035, 1.7, [wall.x, 2.7, z]);
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
	for (const z of [-depth, depth]) {
		const out = z > 0 ? 1 : -1;
		box('#75553b', [7.6, 0.35, 0.65], [0, 5.65, z], root, true);
		for (const side of [-1, 1]) {
			box('#75553b', [0.32, 5.65, 0.65], [side * 3.8, 2.82, z]);
			// Sliding door leaves are already parked against the front wall.
			box(palette.door, [3.55, 5.2, 0.18], [side * 5.8, 2.62, z + out * 0.35]);
			for (let x = -1.55; x < 1.7; x += 0.36)
				box(
					palette.batten,
					[0.045, 5.06, 0.04],
					[side * 5.8 + x, 2.62, z + out * 0.46],
				);
			for (const y of [0.3, 4.95])
				box(palette.trim, [3.4, 0.16, 0.09], [side * 5.8, y, z + out * 0.49]);
			const brace = box(
				palette.trim,
				[0.16, 5.3, 0.1],
				[side * 5.8, 2.63, z + out * 0.5],
			);
			brace.rotation.z = side * 0.57;
		}
		box('#3c443e', [15.5, 0.1, 0.18], [0, 5.38, z + out * 0.5]);
	}
	// Continuous pitched roof, gables and exposed structural timber.
	const roofAngle = Math.atan2(3.2, 12.8),
		roofWidth = Math.hypot(12.8, 3.2);
	for (const side of [-1, 1]) {
		const roof = box(
			palette.roof,
			[roofWidth, 0.24, depth * 2 + 2],
			[side * 6.4, 7.6, 0],
			root,
			true,
		);
		roof.rotation.z = -side * roofAngle;
		for (let z = -depth - 0.7; z <= depth + 0.7; z += 0.58) {
			const rib = box(
				palette.rib,
				[roofWidth, 0.045, 0.045],
				[side * 6.4, 7.76, z],
			);
			rib.rotation.z = -side * roofAngle;
		}
		box('#514536', [0.18, 0.22, depth * 2 + 2], [side * 12.65, 5.92, 0]);
		cylinder('#515950', 0.1, 5.9, [side * 12.5, 2.95, depth - 0.3]);
	}
	const gableMaterial = detailedMaterial(palette.gable, 'siding', {
		side: THREE.DoubleSide,
	});
	for (const z of [-depth, depth]) {
		const shape = new THREE.Shape();
		shape.moveTo(-12, 6);
		shape.lineTo(12, 6);
		shape.lineTo(0, 9);
		shape.closePath();
		const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), gableMaterial);
		gable.position.z = z;
		gable.castShadow = true;
		root.add(gable);
		blockers.add(gable);
		box('#71533b', [0.22, 2.75, 0.2], [0, 7.35, z + 0.05]);
	}
	const beams = [-depth + 2];
	for (let i = 1; i < spec.bays; i++) beams.push(-depth + 8 * i);
	beams.push(depth - 2);
	const lampMaterial = new THREE.MeshStandardMaterial({
		color: '#f3d49b',
		emissive: '#ffce80',
		emissiveIntensity: 0.5,
	});
	lampMaterial.name = 'stable-lamp';
	for (const z of beams) {
		box('#795e40', [23.8, 0.23, 0.25], [0, 6.03, z]);
		for (const side of [-1, 1]) {
			const beam = box(
				'#795e40',
				[roofWidth, 0.2, 0.23],
				[side * 6.25, 7.53, z],
			);
			beam.rotation.z = -side * roofAngle;
			box('#75573c', [0.22, 5.8, 0.22], [side * AISLE_HALF_WIDTH, 2.9, z]);
		}
		cylinder('#484c41', 0.045, 0.3, [0, 5.9, z]);
		const lamp = cylinder('#f0d298', 0.24, 0.16, [0, 5.72, z]);
		lamp.material = lampMaterial;
		lamps.push(new THREE.Vector3(spec.x, 5.4, spec.z + z));
	}
	// High windows read as pale glass from both the inside and the outside.
	for (const side of [-1, 1])
		for (let i = 0; i < spec.bays; i++) {
			const z = bayCenter(spec, i);
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
	/** Horses that begin the day in their stalls, and a renamer for every plate. */
	const residents: { id: string; x: number; z: number; side: -1 | 1 }[] = [];
	const plates = new Map<string, (name: string) => void>();
	for (const side of [-1, 1] as const)
		for (let bay = 0; bay < spec.bays; bay++) {
			if (side > 0 && spec.tackRoom && bay === spec.bays - 1) continue;
			const z = bayCenter(spec, bay);
			box('#b7a16a', [7.65, 0.06, 7.65], [side * 7.8, 0.075, z]);
			for (let i = 0; i < 35; i++) {
				const straw = box(
					i % 2 ? '#d6bf78' : '#cbb074',
					[0.6, 0.016, 0.035],
					[
						side * 7.8 + Math.sin(i * 13.7 + bay) * 3.3,
						0.12,
						z + Math.cos(i * 8.3 + bay) * 3.3,
					],
				);
				straw.rotation.y = i * 1.7 + bay;
			}
			cylinder('#4e7977', 0.36, 0.48, [side * 4.5, 0.4, z - 2.8]);
			cylinder('#8cb6b8', 0.3, 0.025, [side * 4.5, 0.65, z - 2.8]);
			box('#8e7045', [1.5, 0.55, 0.9], [side * 10.5, 0.48, z - 2.8]);
			oval('#c9b170', [0.65, 0.28, 0.36], [side * 10.5, 0.87, z - 2.8]);
			const horse = resident(spec.id, bay, side);
			const rename = nameplate(
				stallNumber(spec, bay, side),
				horse?.name,
				[side * 3.53, 2.05, z + 2.8],
				(-side * Math.PI) / 2,
			);
			if (horse) {
				plates.set(horse.id, rename);
				if (horse.starts === 'stall')
					residents.push({ id: horse.id, x: side * 6.5, z, side });
			}
		}
	if (spec.tackRoom) {
		// Tack room: wall-mounted saddle racks, bridles, folded pads and grooming kit.
		label('sign.tack', [3.55, 4.1, last], 3.2, -Math.PI / 2);
		box('#d0c2a5', [7.9, 0.035, 9.6], [7.8, -0.005, last + 1]);
		for (const z of [last - 2.2, last + 0.8, last + 3.6]) {
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
			solid(11, z, 1.4, 1.4);
			const bridle = new THREE.Mesh(
				new THREE.TorusGeometry(0.28, 0.025, 8, 28),
				mat('#634a35'),
			);
			bridle.position.set(11.73, 1.7, z);
			bridle.rotation.y = Math.PI / 2;
			root.add(bridle);
		}
		const bench = last + 5.15;
		box('#8d6d49', [5.6, 0.16, 0.8], [7.6, 1.55, bench]);
		for (const x of [5.2, 10])
			box('#785c3f', [0.17, 1.5, 0.6], [x, 0.75, bench]);
		solid(7.6, bench, 5.6, 0.8);
		for (let i = 0; i < 6; i++)
			box(
				['#58857e', '#b6736a', '#c8b26d'][i % 3],
				[1.1, 0.13, 0.65],
				[5.7 + (i % 3) * 1.55, 1.72 + Math.floor(i / 3) * 0.14, bench],
			);
		box('#596f65', [1.1, 0.4, 0.65], [5, 0.3, last - 3]);
		for (let i = 0; i < 4; i++)
			box('#bc995d', [0.14, 0.25, 0.13], [4.65 + i * 0.22, 0.61, last - 3]);
		solid(5, last - 3, 1.1, 0.65);
		label('sign.tackDirection', [0, 4.7, last - 3], 3.4);
	}
	label(palette.sign, [0, 6.55, depth + 0.23], 6.5);
	if (spec.id !== 'main')
		label(palette.sign, [0, 6.55, -depth - 0.23], 6.5, Math.PI);
	// Hay storage outside the entrance, clear of the driveway.
	for (let i = 0; i < 4; i++)
		box(
			'#c6ac69',
			[1.7, 1.2, 1.2],
			[-9 + (i % 2) * 1.85, 0.6, depth + 2 + Math.floor(i / 2) * 1.35],
		);
	solid(-8.1, depth + 2.65, 3.6, 2.6);
	const cameraBlockers = mergeStatic(root, blockers).filter(
		(mesh) => mesh.userData.blocker,
	);
	for (const { id, x, z, side } of residents) {
		const horse = createHorse();
		horse.setAppearance(profile(id)?.appearance ?? {});
		horse.rider.visible = false;
		horse.tack.visible = false;
		horse.root.name = id;
		horse.root.position.set(x, 0.09, z);
		horse.root.rotation.y = (-side * Math.PI) / 2;
		root.add(horse.root);
		horses.push(horse);
	}
	root.updateMatrixWorld(true);
	const windowMaterial = mat('#a0bbc0');
	windowMaterial.emissive.set('#ffc987');
	windowMaterial.emissiveIntensity = 0;
	return {
		root,
		cameraBlockers,
		horses,
		plates,
		lamps,
		lampMaterial,
		windowMaterial,
	};
}
