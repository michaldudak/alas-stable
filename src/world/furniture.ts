import * as THREE from 'three';
import { box, cylinder, ellipsoid } from './primitives.ts';
import { context2d } from '../platform/dom.ts';
import { random } from './noise.ts';

/**
 * Furniture for the clubhouse and the mountain hut, built from boxes like the
 * rest of the scenery. Every piece faces +Z in its own frame, with its back
 * against a wall at -Z, and sits on the floor at y = 0.
 */

const OAK = '#9a7048',
	PINE = '#c49a67',
	DARK_WOOD = '#5f4330',
	LINEN = '#ece6da';

/** A group at a spot on the floor, turned to face `rotation`. */
export function placed(
	parent: THREE.Object3D,
	x: number,
	z: number,
	rotation = 0,
	y = 0,
) {
	const group = new THREE.Group();
	group.position.set(x, y, z);
	group.rotation.y = rotation;
	parent.add(group);
	return group;
}

/** A texture painted once on a canvas. */
export function paintedTexture(
	width: number,
	height: number,
	draw: (
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
	) => void,
) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	draw(context2d(canvas), width, height);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

/** A box wearing a painted texture, for quilts, rugs and pictures. */
export function texturedBox(
	parent: THREE.Object3D,
	texture: THREE.Texture,
	size: [number, number, number],
	position: [number, number, number],
	roughness = 0.9,
) {
	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(...size),
		new THREE.MeshStandardMaterial({ map: texture, roughness }),
	);
	mesh.position.set(...position);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	parent.add(mesh);
	return mesh;
}

/** Patchwork squares with a stitched border, for quilts. */
export function patchwork(colors: readonly string[], seed = 1) {
	const next = random(seed);
	return paintedTexture(256, 256, (c, w, h) => {
		const cells = 8,
			size = w / cells;
		for (let y = 0; y < cells; y++)
			for (let x = 0; x < cells; x++) {
				c.fillStyle = colors[Math.floor(next() * colors.length)];
				c.fillRect(x * size, y * size, size, size);
				if (next() < 0.35) {
					// A little heart or diamond appliqué on some squares.
					c.fillStyle = '#f6efe2';
					c.beginPath();
					c.moveTo(x * size + size / 2, y * size + size * 0.25);
					c.lineTo(x * size + size * 0.75, y * size + size / 2);
					c.lineTo(x * size + size / 2, y * size + size * 0.75);
					c.lineTo(x * size + size * 0.25, y * size + size / 2);
					c.fill();
				}
			}
		c.strokeStyle = 'rgba(255,255,255,0.5)';
		c.setLineDash([3, 3]);
		c.lineWidth = 1.5;
		for (let i = 1; i < cells; i++) {
			c.beginPath();
			c.moveTo(i * size, 0);
			c.lineTo(i * size, h);
			c.moveTo(0, i * size);
			c.lineTo(w, i * size);
			c.stroke();
		}
	});
}

/** A woven rug with a patterned border. */
export function rugTexture(field: string, border: string, accent: string) {
	return paintedTexture(256, 256, (c, w, h) => {
		c.fillStyle = border;
		c.fillRect(0, 0, w, h);
		c.fillStyle = accent;
		c.fillRect(14, 14, w - 28, h - 28);
		c.fillStyle = field;
		c.fillRect(24, 24, w - 48, h - 48);
		c.fillStyle = border;
		for (let i = 0; i < 12; i++) {
			const x = 34 + (i * (w - 68)) / 11;
			c.beginPath();
			c.moveTo(x, 30);
			c.lineTo(x + 6, 38);
			c.lineTo(x, 46);
			c.lineTo(x - 6, 38);
			c.fill();
			c.beginPath();
			c.moveTo(x, h - 30);
			c.lineTo(x + 6, h - 38);
			c.lineTo(x, h - 46);
			c.lineTo(x - 6, h - 38);
			c.fill();
		}
		c.strokeStyle = accent;
		c.lineWidth = 6;
		c.beginPath();
		c.ellipse(w / 2, h / 2, w * 0.24, h * 0.18, 0, 0, Math.PI * 2);
		c.stroke();
		c.fillStyle = border;
		c.beginPath();
		c.ellipse(w / 2, h / 2, w * 0.1, h * 0.07, 0, 0, Math.PI * 2);
		c.fill();
	});
}

