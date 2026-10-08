import { WORLD_RADIUS } from './tuning.ts';
import type { GameState } from './types.ts';

/** The places the car can drive to; home is the stable yard. */
export const REGION_IDS = ['home', 'beach', 'mountains', 'hippodrome'] as const;
export type RegionId = (typeof REGION_IDS)[number];

/**
 * Each place is a flat disc far from the others, so nothing of one is ever in
 * view from another and every system can keep using world coordinates.
 */
export const REGIONS: Readonly<
	Record<RegionId, { x: number; z: number; radius: number }>
> = {
	home: { x: 0, z: 0, radius: WORLD_RADIUS },
	beach: { x: 3000, z: 0, radius: 210 },
	mountains: { x: 0, z: -3000, radius: 150 },
	hippodrome: { x: -3000, z: 0, radius: 200 },
};

/** The place a point belongs to: the one with the nearest centre. */
export function regionAt(x: number, z: number): RegionId {
	let best: RegionId = 'home',
		distance = Infinity;
	for (const id of REGION_IDS) {
		const region = REGIONS[id];
		const d = Math.hypot(x - region.x, z - region.z);
		if (d < distance) {
			distance = d;
			best = id;
		}
	}
	return best;
}

/** Whether a point lies beyond the edge of its place, less `margin`. */
export function outsideWorld(x: number, z: number, margin = 0) {
	const region = REGIONS[regionAt(x, z)];
	return Math.hypot(x - region.x, z - region.z) > region.radius - margin;
}

/** Pulls a state back inside the edge of its place; true when it had to. */
export function keepInsideWorld(state: GameState) {
	const region = REGIONS[regionAt(state.x, state.z)];
	const dx = state.x - region.x,
		dz = state.z - region.z;
	const distance = Math.hypot(dx, dz);
	if (distance <= region.radius) return false;
	state.x = region.x + (dx * region.radius) / distance;
	state.z = region.z + (dz * region.radius) / distance;
	return true;
}
