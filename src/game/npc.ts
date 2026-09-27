import type { GameState, Obstacle, Solid } from './types.ts';
import { createState, requestJump, step } from './physics.ts';
import { toObstacle } from './obstacles.ts';

/** A closed route ridden over and over; `gaits` gives the pace at each point. */
export interface Route {
	points: readonly { x: number; z: number }[];
	gaits: readonly number[];
}

export interface Npc {
	state: GameState;
	route: Route;
	/** The route point being steered towards. */
	index: number;
	/** Seconds spent waiting for someone to get out of the way. */
	waiting: number;
}

/** How far ahead along the route a rider looks when steering. */
const LOOKAHEAD = 4.5;
/** Seconds a rider waits for a waiting horse before riding round it. */
const PATIENCE = 4;

export function createNpc(route: Route, start = 0): Npc {
	const a = route.points[start % route.points.length],
		b = route.points[(start + 1) % route.points.length];
	return {
		state: {
			...createState(),
			x: a.x,
			z: a.z,
			heading: Math.atan2(b.x - a.x, b.z - a.z),
			gait: route.gaits[start % route.points.length],
		},
		route,
		index: (start + 1) % route.points.length,
		waiting: 0,
	};
}

/** Whether something blocks the way just ahead of a rider. */
function blockedAhead(state: GameState, blockers: readonly Solid[]) {
	const forward = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
	const reach = 3 + Math.max(0, state.speed) * 0.7;
	for (const b of blockers) {
		const dx = b.x - state.x,
			dz = b.z - state.z;
		const ahead = dx * forward.x + dz * forward.z,
			side = Math.abs(dx * forward.z - dz * forward.x);
		if (ahead > 0.5 && ahead < reach && side < 1.1 + Math.max(b.w, b.d) / 2)
			return true;
	}
	return false;
}

/**
 * One step of a rider following a route: steering by pure pursuit, keeping the
 * route's pace, jumping fences in the way and waiting for anyone blocking it.
 * Returns the steering, for the horse animation.
 */
export function stepNpc(
	npc: Npc,
	dt: number,
	obstacles: Obstacle[],
	blockers: readonly Solid[],
	/** Stick-style pace adjustment, so riders on one track differ in speed. */
	pace = 0,
	/** Horses left standing in the way, which a rider only waits for a while. */
	passable: readonly Solid[] = [],
) {
	const { state, route } = npc;
	const count = route.points.length;
	// Move the target along the route once it comes within reach.
	for (let guard = 0; guard < count; guard++) {
		const p = route.points[npc.index];
		if (Math.hypot(p.x - state.x, p.z - state.z) > LOOKAHEAD) break;
		npc.index = (npc.index + 1) % count;
	}
	const target = route.points[npc.index];
	const error = Math.atan2(
		Math.sin(
			Math.atan2(target.x - state.x, target.z - state.z) - state.heading,
		),
		Math.cos(
			Math.atan2(target.x - state.x, target.z - state.z) - state.heading,
		),
	);
	const turn = Math.max(-1, Math.min(1, error * 2.2));
	// Take off a few strides before any standing rails on the line ahead.
	if (state.jump < 0)
		for (const obstacle of obstacles) {
			if (obstacle.down) continue;
			const here = toObstacle(obstacle, state.x, state.z);
			const ahead = toObstacle(
				obstacle,
				state.x + Math.sin(state.heading) * 3.6,
				state.z + Math.cos(state.heading) * 3.6,
			);
			if (
				here.v * ahead.v < 0 &&
				Math.abs(ahead.u) < obstacle.width / 2 + 0.5 &&
				state.speed > 3
			)
				requestJump(state);
		}
	const person = blockedAhead(state, blockers),
		horse = blockedAhead(state, passable);
	const blocked =
		state.jump < 0 && (person || (horse && npc.waiting < PATIENCE));
	npc.waiting = person || horse ? npc.waiting + dt : 0;
	state.gait = blocked ? 0 : route.gaits[npc.index];
	step(
		state,
		dt,
		blocked ? 0 : turn,
		obstacles,
		[],
		blocked ? undefined : pace,
	);
	return blocked ? 0 : turn;
}

/** A route along a closed polyline, with a gait chosen by how sharply it bends. */
export function routeFromPoints(
	points: readonly { x: number; z: number }[],
	fast: number,
	slow = fast,
	bend = 0.25,
	/** Points before a bend at which the rider already slows down. */
	brake = 0,
): Route {
	const gaits = points.map((p, i) => {
		const a = points[(i - 2 + points.length) % points.length],
			b = points[(i + 2) % points.length];
		const before = Math.atan2(p.x - a.x, p.z - a.z),
			after = Math.atan2(b.x - p.x, b.z - p.z);
		const turn = Math.abs(
			Math.atan2(Math.sin(after - before), Math.cos(after - before)),
		);
		return turn > bend ? slow : fast;
	});
	const slowed = gaits.map((gait, i) => {
		for (let k = 0; k <= brake; k++)
			if (gaits[(i + k) % gaits.length] === slow) return slow;
		return gait;
	});
	return { points, gaits: slowed };
}