/** A horse standing in a landscape, as a small oil painting. */
export function horsePainting(
	sky: string,
	land: string,
	coat: string,
	facing = 1,
) {
	return paintedTexture(256, 192, (c, w, h) => {
		const gradient = c.createLinearGradient(0, 0, 0, h);
		gradient.addColorStop(0, sky);
		gradient.addColorStop(0.62, '#f3e3c3');
		c.fillStyle = gradient;
		c.fillRect(0, 0, w, h);
		c.fillStyle = land;
		c.beginPath();
		c.moveTo(0, h * 0.62);
		c.quadraticCurveTo(w * 0.3, h * 0.52, w * 0.6, h * 0.64);
		c.quadraticCurveTo(w * 0.85, h * 0.7, w, h * 0.6);
		c.lineTo(w, h);
		c.lineTo(0, h);
		c.fill();
		c.save();
		c.translate(w / 2, h * 0.43);
		c.scale(facing * 1.35, 1.35);
		c.translate(-50, -40);
		c.fillStyle = coat;
		c.beginPath();
		c.ellipse(50, 42, 24, 11, 0, 0, Math.PI * 2);
		c.fill();
		// Neck, head and ears.
		c.beginPath();
		c.moveTo(63, 34);
		c.quadraticCurveTo(70, 18, 78, 12);
		c.lineTo(82, 9);
		c.lineTo(83, 13);
		c.lineTo(93, 23);
		c.quadraticCurveTo(93, 27, 88, 26);
		c.lineTo(80, 22);
		c.quadraticCurveTo(76, 32, 74, 44);
		c.fill();
		// Legs and tail.
		for (const x of [30, 36, 64, 69]) c.fillRect(x, 46, 3.4, 26);
		c.lineWidth = 5;
		c.strokeStyle = coat;
		c.beginPath();
		c.moveTo(27, 36);
		c.quadraticCurveTo(18, 44, 21, 62);
		c.stroke();
		c.restore();
		// Brush texture over everything.
		const next = random(w + h);
		c.globalAlpha = 0.08;
		for (let i = 0; i < 260; i++) {
			c.fillStyle = next() < 0.5 ? '#ffffff' : '#000000';
			c.fillRect(next() * w, next() * h, 6 + next() * 10, 1.5);
		}
	});
}

/** A framed picture hanging flat on a wall facing +Z. */
export function picture(
	parent: THREE.Object3D,
	texture: THREE.Texture,
	width: number,
	height: number,
	position: [number, number, number],
	rotation = 0,
	frame = '#b08a4f',
) {
	const group = placed(parent, position[0], position[2], rotation, position[1]);
	box(group, frame, [width + 0.1, height + 0.1, 0.04], [0, 0, 0.02], 0, 'wood');
	texturedBox(group, texture, [width, height, 0.01], [0, 0, 0.045], 0.7);
	return group;
}

export function bed(parent: THREE.Object3D, quilt: THREE.Texture) {
	box(parent, OAK, [1.3, 1.05, 0.08], [0, 0.52, -1.06], 0, 'wood');
	box(parent, OAK, [1.3, 0.6, 0.08], [0, 0.3, 1.06], 0, 'wood');
	for (const side of [-1, 1]) {
		box(parent, OAK, [0.06, 0.2, 2.1], [side * 0.62, 0.3, 0], 0, 'wood');
		for (const end of [-1, 1])
			box(
				parent,
				DARK_WOOD,
				[0.09, end < 0 ? 1.12 : 0.66, 0.09],
				[side * 0.62, end < 0 ? 0.56 : 0.33, end * 1.06],
				0,
				'post',
			);
	}
	box(parent, LINEN, [1.16, 0.2, 2.02], [0, 0.46, 0], 0, 'plain');
	texturedBox(parent, quilt, [1.22, 0.07, 1.45], [0, 0.585, 0.27]);
	// The quilt hangs over the sides.
	for (const side of [-1, 1])
		texturedBox(parent, quilt, [0.02, 0.28, 1.45], [side * 0.61, 0.45, 0.27]);
	box(parent, '#f7f3ea', [1.18, 0.05, 0.3], [0, 0.575, -0.47], 0, 'plain');
	ellipsoid(parent, '#f7f3ea', [0.34, 0.08, 0.18], [0, 0.63, -0.8], 2);
}

