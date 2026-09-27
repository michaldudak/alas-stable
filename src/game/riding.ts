import type { GameState, Solid } from './types.ts';
import { WORLD_RADIUS, STICK_PACE_ADJUSTMENT } from './tuning.ts';
export const FOOT_SPEEDS = [0, 1.8, 3.8] as const;
export const FOOT_REVERSE_SPEED = -0.9;
export const MOUNT_DURATION = 1.6;
export function clearForPerson(x: number, z: number, solids: readonly Solid[]) {
	return (
		Math.hypot(x, z) < WORLD_RADIUS - 0.3 &&
		!solids.some(
			(s) =>
				Math.abs(x - s.x) < s.w / 2 + 0.28 &&
				Math.abs(z - s.z) < s.d / 2 + 0.28,
		)
	);
}
function overlapsHorse(x: number, z: number, horse: GameState) {
	const dx = x - horse.x,
		dz = z - horse.z;
	const across = dx * Math.cos(horse.heading) - dz * Math.sin(horse.heading),
		along = dx * Math.sin(horse.heading) + dz * Math.cos(horse.heading);
	return Math.abs(across) < 0.95 && Math.abs(along) < 1.55;
}
export function mountSide(
	horse: GameState,
	solids: readonly Solid[],
	person?: GameState,
) {
	const choices = [-1, 1].map((side) => ({
		side,
		x: horse.x + Math.cos(horse.heading) * side * 1.65,
		z: horse.z - Math.sin(horse.heading) * side * 1.65,
	}));
	if (person)
		choices.sort(
			(a, b) =>
				Math.hypot(a.x - person.x, a.z - person.z) -
				Math.hypot(b.x - person.x, b.z - person.z),
		);
	return choices.find((p) => {
		if (!clearForPerson(p.x, p.z, solids)) return false;
		for (let i = 0; i <= 16; i++) {
			const t = i / 16;
			if (
				!clearForPerson(
					horse.x + (p.x - horse.x) * t,
					horse.z + (p.z - horse.z) * t,
					solids,
				)
			)
				return false;
			if (
				person &&
				!clearForPerson(
					person.x + (p.x - person.x) * t,
					person.z + (p.z - person.z) * t,
					solids,
				)
			)
				return false;
			if (
				person &&
				overlapsHorse(
					person.x + (p.x - person.x) * t,
					person.z + (p.z - person.z) * t,
					horse,
				)
			)
				return false;
		}
		return true;
	});
}
/** How far from a horse the rider can start mounting or clip on the lead rope. */
export const REACH = 6.5;
/** The rider walks briskly to the saddle before mounting. */
export const APPROACH_SPEED = 2.8;

function pathClear(
	from: { x: number; z: number },
	to: { x: number; z: number },
	solids: readonly Solid[],
	horse: GameState,
) {
	const steps = Math.max(
		4,
		Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.25),
	);
	for (let i = 1; i <= steps; i++) {
		const t = i / steps,
			x = from.x + (to.x - from.x) * t,
			z = from.z + (to.z - from.z) * t;
		if (!clearForPerson(x, z, solids) || overlapsHorse(x, z, horse))
			return false;
	}
	return true;
}

/**
 * A walk from where the rider stands to the horse's side, going round its head
 * or tail when needed, ending at the point where mounting begins.
 */
export function planApproach(
	horse: GameState,
	person: GameState,
	solids: readonly Solid[],
	/** Waypoint chains to try first when the way is blocked, e.g. through a stall door. */
	via: readonly (readonly { x: number; z: number }[])[] = [],
) {
	const across = { x: Math.cos(horse.heading), z: -Math.sin(horse.heading) },
		along = { x: Math.sin(horse.heading), z: Math.cos(horse.heading) };
	/** A walk from `start` to the side point, straight or round one end of the horse. */
	function route(
		start: { x: number; z: number },
		target: { x: number; z: number; side: number },
	) {
		if (pathClear(start, target, solids, horse))
			return [{ x: target.x, z: target.z }];
		const startAlong =
			(start.x - horse.x) * along.x + (start.z - horse.z) * along.z;
		for (const end of startAlong >= 0 ? [1, -1] : [-1, 1]) {
			const corner = {
				x: horse.x + along.x * end * 2.2 + across.x * target.side * 1.65,
				z: horse.z + along.z * end * 2.2 + across.z * target.side * 1.65,
			};
			const outside = {
				x: horse.x + along.x * end * 2.2,
				z: horse.z + along.z * end * 2.2,
			};
			const walk = pathClear(start, corner, solids, horse)
				? [corner]
				: pathClear(start, outside, solids, horse) &&
					  pathClear(outside, corner, solids, horse)
					? [outside, corner]
					: undefined;
			if (walk && pathClear(corner, target, solids, horse))
				return [...walk, { x: target.x, z: target.z }];
		}
		return undefined;
	}
	const sides = [-1, 1]
		.map((side) => ({
			side,
			x: horse.x + across.x * side * 1.65,
			z: horse.z + across.z * side * 1.65,
		}))
		.sort(
			(a, b) =>
				Math.hypot(a.x - person.x, a.z - person.z) -
				Math.hypot(b.x - person.x, b.z - person.z),
		);
	for (const target of sides) {
		// The rider has to be able to swing up here: clear ground up to the horse.
		let ok = true;
		for (let i = 0; i <= 16; i++) {
			const t = i / 16;
			if (
				!clearForPerson(
					horse.x + (target.x - horse.x) * t,
					horse.z + (target.z - horse.z) * t,
					solids,
				)
			)
				ok = false;
		}
		if (!ok) continue;
		const direct = route(person, target);
		if (direct) return { ...target, path: direct };
		for (const chain of via) {
			let from: { x: number; z: number } = person,
				clear = true;
			for (const point of chain) {
				clear &&= pathClear(from, point, solids, horse);
				from = point;
			}
			const rest = clear ? route(from, target) : undefined;
			if (rest) return { ...target, path: [...chain, ...rest] };
		}
	}
	return undefined;
}

export function stepPerson(
	state: GameState,
	dt: number,
	turn: number,
	solids: readonly Solid[],
	horse: GameState,
	nudge?: number,
) {
	const targetSpeed =
		(state.gait === -1 ? FOOT_REVERSE_SPEED : FOOT_SPEEDS[state.gait]) *
		(1 + (nudge ?? 0) * STICK_PACE_ADJUSTMENT);
	if (state.gait === 0 && nudge !== undefined)
		state.speed = nudge * (nudge > 0 ? 1.2 : -FOOT_REVERSE_SPEED);
	else state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 8);
	state.heading += turn * dt * 2.1;
	const x = state.x + Math.sin(state.heading) * state.speed * dt,
		z = state.z + Math.cos(state.heading) * state.speed * dt;
	const dx = x - horse.x,
		dz = z - horse.z;
	const across = dx * Math.cos(horse.heading) - dz * Math.sin(horse.heading),
		along = dx * Math.sin(horse.heading) + dz * Math.cos(horse.heading);
	if (
		!clearForPerson(x, z, solids) ||
		(Math.abs(across) < 0.95 && Math.abs(along) < 1.55)
	) {
		state.gait = 0;
		state.speed = 0;
		return;
	}
	state.x = x;
	state.z = z;
}
