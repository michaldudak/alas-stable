import * as THREE from 'three';
import type { Solid } from '../game/types.ts';
import { box, cylinder, ellipsoid, material } from './primitives.ts';
import { CLUBHOUSE } from './layout.ts';
import { mergeStatic } from '../rendering/merge.ts';
import {
	armchair,
	bed,
	bookshelf,
	bunkBed,
	chair,
	coatRack,
	coffeeTable,
	curtains,
	dresser,
	fireplace,
	flicker,
	horsePainting,
	kitchen,
	nightstand,
	patchwork,
	pendantLamp,
	picture,
	placed,
	plant,
	rug,
	rugTexture,
	saddleRack,
	sofa,
	table,
	trophies,
	wallClock,
	wardrobe,
} from './furniture.ts';

/** Height of the clubhouse walls and its ceiling. */
const HEIGHT = 3.2;
const THICKNESS = 0.25;
const DOOR_WIDTH = 1.3;

type Opening = { at: number; width: number; bottom: number; top: number };

const window = (at: number): Opening => ({
	at,
	width: 1.1,
	bottom: 1.15,
	top: 2.25,
});

/** Where the bed stands, in clubhouse coordinates, and where one gets up. */
export const BED = {
	x: -4.5,
	z: -3.25,
	/** Where the rider stands after sleeping, facing into the room. */
	wake: { x: -3.35, z: -1.9, heading: Math.PI * 0.75 },
};

/**
 * A wall along local X from `from` to `to`, with holes for doors and windows.
 * Returns its pieces so the camera can collide with them.
 */
function wall(
	parent: THREE.Object3D,
	from: number,
	to: number,
	openings: readonly Opening[],
	color: string,
) {
	const pieces: THREE.Mesh[] = [];
	const piece = (a: number, b: number, bottom: number, top: number) => {
		if (b - a < 0.01 || top - bottom < 0.01) return;
		pieces.push(
			box(
				parent,
				color,
				[b - a, top - bottom, THICKNESS],
				[(a + b) / 2, (bottom + top) / 2, 0],
				0,
				'siding',
			),
		);
	};
	let cursor = from;
	for (const o of [...openings].sort((a, b) => a.at - b.at)) {
		const a = o.at - o.width / 2,
			b = o.at + o.width / 2;
		piece(cursor, a, 0, HEIGHT);
		piece(a, b, 0, o.bottom);
		piece(a, b, o.top, HEIGHT);
		cursor = b;
	}
	piece(cursor, to, 0, HEIGHT);
	return pieces;
}

/**
 * A whitewashed timber clubhouse with a porch, shutters and flower boxes. Its
 * door stands open onto one cosy room: a bed and a bunk for the riders, a
 * fireplace with a sofa, a kitchen, a dining table, books and trophies. The
 * windows glow in the evening and the fire flickers all day.
 */