export function bunkBed(
	parent: THREE.Object3D,
	lower: THREE.Texture,
	upper: THREE.Texture,
) {
	for (const x of [-0.6, 0.6])
		for (const z of [-1.03, 1.03])
			box(parent, PINE, [0.09, 1.95, 0.09], [x, 0.975, z], 0, 'post');
	for (const [y, quilt] of [
		[0.32, lower],
		[1.4, upper],
	] as const) {
		for (const side of [-1, 1])
			box(parent, PINE, [0.05, 0.16, 2.06], [side * 0.6, y, 0], 0, 'wood');
		for (const end of [-1, 1])
			box(parent, PINE, [1.2, 0.16, 0.05], [0, y, end * 1.03], 0, 'wood');
		box(parent, LINEN, [1.1, 0.16, 1.98], [0, y + 0.1, 0], 0, 'plain');
		texturedBox(parent, quilt, [1.14, 0.05, 1.4], [0, y + 0.2, 0.28]);
		ellipsoid(parent, '#f7f3ea', [0.32, 0.07, 0.16], [0, y + 0.24, -0.78], 2);
	}
	// A guard rail up top and a ladder on the open side.
	box(parent, PINE, [0.05, 0.08, 1.4], [0.6, 1.7, -0.2], 0, 'wood');
	for (const z of [0.55, 0.95])
		box(parent, PINE, [0.05, 1.9, 0.05], [0.66, 0.95, z], 0, 'post');
	for (let i = 0; i < 5; i++)
		box(parent, PINE, [0.04, 0.04, 0.42], [0.66, 0.3 + i * 0.32, 0.75]);
}

export function nightstand(parent: THREE.Object3D) {
	box(parent, OAK, [0.5, 0.55, 0.42], [0, 0.275, 0], 0, 'wood');
	box(parent, DARK_WOOD, [0.42, 0.02, 0.01], [0, 0.4, 0.215]);
	cylinder(parent, '#d8bd82', 0.025, 0.02, [0, 0.33, 0.215]).rotation.x =
		Math.PI / 2;
	// A bedside lamp and a book about horses.
	cylinder(parent, '#6d7a6a', 0.07, 0.04, [-0.1, 0.57, -0.05], 0.06);
	cylinder(parent, '#6d7a6a', 0.012, 0.28, [-0.1, 0.72, -0.05]);
	cylinder(parent, '#efe0bf', 0.14, 0.18, [-0.1, 0.9, -0.05], 0.09);
	box(parent, '#8c3b32', [0.16, 0.04, 0.22], [0.12, 0.57, 0.04], 0.3, 'plain');
}

export function table(parent: THREE.Object3D, width = 1.6, depth = 0.9) {
	box(parent, PINE, [width, 0.06, depth], [0, 0.75, 0], 0, 'wood');
	for (const x of [-1, 1])
		for (const z of [-1, 1])
			box(
				parent,
				PINE,
				[0.07, 0.72, 0.07],
				[x * (width / 2 - 0.1), 0.36, z * (depth / 2 - 0.1)],
				0,
				'post',
			);
	// A checked runner, a jug of wild flowers and two mugs.
	box(parent, '#b8453c', [width * 0.8, 0.005, 0.32], [0, 0.785, 0], 0, 'plain');
	cylinder(parent, '#f1ece0', 0.07, 0.2, [0, 0.885, 0], 0.05);
	for (let i = 0; i < 7; i++) {
		const a = i * 0.9;
		ellipsoid(
			parent,
			['#e9c341', '#f3f0e4', '#9c7ac2', '#d86a7a'][i % 4],
			[0.045, 0.04, 0.045],
			[Math.sin(a) * 0.07, 1.02 + (i % 3) * 0.03, Math.cos(a) * 0.07],
		);
	}
	for (const x of [-0.45, 0.4])
		cylinder(parent, x < 0 ? '#3f6b8c' : '#e8dcc0', 0.045, 0.1, [
			x,
			0.83,
			x < 0 ? 0.2 : -0.18,
		]);
}

export function chair(parent: THREE.Object3D, color = PINE) {
	box(parent, color, [0.44, 0.05, 0.42], [0, 0.46, 0], 0, 'wood');
	for (const x of [-0.19, 0.19])
		for (const z of [-0.18, 0.18])
			box(parent, color, [0.045, 0.46, 0.045], [x, 0.23, z], 0, 'post');
	for (const x of [-0.19, 0.19])
		box(parent, color, [0.05, 0.52, 0.05], [x, 0.74, -0.19], 0, 'post');
	for (const y of [0.72, 0.9])
		box(parent, color, [0.4, 0.07, 0.03], [0, y, -0.19], 0, 'wood');
	box(parent, '#b8453c', [0.36, 0.04, 0.34], [0, 0.5, 0.02], 0, 'plain');
}

