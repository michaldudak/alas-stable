import type * as THREE from 'three';
import type { Solid } from '../game/types.ts';
import type { Point } from './layout.ts';
import { box } from './primitives.ts';
import type { Finish } from './surface-detail.ts';

export type FenceStyle = {
	post: string;
	rail: string;
	/** Heights of the rail centres. */
	rails: readonly number[];
	postHeight: number;
	spacing: number;
	finish?: Finish;
	jumpable?: boolean;
};

/**
 * Post-and-rail fence along a polyline. Straight axis-aligned runs collide as
 * one box; other runs as closely spaced posts that a horse cannot slip between.
 */
export function railFence(
	parent: THREE.Object3D,
	solids: Solid[],
	path: readonly Point[],
	style: FenceStyle,
) {
	const finish = style.finish ?? 'paint';
	for (let i = 0; i < path.length - 1; i++) {
		const a = path[i],
			b = path[i + 1];
		const length = Math.hypot(b.x - a.x, b.z - a.z);
		if (length < 0.01) continue;
		const angle = Math.atan2(b.x - a.x, b.z - a.z);
		const count = Math.max(1, Math.round(length / style.spacing));
		for (let j = 0; j <= count; j++) {
			if (j === 0 && i > 0) continue;
			const t = j / count;
			box(
				parent,
				style.post,
				[0.2, style.postHeight, 0.2],
				[a.x + (b.x - a.x) * t, style.postHeight / 2, a.z + (b.z - a.z) * t],
				angle,
				'post',
			);
		}
		for (const y of style.rails)
			box(
				parent,
				style.rail,
				[0.12, 0.15, length + 0.1],
				[(a.x + b.x) / 2, y, (a.z + b.z) / 2],
				angle,
				finish,
			);
		const jumpable = style.jumpable ?? true;
		if (Math.abs(a.x - b.x) < 0.01 || Math.abs(a.z - b.z) < 0.01)
			solids.push({
				x: (a.x + b.x) / 2,
				z: (a.z + b.z) / 2,
				w: Math.max(0.2, Math.abs(b.x - a.x)),
				d: Math.max(0.2, Math.abs(b.z - a.z)),
				jumpable,
			});
		else {
			const samples = Math.ceil(length / 1.2);
			for (let j = 0; j <= samples; j++) {
				if (j === 0 && i > 0) continue;
				const t = j / samples;
				solids.push({
					x: a.x + (b.x - a.x) * t,
					z: a.z + (b.z - a.z) * t,
					w: 0.3,
					d: 0.3,
					jumpable,
				});
			}
		}
	}
}

/** Points along an arc around (x, z), from `start` to `end` radians (sin → x, cos → z). */
export function arc(
	x: number,
	z: number,
	radius: number,
	start: number,
	end: number,
	step = 3,
) {
	const count = Math.max(1, Math.ceil((Math.abs(end - start) * radius) / step));
	const points: Point[] = [];
	for (let i = 0; i <= count; i++) {
		const a = start + ((end - start) * i) / count;
		points.push({ x: x + Math.sin(a) * radius, z: z + Math.cos(a) * radius });
	}
	return points;
}