export function createClubhouse(scene: THREE.Object3D, solids: Solid[]) {
	const { x, z, halfWidth: w, halfDepth: d } = CLUBHOUSE;
	const group = new THREE.Group();
	group.name = 'clubhouse';
	group.position.set(x, 0, z);
	scene.add(group);
	const whitewash = '#efe6d2',
		trim = '#46604f',
		roof = '#9c4a3a',
		timber = '#6b5139';
	const blockers = new Set<THREE.Object3D>();
	/** A wall facing outwards along one side: 0 east, then north, west, south. */
	const side = (
		angle: number,
		offset: number,
		length: number,
		openings: Opening[],
	) => {
		const frame = placed(group, 0, 0, angle);
		const inner = new THREE.Group();
		inner.position.z = offset;
		frame.add(inner);
		for (const mesh of wall(
			inner,
			-length / 2,
			length / 2,
			openings,
			whitewash,
		))
			blockers.add(mesh);
		// Timber panelling below the windows inside.
		let cursor = -length / 2 + THICKNESS / 2;
		const end = length / 2 - THICKNESS / 2;
		for (const o of [...openings, { at: 99, width: 0, bottom: 0, top: 0 }].sort(
			(a, b) => a.at - b.at,
		)) {
			const a = Math.min(end, o.at - o.width / 2);
			if (o.bottom === 0 && a > cursor)
				box(
					inner,
					'#a07a4f',
					[a - cursor, 1, 0.03],
					[(a + cursor) / 2, 0.5, -THICKNESS / 2 - 0.015],
					0,
					'boards',
				);
			if (o.bottom === 0) cursor = Math.max(cursor, o.at + o.width / 2);
		}
		box(
			inner,
			timber,
			[length - THICKNESS, 0.06, 0.05],
			[0, 1.02, -THICKNESS / 2 - 0.03],
			0,
			'wood',
		);
		return inner;
	};
	const east = side(Math.PI / 2, w, d * 2, [
		{ at: 0, width: DOOR_WIDTH, bottom: 0, top: 2.3 },
		window(-3),
		window(3),
	]);
	const west = side(-Math.PI / 2, w, d * 2, [window(0)]);
	const north = side(Math.PI, d, w * 2, [window(1.9)]);
	const south = side(0, d, w * 2, [window(-2.6), window(3.2)]);
	// Dark corner posts, a stone plinth and a step at the door.
	for (const cx of [-1, 1])
		for (const cz of [-1, 1])
			box(
				group,
				timber,
				[0.3, HEIGHT + 0.1, 0.3],
				[cx * w, HEIGHT / 2, cz * d],
				0,
				'post',
			);
	for (const [px, pz, sx, sz] of [
		[w + 0.16, -(d + DOOR_WIDTH / 2) / 2 - 0.1, 0.08, d - DOOR_WIDTH / 2 + 0.2],
		[w + 0.16, (d + DOOR_WIDTH / 2) / 2 + 0.1, 0.08, d - DOOR_WIDTH / 2 + 0.2],
		[-w - 0.16, 0, 0.08, d * 2 + 0.4],
		[0, d + 0.16, w * 2 + 0.4, 0.08],
		[0, -d - 0.16, w * 2 + 0.4, 0.08],
	] as const)
		box(group, '#9d968a', [sx, 0.32, sz], [px, 0.16, pz], 0, 'concrete');
	box(group, '#a8a196', [0.7, 0.1, 1.7], [w + 0.4, 0.05, 0], 0, 'concrete');
	// Floorboards, and a boarded ceiling on beams.
	box(
		group,
		'#a27b52',
		[w * 2 - 0.1, 0.04, d * 2 - 0.1],
		[0, 0, 0],
		0,
		'boards',
	);
	const ceiling = box(
		group,
		'#c9ab82',
		[w * 2, 0.08, d * 2],
		[0, HEIGHT + 0.04, 0],
		0,
		'boards',
	);
	blockers.add(ceiling);
	for (let i = -2; i <= 2; i++)
		box(
			group,
			timber,
			[w * 2 - 0.25, 0.16, 0.14],
			[0, HEIGHT - 0.08, i * 1.7],
			0,
			'wood',
		);
	// A steep roof with gables at the north and south ends.
	const rise = 2.6,
		pitch = Math.atan2(rise, w + 0.4),
		span = Math.hypot(w + 0.4, rise);
	for (const s of [-1, 1]) {
		const slope = box(
			group,
			roof,
			[span, 0.22, d * 2 + 1],
			[(s * (w + 0.4)) / 2, HEIGHT + rise / 2 + 0.05, 0],
			0,
			'roofing',
		);
		slope.rotation.z = -s * pitch;
		blockers.add(slope);
	}
	box(
		group,
		timber,
		[0.2, 0.26, d * 2 + 1.05],
		[0, HEIGHT + rise + 0.02, 0],
		0,
		'wood',
	);
	const gable = new THREE.Shape();
	gable.moveTo(-w, 0);
	gable.lineTo(w, 0);
	gable.lineTo(0, rise);
	gable.closePath();
	for (const s of [-1, 1]) {
		const end = new THREE.Mesh(
			new THREE.ShapeGeometry(gable),
			material(whitewash, 'siding'),
		);
		end.position.set(0, HEIGHT, s * (d + 0.13));
		end.rotation.y = s > 0 ? 0 : Math.PI;
		end.castShadow = true;
		group.add(end);
	}
	// The chimney rises from the fireplace on the north wall.
	box(
		group,
		'#8f8877',
		[0.62, 3.4, 0.62],
		[0.4, HEIGHT + 1.75, -d + 0.45],
		0,
		'concrete',
	);
	box(
		group,
		'#6f695d',
		[0.72, 0.12, 0.72],
		[0.4, HEIGHT + 3.5, -d + 0.45],
		0,
		'concrete',
	);
	// See-through glass that glows warm after dusk.
	const glass = new THREE.MeshStandardMaterial({
		color: '#b8d3da',
		roughness: 0.05,
		transparent: true,
		opacity: 0.35,
		emissive: '#ffc987',
		emissiveIntensity: 0,
		depthWrite: false,
	});
	glass.name = 'clubhouse-window';
	/** Frame, glass, shutters and a flower box outside; curtains inside. */
	function glaze(wallGroup: THREE.Object3D, at: number, curtain: string) {
		const frame = placed(wallGroup, at, 0, 0, 1.7);
		const pane = box(frame, '#b8d3da', [1.1, 1.1, 0.02], [0, 0, 0]);
		pane.material = glass;
		pane.castShadow = false;
		for (const y of [-0.56, 0.56])
			box(frame, '#f4efe4', [1.2, 0.08, THICKNESS + 0.04], [0, y, 0]);
		for (const px of [-0.56, 0, 0.56])
			box(frame, '#f4efe4', [0.07, 1.2, 0.1], [px, 0, 0]);
		box(frame, '#f4efe4', [1.1, 0.05, 0.1], [0, 0, 0]);
		for (const s of [-1, 1])
			box(frame, trim, [0.55, 1.2, 0.06], [s * 0.9, 0, 0.16]);
		box(frame, timber, [1.2, 0.26, 0.3], [0, -0.76, 0.28], 0, 'wood');
		for (let i = 0; i < 6; i++)
			ellipsoid(
				frame,
				['#d88aae', '#e9c341', '#f3f0e4'][i % 3],
				[0.09, 0.08, 0.09],
				[-0.5 + i * 0.2, -0.58, 0.3],
			);
		const inside = placed(wallGroup, at, -THICKNESS / 2 - 0.02, Math.PI);
		curtains(inside, 1.1, curtain);
	}
	glaze(east, -3, '#b8453c');
	glaze(east, 3, '#b8453c');
	glaze(west, 0, '#3f6b8c');
	glaze(north, 1.9, '#3f6b8c');
	glaze(south, -2.6, '#b8453c');
	glaze(south, 3.2, '#e8dcc0');
	// The door stands open against the wall inside.
	for (const s of [-1, 1])
		box(east, '#f4efe4', [0.1, 2.4, THICKNESS + 0.06], [s * 0.7, 1.2, 0]);
	box(east, '#f4efe4', [1.5, 0.12, THICKNESS + 0.06], [0, 2.36, 0]);
	const door = placed(
		group,
		w - THICKNESS / 2 - 0.05,
		-DOOR_WIDTH / 2,
		Math.PI,
	);
	box(
		door,
		trim,
		[0.06, 2.25, DOOR_WIDTH - 0.05],
		[0, 1.14, DOOR_WIDTH / 2],
		0,
		'door',
	);
	cylinder(door, '#d8bd82', 0.04, 0.02, [
		-0.05,
		1.05,
		DOOR_WIDTH - 0.15,
	]).rotation.z = Math.PI / 2;
	// A porch roof on two posts shelters the door; a bench waits beside it.
	for (const s of [-1, 1])
		box(group, timber, [0.16, 2.9, 0.16], [w + 1.5, 1.45, s * 1.25], 0, 'post');
	const porch = box(
		group,
		roof,
		[1.9, 0.14, 3.1],
		[w + 0.85, 2.95, 0],
		0,
		'roofing',
	);
	porch.rotation.z = -0.25;
	box(group, timber, [0.5, 0.08, 1.4], [w + 0.55, 0.55, 1.8], 0, 'wood');
	box(group, timber, [0.1, 0.55, 1.4], [w + 0.35, 0.85, 1.8], 0, 'wood');
	for (const s of [-1, 1])
		box(
			group,
			timber,
			[0.4, 0.5, 0.08],
			[w + 0.55, 0.28, 1.8 + s * 0.6],
			0,
			'post',
		);
	// A lantern beside the door glows with the windows.
	const lanternGlass = box(
		group,
		'#fff3d6',
		[0.14, 0.2, 0.14],
		[w + 0.25, 2.1, -0.95],
	);
	const glow = new THREE.MeshStandardMaterial({
		color: '#fff3d6',
		emissive: '#ffbf6e',
		emissiveIntensity: 0.3,
		roughness: 0.4,
	});
	glow.name = 'clubhouse-lamp';
	lanternGlass.material = glow;
	box(group, '#2f3431', [0.2, 0.04, 0.2], [w + 0.25, 2.22, -0.95]);

	// Furniture: the bed and the reading corner along the north wall.
	bed(
		placed(group, BED.x, BED.z),
		patchwork(['#b8453c', '#e9c341', '#3f6b8c', '#f1ece0', '#6d8f5c'], 11),
	);
	nightstand(placed(group, -3.4, -d + 0.35));
	picture(group, horsePainting('#9cc3dd', '#6d8f5c', '#3a2a20'), 0.9, 0.6, [
		BED.x,
		1.75,
		-d + THICKNESS / 2 + 0.01,
	]);
	const flames = fireplace(placed(group, 0.4, -d + THICKNESS / 2 + 0.3));
	picture(group, horsePainting('#e8b98c', '#8a7a4a', '#f1ece0', -1), 0.7, 0.5, [
		0.4,
		2.35,
		-d + THICKNESS / 2 + 0.455,
	]);
	bookshelf(placed(group, 2.5, -d + THICKNESS / 2 + 0.18));
	trophies(placed(group, 4.35, -d + THICKNESS / 2 + 0.22));
	wallClock(placed(group, 2.5, -d + THICKNESS / 2, 0, 2.55));
	const reading = placed(group, 0.5, -2.35);
	rug(reading, rugTexture('#8c3b32', '#2f3a4a', '#e9c341'), 2.8, 1.9);
	sofa(placed(group, 0.7, -1.1, Math.PI), '#4f6b7a');
	coffeeTable(placed(group, 0.55, -2.5));
	armchair(placed(group, -1.45, -2.55, 2.3), '#9c6a45');
	// The west wall: wardrobe, a dresser under the window and the bunk bed.
	wardrobe(placed(group, -w + THICKNESS / 2 + 0.3, -1.45, Math.PI / 2));
	dresser(placed(group, -w + THICKNESS / 2 + 0.23, 0, Math.PI / 2));
	bunkBed(
		placed(group, -5.2, 3.25),
		patchwork(['#3f6b8c', '#f1ece0', '#9c7ac2', '#e8dcc0'], 23),
		patchwork(['#6d8f5c', '#e9c341', '#f1ece0', '#b86a45'], 31),
	);
	rug(
		placed(group, BED.x + 0.2, -1.45),
		rugTexture('#e8dcc0', '#6d8f5c', '#b8453c'),
		1.3,
		0.9,
	);
	// The dining table and the kitchen along the south wall.
	table(placed(group, -1.2, 1.9));
	for (const [cx, cz, turn] of [
		[-1.6, 1.15, 0],
		[-0.8, 1.15, 0],
		[-1.6, 2.65, Math.PI],
		[-0.8, 2.65, Math.PI],
	] as const)
		chair(placed(group, cx, cz, turn + (cx + cz) * 0.05));
	picture(
		group,
		horsePainting('#b9d7c9', '#5f7f4a', '#8a4a2a'),
		0.8,
		0.55,
		[-1.2, 1.8, d - THICKNESS / 2 - 0.01],
		Math.PI,
	);
	kitchen(placed(group, 3.2, d - THICKNESS / 2 - 0.3, Math.PI), 3.6, 0);
	plant(placed(group, -3.2, d - 0.55), 1.4);
	// By the door: coats, boots, a saddle on its rack and a plant.
	coatRack(placed(group, w - THICKNESS / 2 - 0.02, 1.85, -Math.PI / 2));
	saddleRack(placed(group, w - THICKNESS / 2 - 0.02, -3.95, -Math.PI / 2));
	plant(placed(group, w - 0.55, 0.95), 0.9);
	const shade = new THREE.MeshStandardMaterial({
		color: '#fff3d6',
		emissive: '#ffcf87',
		emissiveIntensity: 1.2,
	});
	shade.name = 'clubhouse-bulb';
	pendantLamp(placed(group, -1.2, 1.9, 0, HEIGHT - 0.1), 0.55, shade);
	pendantLamp(placed(group, 0.7, -1.9, 0, HEIGHT - 0.1), 0.45, shade);

	const cameraBlockers = mergeStatic(group, blockers);
	// Walls with the doorway, the porch posts and the furniture.
	const at = (lx: number, lz: number, sw: number, sd: number) =>
		solids.push({ x: x + lx, z: z + lz, w: sw, d: sd });
	const doorEdge = DOOR_WIDTH / 2;
	at(w, -(d + doorEdge) / 2, THICKNESS, d - doorEdge);
	at(w, (d + doorEdge) / 2, THICKNESS, d - doorEdge);
	at(-w, 0, THICKNESS, d * 2);
	at(0, -d, w * 2, THICKNESS);
	at(0, d, w * 2, THICKNESS);
	at(w + 1.5, -1.25, 0.3, 0.3);
	at(w + 1.5, 1.25, 0.3, 0.3);
	at(w - 0.2, -1.3, 0.14, DOOR_WIDTH);
	at(BED.x, BED.z, 1.34, 2.22);
	at(-3.4, -d + 0.35, 0.5, 0.45);
	at(0.4, -d + 0.45, 1.9, 0.75);
	at(2.5, -d + 0.3, 1.4, 0.4);
	at(4.35, -d + 0.35, 1.0, 0.45);
	at(0.7, -1.1, 2.0, 0.85);
	at(0.55, -2.5, 1.0, 0.55);
	at(-1.45, -2.55, 0.95, 0.95);
	at(-w + 0.43, -1.45, 0.6, 1.2);
	at(-w + 0.35, 0, 0.45, 1.05);
	at(-5.2, 3.25, 1.3, 2.15);
	at(-1.2, 1.9, 1.7, 2.1);
	at(3.2, d - 0.42, 3.6, 0.65);
	at(-3.2, d - 0.55, 0.5, 0.5);
	at(w - 0.3, -3.95, 0.6, 0.55);
	at(w - 0.55, 0.95, 0.4, 0.4);
	return {
		windowMaterial: glass,
		cameraBlockers,
		/** A lamp over the table and one over the sofa, for the real light pool. */
		lamps: [
			new THREE.Vector3(x - 1.2, HEIGHT - 0.8, z + 1.9),
			new THREE.Vector3(x + 0.7, HEIGHT - 0.7, z - 1.9),
		],
		/** The bed in world coordinates. */
		bed: {
			x: x + BED.x,
			z: z + BED.z,
			wake: { ...BED.wake, x: x + BED.wake.x, z: z + BED.wake.z },
		},
		update(time: number, night: number) {
			glass.emissiveIntensity = night * 1.4;
			glass.opacity = 0.35 + night * 0.4;
			glow.emissiveIntensity = 0.3 + night * 2.2;
			shade.emissiveIntensity = 0.6 + night * 1.2;
			flicker(flames, time);
		},
	};
}