export function sofa(parent: THREE.Object3D, color: string, width = 2) {
	box(parent, color, [width, 0.3, 0.85], [0, 0.25, 0], 0, 'plain');
	for (const side of [-1, 1]) {
		box(
			parent,
			color,
			[0.2, 0.62, 0.85],
			[side * (width / 2 - 0.1), 0.35, 0],
			0,
			'plain',
		);
		box(
			parent,
			color,
			[width / 2 - 0.22, 0.14, 0.66],
			[side * (width / 4 - 0.05), 0.47, 0.07],
			0,
			'plain',
		);
	}
	box(parent, color, [width, 0.55, 0.22], [0, 0.66, -0.32], 0, 'plain');
	for (const x of [-0.5, 0.55])
		box(
			parent,
			x < 0 ? '#e9c341' : '#f1ece0',
			[0.4, 0.34, 0.12],
			[x * (width / 2), 0.7, -0.16],
			x * 0.3,
			'plain',
		).rotation.x = -0.2;
	for (const x of [-1, 1])
		for (const z of [-1, 1])
			box(
				parent,
				DARK_WOOD,
				[0.06, 0.1, 0.06],
				[x * (width / 2 - 0.08), 0.05, z * 0.36],
			);
}

export function coffeeTable(parent: THREE.Object3D) {
	box(parent, OAK, [1, 0.05, 0.55], [0, 0.42, 0], 0, 'wood');
	for (const x of [-0.44, 0.44])
		for (const z of [-0.22, 0.22])
			box(parent, OAK, [0.05, 0.4, 0.05], [x, 0.2, z], 0, 'post');
	// A teapot, a cup and a horse magazine.
	ellipsoid(parent, '#f1ece0', [0.09, 0.08, 0.09], [-0.2, 0.52, 0], 2);
	cylinder(parent, '#f1ece0', 0.02, 0.1, [-0.1, 0.54, 0], 0.012).rotation.z =
		-0.9;
	cylinder(parent, '#3f6b8c', 0.04, 0.08, [0.05, 0.49, 0.1]);
	box(parent, '#d86a7a', [0.22, 0.01, 0.3], [0.28, 0.45, -0.05], 0.4, 'plain');
}

export function bookshelf(parent: THREE.Object3D, width = 1.4, seed = 3) {
	const height = 2,
		depth = 0.35;
	for (const side of [-1, 1])
		box(
			parent,
			OAK,
			[0.04, height, depth],
			[side * (width / 2 - 0.02), height / 2, 0],
			0,
			'wood',
		);
	box(
		parent,
		DARK_WOOD,
		[width, height, 0.02],
		[0, height / 2, -depth / 2 + 0.01],
	);
	const next = random(seed);
	const colors = [
		'#8c3b32',
		'#2f5a6e',
		'#c9a54a',
		'#3f6b45',
		'#6d4c7d',
		'#d9d2c0',
		'#9a5b2e',
	];
	for (let shelf = 0; shelf < 5; shelf++) {
		const y = 0.04 + shelf * 0.48;
		box(parent, OAK, [width - 0.08, 0.03, depth - 0.02], [0, y, 0], 0, 'wood');
		if (shelf === 4) break;
		let x = -width / 2 + 0.07;
		while (x < width / 2 - 0.15) {
			const thick = 0.03 + next() * 0.04,
				tall = 0.2 + next() * 0.12;
			if (next() < 0.12) {
				// A gap, sometimes with a little ornament.
				if (next() < 0.5)
					ellipsoid(
						parent,
						'#c9a54a',
						[0.05, 0.06, 0.05],
						[x + 0.06, y + 0.075, 0],
					);
				x += 0.14;
				continue;
			}
			box(
				parent,
				colors[Math.floor(next() * colors.length)],
				[thick, tall, 0.2 + next() * 0.06],
				[x + thick / 2, y + 0.015 + tall / 2, 0.02],
				0,
				'paint',
			);
			x += thick + 0.004;
		}
	}
	box(
		parent,
		OAK,
		[width + 0.04, 0.04, depth + 0.04],
		[0, height, 0],
		0,
		'wood',
	);
}

const gold = new THREE.MeshStandardMaterial({
	color: '#d9ad45',
	metalness: 0.85,
	roughness: 0.3,
});
gold.name = 'trophy-gold';

