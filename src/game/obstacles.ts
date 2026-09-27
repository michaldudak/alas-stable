import type { GameState, Obstacle, Solid } from './types.ts';

/** Show-jumping wings stand just outside the ends of the rails. */
export const WING_OFFSET = 0.2;
/** How close to a rail the rider must stand to take hold of it. */
export const GRAB_REACH = 2.4;
/** The rider holds the middle of the rail from this far in front of it. */
const HOLD_DISTANCE = 0.75;

/** Axis along the rails and the normal a horse crosses, for an obstacle's angle. */
export function obstacleAxes(obstacle: Pick<Obstacle, 'angle'>) {
	const angle = obstacle.angle ?? 0;
	return {
		along: { x: Math.cos(angle), z: -Math.sin(angle) },
		across: { x: Math.sin(angle), z: Math.cos(angle) },
	};
}

/** A point in the obstacle's frame: `u` along the rails, `v` across them. */
export function toObstacle(
	obstacle: Pick<Obstacle, 'x' | 'z' | 'angle'>,
	x: number,
	z: number,
) {
	const { along, across } = obstacleAxes(obstacle);
	const dx = x - obstacle.x,
		dz = z - obstacle.z;
	return {
		u: dx * along.x + dz * along.z,
		v: dx * across.x + dz * across.z,
	};
}

/** Offsets of the wings, as (along, across) pairs; spreads have two pairs. */
export function wingOffsets(obstacle: Obstacle & { spread?: number }) {
	const end = obstacle.width / 2 + WING_OFFSET,
		spread = (obstacle.spread ?? 0) / 2;
	return spread
		? [
				[-end, -spread],
				[end, -spread],
				[-end, spread],
				[end, spread],
			]
		: [
				[-end, 0],
				[end, 0],
			];
}

/** The wings, which are solid even in a jump. */
export function wingSolids(obstacle: Obstacle & { spread?: number }): Solid[] {
	const { along, across } = obstacleAxes(obstacle);
	return wingOffsets(obstacle).map(([u, v]) => ({
		x: obstacle.x + along.x * u + across.x * v,
		z: obstacle.z + along.z * u + across.z * v,
		w: 0.3,
		d: 0.3,
	}));
}

/** Rails as a row of small blocks, for people and waiting horses on foot. */
export function railSolids(obstacle: Obstacle & { spread?: number }): Solid[] {
	if (obstacle.down) return [];
	const { along, across } = obstacleAxes(obstacle);
	const solids: Solid[] = [],
		spread = (obstacle.spread ?? 0) / 2;
	for (const v of spread ? [-spread, spread] : [0])
		for (let u = -obstacle.width / 2; u <= obstacle.width / 2 + 1e-6; u += 0.5)
			solids.push({
				x: obstacle.x + along.x * u + across.x * v,
				z: obstacle.z + along.z * u + across.z * v,
				w: 0.22,
				d: 0.22,
			});
	return solids;
}

/** The obstacle the rider can take hold of, if one is within reach. */
export function grabbable<T extends Obstacle>(
	obstacles: readonly T[],
	person: Pick<GameState, 'x' | 'z'>,
) {
	let best: T | undefined,
		distance = GRAB_REACH;
	for (const obstacle of obstacles) {
		const { u, v } = toObstacle(obstacle, person.x, person.z);
		const along = Math.max(0, Math.abs(u) - obstacle.width / 2);
		const d = Math.hypot(along, v);
		if (d < distance) {
			distance = d;
			best = obstacle;
		}
	}
	return best;
}

/**
 * Where the rider stands to hold an obstacle: in front of the middle of its
 * rails, facing them, on the side they are standing.
 */
export function holdPose(
	obstacle: Obstacle,
	person: Pick<GameState, 'x' | 'z'>,
) {
	const { across } = obstacleAxes(obstacle);
	const side = toObstacle(obstacle, person.x, person.z).v >= 0 ? 1 : -1;
	return {
		x: obstacle.x + across.x * side * HOLD_DISTANCE,
		z: obstacle.z + across.z * side * HOLD_DISTANCE,
		heading: Math.atan2(-across.x * side, -across.z * side),
		/** The obstacle's angle relative to the rider's heading while held. */
		turn:
			(obstacle.angle ?? 0) - Math.atan2(-across.x * side, -across.z * side),
	};
}

/** The pose of a held obstacle in front of a rider with the given heading. */
export function carriedPose(
	person: Pick<GameState, 'x' | 'z' | 'heading'>,
	turn: number,
) {
	return {
		x: person.x + Math.sin(person.heading) * HOLD_DISTANCE,
		z: person.z + Math.cos(person.heading) * HOLD_DISTANCE,
		angle: person.heading + turn,
	};
}

/** Whether an obstacle placed like this keeps its wings clear of solids. */
export function obstacleClear(
	obstacle: Obstacle & { spread?: number },
	solids: readonly Solid[],
	worldRadius: number,
) {
	for (const wing of [...wingSolids(obstacle), ...railSolids(obstacle)]) {
		if (Math.hypot(wing.x, wing.z) > worldRadius - 1) return false;
		for (const solid of solids)
			if (
				Math.abs(wing.x - solid.x) < (wing.w + solid.w) / 2 &&
				Math.abs(wing.z - solid.z) < (wing.d + solid.d) / 2
			)
				return false;
	}
	return true;
}
