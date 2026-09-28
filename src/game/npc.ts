import type { GameState, Obstacle, Solid } from './types.ts';
import { createState, requestJump, step } from './physics.ts';
import { toObstacle } from './obstacles.ts';

/**
 * A route to ride; `gaits` gives the pace at each point. A closed route is
 * ridden round and round, an open one ends at its last point.
 */
export interface Route {
	points: readonly { x: number; z: number }[];
	gaits: readonly number[];
	closed?: boolean;
}

export interface Npc {
	state: GameState;
	route: Route;
	/** The route point being steered towards. */
	index: number;
	/** Seconds spent waiting for someone to get out of the way. */
	waiting: number;
	/** Metres ridden since the current route began. */
	travelled: number;
	/** Metres left of a sidestep round something in the way, and its side. */
	detour: number;
	detourSide: number;
}

/** A rider sharing the ways, seen by the others. */
export interface Traffic {
	x: number;
	z: number;
	heading: number;
	speed: number;
	/** Lower numbers have right of way at crossings. */
	rank: number;
}

/** How far ahead along the route a rider looks when steering. */
const LOOKAHEAD = 4.5;
/** Seconds a rider waits for a waiting horse before riding round it. */
const PATIENCE = 4;
/** Seconds before a rider sidesteps someone standing in the way. */
const SIDESTEP = 3;

export function createNpc(route: Route, start = 0): Npc {
	const count = route.points.length;
	const a = route.points[start % count],
		b = route.points[Math.min(start + 1, count - 1) % count];
	return {
		state: {
			...createState(),
			x: a.x,
			z: a.z,
			heading: Math.atan2(b.x - a.x, b.z - a.z),
			gait: route.gaits[start % count],
		},
		route,
		index: Math.min(start + 1, count - 1),
		waiting: 0,
		travelled: 0,
		detour: 0,
		detourSide: 1,
	};
}

/** Switches to a new route, picking it up at the point nearest the rider. */
export function follow(npc: Npc, route: Route) {
	let nearest = 0,
		distance = Infinity;
	route.points.forEach((p, i) => {
		const d = Math.hypot(p.x - npc.state.x, p.z - npc.state.z);
		if (d < distance) {
			distance = d;
			nearest = i;
		}
	});
	npc.route = route;
	npc.index = route.closed
		? nearest
		: Math.min(route.points.length - 1, nearest);
	npc.travelled = 0;
	npc.waiting = 0;
}

/** The first thing in the way just ahead of a rider, if any. */
function blockedAhead(state: GameState, blockers: readonly Solid[]) {
	const forward = { x: Math.sin(state.heading), z: Math.cos(state.heading) };
	// Never shorter than at a walk, so a rider that has stopped stays stopped.
	const reach = 3 + Math.max(2.5, state.speed) * 0.7;
	for (const b of blockers) {
		const dx = b.x - state.x,
			dz = b.z - state.z;
		const ahead = dx * forward.x + dz * forward.z,
			side = dx * forward.z - dz * forward.x;
		if (
			ahead > 0.5 &&
			ahead < reach &&
			Math.abs(side) < 1.1 + Math.max(b.w, b.d) / 2
		)
			return { side };
	}
	return undefined;
}