/** An open cabinet of trophies and a board of rosettes on the wall above. */
export function trophies(parent: THREE.Object3D) {
	box(parent, DARK_WOOD, [1, 1.7, 0.4], [0, 0.85, -0.02], 0, 'wood');
	box(parent, '#2f4a3d', [0.9, 1.5, 0.02], [0, 0.9, 0.17], 0, 'plain');
	for (const [y, cups] of [
		[0.35, 3],
		[0.85, 2],
		[1.35, 3],
	] as const) {
		box(parent, OAK, [0.92, 0.03, 0.36], [0, y - 0.02, 0.01], 0, 'wood');
		for (let i = 0; i < cups; i++) {
			const x = (i - (cups - 1) / 2) * 0.28,
				size = 0.8 + ((i + cups) % 3) * 0.15;
			const parts = [
				cylinder(parent, '#d9ad45', 0.05 * size, 0.04, [x, y + 0.02, 0.05]),
				cylinder(parent, '#d9ad45', 0.012, 0.1 * size, [
					x,
					y + 0.04 + 0.05 * size,
					0.05,
				]),
				cylinder(
					parent,
					'#d9ad45',
					0.035 * size,
					0.12 * size,
					[x, y + 0.09 + 0.16 * size, 0.05],
					0.08 * size,
				),
			];
			for (const part of parts) part.material = gold;
		}
	}
	// Rosettes pinned to a cork board.
	box(parent, '#b88b5a', [0.95, 0.62, 0.03], [0, 2.4, -0.2], 0, 'plain');
	const ribbons = ['#2f5aa8', '#b8453c', '#e9c341', '#f1ece0', '#3f7b45'];
	for (let i = 0; i < 5; i++) {
		const x = -0.34 + i * 0.17,
			y = 2.48 - (i % 2) * 0.12,
			color = ribbons[i];
		for (const tail of [-1, 1]) {
			const ribbon = box(
				parent,
				color,
				[0.04, 0.18, 0.01],
				[x + tail * 0.025, y - 0.13, -0.18],
			);
			ribbon.rotation.z = tail * 0.2;
		}
		const disk = cylinder(parent, color, 0.07, 0.02, [x, y, -0.175]);
		disk.rotation.x = Math.PI / 2;
		const middle = cylinder(parent, '#f7f3ea', 0.03, 0.022, [x, y, -0.17]);
		middle.rotation.x = Math.PI / 2;
	}
}

/**
 * A brick fireplace with a stone hearth and a mantelpiece. The flames are
 * returned so they can flicker; they are marked dynamic and never merged.
 */
export function fireplace(parent: THREE.Object3D) {
	const brick = '#9b5a44',
		stone = '#a8a196';
	for (const side of [-1, 1])
		box(parent, brick, [0.4, 1.25, 0.6], [side * 0.6, 0.625, 0], 0, 'concrete');
	box(parent, brick, [0.8, 0.55, 0.6], [0, 0.975, 0], 0, 'concrete');
	box(parent, '#2a2522', [0.8, 0.7, 0.08], [0, 0.35, -0.26]);
	box(parent, '#3a3430', [0.8, 0.04, 0.5], [0, 0.03, 0]);
	box(parent, stone, [1.9, 0.08, 0.9], [0, 0.04, 0.2], 0, 'concrete');
	box(parent, DARK_WOOD, [1.9, 0.1, 0.36], [0, 1.3, 0.05], 0, 'wood');
	box(parent, brick, [1.2, 1.9, 0.45], [0, 2.3, -0.08], 0, 'concrete');
	// Logs on the fire dogs.
	for (const [x, r] of [
		[-0.12, 0.3],
		[0.12, -0.3],
		[0, 0],
	] as const) {
		const log = cylinder(
			parent,
			'#5a3f2b',
			0.06,
			0.62,
			[x, x ? 0.1 : 0.2, 0],
			0.06,
			'wood',
		);
		log.rotation.z = Math.PI / 2;
		log.rotation.y = r;
	}
	// Candles, a little horse and a photograph on the mantel.
	for (const x of [-0.75, 0.75]) {
		cylinder(parent, '#f4efe4', 0.03, 0.2, [x, 1.45, 0.06]);
		ellipsoid(parent, '#ffcf7a', [0.015, 0.03, 0.015], [x, 1.58, 0.06]);
	}
	box(parent, '#3a2a20', [0.18, 0.1, 0.05], [0.35, 1.43, 0.06], 0.3);
	box(parent, '#3a2a20', [0.03, 0.12, 0.03], [0.44, 1.5, 0.06], 0.3);
	box(parent, '#c9a54a', [0.2, 0.26, 0.02], [-0.3, 1.48, 0.0], 0, 'wood');
	const flame = new THREE.MeshBasicMaterial({
		color: '#ff9a3c',
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
	});
	const core = new THREE.MeshBasicMaterial({ color: '#ffe38a' });
	const flames: THREE.Mesh[] = [];
	for (const [x, height, size, material] of [
		[-0.16, 0.34, 0.08, flame],
		[0.02, 0.44, 0.1, flame],
		[0.18, 0.3, 0.07, flame],
		[0.01, 0.26, 0.05, core],
		[-0.12, 0.2, 0.04, core],
	] as const) {
		const mesh = new THREE.Mesh(
			new THREE.ConeGeometry(size, height, 7),
			material,
		);
		mesh.position.set(x, 0.2 + height / 2, 0.02);
		mesh.userData.dynamic = true;
		mesh.userData.height = height;
		parent.add(mesh);
		flames.push(mesh);
	}
	return flames;
}

/** Makes fireplace flames dance. */
export function flicker(flames: readonly THREE.Mesh[], time: number) {
	flames.forEach((mesh, i) => {
		const wave =
			Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * 0.5 +
			Math.sin(time * (13.1 + i * 2.3)) * 0.3;
		mesh.scale.set(1 - wave * 0.12, 1 + wave * 0.28, 1 - wave * 0.12);
		mesh.position.y =
			0.2 + ((mesh.userData.height as number) * mesh.scale.y) / 2;
		mesh.rotation.z = Math.sin(time * 3.1 + i) * 0.08;
	});
}

/** A run of kitchen units with a sink, a stove top, wall cupboards and a kettle. */
export function kitchen(parent: THREE.Object3D, length = 3.6, window = 0) {
	const door = '#7f9c8a',
		top = '#b58d5f';
	box(parent, door, [length, 0.84, 0.6], [0, 0.44, 0], 0, 'paint');
	box(parent, '#3c3a36', [length, 0.08, 0.54], [0, 0.04, 0.02]);
	box(parent, top, [length + 0.04, 0.05, 0.64], [0, 0.885, 0.01], 0, 'wood');
	const doors = Math.round(length / 0.6);
	for (let i = 1; i < doors; i++)
		box(
			parent,
			'#5f7a69',
			[0.01, 0.74, 0.01],
			[-length / 2 + i * (length / doors), 0.46, 0.301],
		);
	for (let i = 0; i < doors; i++)
		box(
			parent,
			'#d8bd82',
			[0.12, 0.02, 0.02],
			[-length / 2 + (i + 0.5) * (length / doors), 0.78, 0.31],
		);
	// Sink under the window with a tap, and a two-ring stove top.
	box(parent, '#b9bec0', [0.6, 0.02, 0.42], [window, 0.912, 0.02], 0, 'plain');
	box(parent, '#8d9496', [0.5, 0.02, 0.34], [window, 0.915, 0.02], 0, 'plain');
	cylinder(parent, '#c7cdcf', 0.015, 0.28, [window, 1.03, -0.22]);
	cylinder(parent, '#c7cdcf', 0.012, 0.16, [window, 1.16, -0.15]).rotation.x =
		Math.PI / 2;
	const hob = window + (window > 0 ? -1.1 : 1.1);
	box(parent, '#2b2b2b', [0.56, 0.02, 0.5], [hob, 0.915, 0.02], 0, 'plain');
	for (const x of [-0.13, 0.13]) {
		const ring = cylinder(parent, '#4a4a4a', 0.09, 0.01, [hob + x, 0.93, 0.02]);
		ring.castShadow = false;
	}
	cylinder(parent, '#b8453c', 0.08, 0.18, [hob + 0.13, 1.03, 0.02], 0.06);
	// Wall cupboards on either side of the window.
	for (const side of [-1, 1]) {
		const span = length / 2 - 0.75;
		const cx = window + side * (0.75 + span / 2);
		if (Math.abs(cx) + span / 2 > length / 2 + 0.01) continue;
		box(parent, door, [span, 0.66, 0.34], [cx, 1.95, -0.13], 0, 'paint');
		box(parent, '#5f7a69', [0.01, 0.58, 0.01], [cx, 1.95, 0.045]);
	}
	// A shelf of jars.
	box(parent, top, [0.9, 0.03, 0.2], [hob, 1.55, -0.2], 0, 'wood');
	for (let i = 0; i < 4; i++)
		cylinder(
			parent,
			['#e9c341', '#b8453c', '#f1ece0', '#8c5a3b'][i],
			0.05,
			0.14,
			[hob - 0.3 + i * 0.2, 1.64, -0.2],
		);
}