/**
 * One step of a rider following a route: steering by pure pursuit, keeping the
 * route's pace, jumping fences in the way, passing oncoming riders on the
 * right and waiting for, or after a while stepping round, anyone blocking it.
 * Returns the steering, for the horse animation, and whether an open route
 * has been ridden to its end.
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
	/** Other riders, and this rider's own right of way. */
	traffic: readonly Traffic[] = [],
	rank = 0,
) {
	const { state, route } = npc;
	const count = route.points.length,
		last = count - 1;
	// Move the target along the route once it comes within reach.
	for (let guard = 0; guard < count; guard++) {
		const p = route.points[npc.index];
		if (Math.hypot(p.x - state.x, p.z - state.z) > LOOKAHEAD) break;
		if (!route.closed && npc.index === last) break;
		npc.index = (npc.index + 1) % count;
	}
	const end = route.points[last];
	const arrived =
		!route.closed &&
		npc.index === last &&
		Math.hypot(end.x - state.x, end.z - state.z) < 1.2;
	const target = { ...route.points[npc.index] };
	const forward = { x: Math.sin(state.heading), z: Math.cos(state.heading) },
		right = { x: -Math.cos(state.heading), z: Math.sin(state.heading) };
	// Keep right of riders coming the other way; wait at crossings for anyone
	// with right of way, and queue behind slower riders going the same way.
	const riders: Solid[] = [];
	let oncoming = false;
	for (const other of traffic) {
		const dx = other.x - state.x,
			dz = other.z - state.z;
		const distance = Math.hypot(dx, dz);
		if (distance < 0.01 || distance > 14) continue;
		const ahead = (dx * forward.x + dz * forward.z) / distance;
		const facing =
			Math.sin(other.heading) * forward.x + Math.cos(other.heading) * forward.z;
		if (ahead < 0.2) continue;
		if (facing < -0.3) oncoming = true;
		else if (facing > 0.5 || other.rank < rank)
			riders.push({ x: other.x, z: other.z, w: 1.3, d: 1.3 });
	}
	const aside =
		(oncoming ? 1.8 : 0) + (npc.detour > 0 ? 3 * npc.detourSide : 0);
	target.x += right.x * aside;
	target.z += right.z * aside;
	const bearing = Math.atan2(target.x - state.x, target.z - state.z);
	const error = Math.atan2(
		Math.sin(bearing - state.heading),
		Math.cos(bearing - state.heading),
	);
	const turn = Math.max(-1, Math.min(1, error * 2.2));
	// Take off a few strides before any standing rails on the line ahead.
	if (state.jump < 0)
		for (const obstacle of obstacles) {
			if (obstacle.down) continue;
			const here = toObstacle(obstacle, state.x, state.z);
			const ahead = toObstacle(
				obstacle,
				state.x + forward.x * 3.6,
				state.z + forward.z * 3.6,
			);
			if (
				here.v * ahead.v < 0 &&
				Math.abs(ahead.u) < obstacle.width / 2 + 0.5 &&
				state.speed > 3
			)
				requestJump(state);
		}
	const person = blockedAhead(state, blockers),
		rider = blockedAhead(state, riders),
		horse = blockedAhead(state, passable);
	npc.waiting = person || horse || rider ? npc.waiting + dt : 0;
	// Someone standing in the way for a while is stepped round, on the side
	// with more room; a rider ahead is simply waited for.
	const standing = person ?? horse;
	if (standing && npc.detour <= 0 && npc.waiting > SIDESTEP) {
		npc.detour = 9;
		npc.detourSide = standing.side > 0 ? -1 : 1;
	}
	if (npc.detour > 0) npc.detour -= Math.abs(state.speed) * dt;
	const blocked =
		state.jump < 0 &&
		npc.detour <= 0 &&
		(!!rider || !!person || (!!horse && npc.waiting < PATIENCE));
	// Turn on the spot to face a sidestep before setting off again.
	const sidestepping = npc.detour > 0 && Math.abs(error) > 0.5;
	state.gait = blocked || arrived || sidestepping ? 0 : route.gaits[npc.index];
	const before = { x: state.x, z: state.z };
	step(
		state,
		dt,
		blocked ? 0 : turn,
		obstacles,
		[],
		blocked || arrived ? undefined : pace,
	);
	npc.travelled += Math.hypot(state.x - before.x, state.z - before.z);
	return { turn: blocked ? 0 : turn, arrived };
}

/** A route along a polyline, with a gait chosen by how sharply it bends. */
export function routeFromPoints(
	points: readonly { x: number; z: number }[],
	fast: number,
	slow = fast,
	bend = 0.25,
	/** Points before a bend at which the rider already slows down. */
	brake = 0,
	closed = true,
): Route {
	const count = points.length;
	const at = (i: number) =>
		points[closed ? (i + count) % count : Math.max(0, Math.min(count - 1, i))];
	const gaits = points.map((p, i) => {
		const a = at(i - 2),
			b = at(i + 2);
		const before = Math.atan2(p.x - a.x, p.z - a.z),
			after = Math.atan2(b.x - p.x, b.z - p.z);
		const turn = Math.abs(
			Math.atan2(Math.sin(after - before), Math.cos(after - before)),
		);
		return turn > bend ? slow : fast;
	});
	const slowed = gaits.map((gait, i) => {
		for (let k = 0; k <= brake; k++) {
			const j = closed ? (i + k) % count : Math.min(count - 1, i + k);
			if (gaits[j] === slow) return slow;
		}
		return gait;
	});
	// An open route slows to a walk for its last few metres.
	if (!closed)
		for (let i = Math.max(0, count - 4); i < count; i++)
			slowed[i] = Math.min(slowed[i], 1);
	return { points, gaits: slowed, closed };
}

/** Length of a route, for counting laps. */
export function routeLength(route: Route) {
	let length = 0;
	const count = route.points.length;
	for (let i = 0; i < (route.closed ? count : count - 1); i++) {
		const a = route.points[i],
			b = route.points[(i + 1) % count];
		length += Math.hypot(b.x - a.x, b.z - a.z);
	}
	return length;
}