export function wardrobe(parent: THREE.Object3D) {
	box(parent, OAK, [1.2, 2.05, 0.6], [0, 1.03, 0], 0, 'door');
	box(parent, DARK_WOOD, [1.28, 0.08, 0.66], [0, 2.09, 0], 0, 'wood');
	box(parent, DARK_WOOD, [0.01, 1.85, 0.01], [0, 1.05, 0.301]);
	for (const x of [-0.07, 0.07])
		box(parent, '#d8bd82', [0.02, 0.18, 0.03], [x, 1.1, 0.31]);
}

export function dresser(parent: THREE.Object3D) {
	box(parent, PINE, [1.05, 0.85, 0.45], [0, 0.425, 0], 0, 'wood');
	for (let i = 0; i < 3; i++) {
		box(parent, '#a07a4f', [0.98, 0.22, 0.01], [0, 0.17 + i * 0.26, 0.226]);
		box(parent, '#d8bd82', [0.14, 0.02, 0.02], [0, 0.2 + i * 0.26, 0.235]);
	}
	// A photo of a pony, a plant and a brush.
	box(parent, '#c9a54a', [0.18, 0.22, 0.02], [-0.3, 0.97, -0.05], 0.2, 'wood');
	cylinder(parent, '#b86a45', 0.08, 0.14, [0.3, 0.92, 0], 0.1, 'paint');
	for (let i = 0; i < 5; i++)
		ellipsoid(
			parent,
			'#4f7a3d',
			[0.06, 0.1, 0.04],
			[
				0.3 + Math.sin(i * 1.3) * 0.05,
				1.05 + (i % 2) * 0.04,
				Math.cos(i * 1.3) * 0.05,
			],
		);
	box(parent, '#6b4a2f', [0.2, 0.04, 0.07], [0.02, 0.87, 0.08], 0.5, 'wood');
}

export function armchair(parent: THREE.Object3D, color: string) {
	box(parent, color, [0.9, 0.3, 0.85], [0, 0.25, 0], 0, 'plain');
	for (const side of [-1, 1])
		box(parent, color, [0.16, 0.6, 0.85], [side * 0.37, 0.4, 0], 0, 'plain');
	box(parent, color, [0.9, 0.62, 0.2], [0, 0.7, -0.32], 0, 'plain');
	box(parent, color, [0.58, 0.14, 0.66], [0, 0.47, 0.07], 0, 'plain');
	// A knitted throw over one arm.
	box(parent, '#e6d9b8', [0.2, 0.5, 0.6], [0.4, 0.5, 0.05], 0, 'plain');
}

export function rug(
	parent: THREE.Object3D,
	texture: THREE.Texture,
	width: number,
	depth: number,
) {
	const mesh = texturedBox(
		parent,
		texture,
		[width, 0.012, depth],
		[0, 0.028, 0],
		1,
	);
	mesh.castShadow = false;
	return mesh;
}

/** Hooks with jackets and a riding helmet, and tall boots on a mat below. */
export function coatRack(parent: THREE.Object3D) {
	box(parent, OAK, [1, 0.12, 0.03], [0, 1.72, -0.02], 0, 'wood');
	const jackets = ['#3f5a7a', '#b8453c', '#4f6b45'];
	jackets.forEach((color, i) => {
		const x = -0.32 + i * 0.32;
		cylinder(parent, '#3a3a3a', 0.012, 0.1, [x, 1.7, 0.03]).rotation.x =
			Math.PI / 2;
		const jacket = box(
			parent,
			color,
			[0.34, 0.62, 0.1],
			[x, 1.36, 0.06],
			0,
			'plain',
		);
		jacket.rotation.x = -0.05;
		box(parent, color, [0.3, 0.1, 0.12], [x, 1.66, 0.06], 0, 'plain');
	});
	const helmet = new THREE.Mesh(
		new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
		new THREE.MeshStandardMaterial({ color: '#1f2a36', roughness: 0.4 }),
	);
	helmet.position.set(0.47, 1.62, 0.08);
	helmet.rotation.x = -0.4;
	helmet.castShadow = true;
	parent.add(helmet);
	box(parent, '#5b4a3a', [0.9, 0.015, 0.45], [0, 0.01, 0.3], 0, 'plain');
	for (const x of [-0.25, -0.12, 0.12, 0.25]) {
		cylinder(parent, '#2b2622', 0.055, 0.42, [x, 0.23, 0.32], 0.06);
		box(parent, '#2b2622', [0.1, 0.07, 0.24], [x, 0.035, 0.37]);
	}
}

/** A saddle and a bridle on a wall bracket. */
export function saddleRack(parent: THREE.Object3D) {
	box(parent, DARK_WOOD, [0.12, 0.12, 0.5], [0, 1.0, 0.25], 0, 'wood');
	box(parent, DARK_WOOD, [0.08, 0.35, 0.08], [0, 0.85, 0.05], 0, 'post');
	box(parent, '#2f4a6e', [0.62, 0.05, 0.5], [0, 1.08, 0.28], 0, 'plain');
	for (const side of [-1, 1]) {
		const flap = box(
			parent,
			'#2f4a6e',
			[0.04, 0.4, 0.48],
			[side * 0.31, 0.9, 0.28],
			0,
			'plain',
		);
		flap.rotation.z = side * 0.15;
		const leather = box(
			parent,
			'#6b3f24',
			[0.04, 0.32, 0.36],
			[side * 0.26, 0.93, 0.28],
			0,
			'wood',
		);
		leather.rotation.z = side * 0.2;
	}
	ellipsoid(parent, '#6b3f24', [0.24, 0.08, 0.26], [0, 1.14, 0.28], 2);
	box(parent, '#6b3f24', [0.08, 0.1, 0.1], [0, 1.2, 0.48]);
	const reins = new THREE.Mesh(
		new THREE.TorusGeometry(0.16, 0.012, 6, 20),
		new THREE.MeshStandardMaterial({ color: '#4a2f1d', roughness: 0.6 }),
	);
	reins.position.set(0.36, 0.98, 0.04);
	reins.castShadow = true;
	parent.add(reins);
}

/** A potted plant; `size` scales a bushy fern into a small tree. */
export function plant(parent: THREE.Object3D, size = 1) {
	cylinder(
		parent,
		'#b86a45',
		0.18 * size,
		0.34 * size,
		[0, 0.17 * size, 0],
		0.22 * size,
		'paint',
	);
	for (let i = 0; i < 9; i++) {
		const a = i * 2.4,
			r = 0.12 * size * (i % 3 ? 1 : 0.4);
		ellipsoid(
			parent,
			i % 2 ? '#4f7a3d' : '#3f6a34',
			[0.16 * size, 0.24 * size, 0.1 * size],
			[Math.sin(a) * r, (0.5 + (i % 3) * 0.16) * size, Math.cos(a) * r],
		).rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5);
	}
}

/** Curtains drawn back either side of a window facing +Z. */
export function curtains(parent: THREE.Object3D, width: number, color: string) {
	cylinder(parent, DARK_WOOD, 0.02, width + 0.6, [0, 2.4, 0.08]).rotation.z =
		Math.PI / 2;
	for (const side of [-1, 1]) {
		const panel = box(
			parent,
			color,
			[0.26, 1.35, 0.05],
			[side * (width / 2 + 0.12), 1.72, 0.1],
			0,
			'plain',
		);
		panel.rotation.z = side * 0.03;
		box(
			parent,
			'#e9c341',
			[0.28, 0.04, 0.07],
			[side * (width / 2 + 0.12), 1.55, 0.11],
		);
	}
	box(parent, color, [width + 0.5, 0.2, 0.05], [0, 2.3, 0.1], 0, 'plain');
}

export function wallClock(parent: THREE.Object3D) {
	const face = cylinder(parent, '#f7f3ea', 0.2, 0.04, [0, 0, 0.02]);
	face.rotation.x = Math.PI / 2;
	const rim = new THREE.Mesh(
		new THREE.TorusGeometry(0.2, 0.025, 6, 24),
		new THREE.MeshStandardMaterial({ color: '#5f4330', roughness: 0.6 }),
	);
	rim.position.z = 0.03;
	parent.add(rim);
	box(parent, '#2b2622', [0.02, 0.14, 0.01], [0, 0.06, 0.05]);
	box(parent, '#2b2622', [0.1, 0.02, 0.01], [0.04, 0, 0.05], 0).rotation.z =
		0.5;
}

/** A pendant lamp; its shade glows with the light returned by the caller. */
export function pendantLamp(
	parent: THREE.Object3D,
	drop: number,
	glow: THREE.MeshStandardMaterial,
) {
	cylinder(parent, '#2b2622', 0.006, drop, [0, -drop / 2, 0]);
	const shade = cylinder(
		parent,
		'#3f6b45',
		0.24,
		0.18,
		[0, -drop - 0.05, 0],
		0.07,
		'paint',
	);
	shade.castShadow = false;
	const bulb = ellipsoid(
		parent,
		'#fff3d6',
		[0.06, 0.07, 0.06],
		[0, -drop - 0.13, 0],
	);
	bulb.material = glow;
	bulb.castShadow = false;
}
