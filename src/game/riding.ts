import type { GameState, Solid } from './types.ts';
import { WORLD_RADIUS } from './tuning.ts';
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
export function stepPerson(
	state: GameState,
	dt: number,
	turn: number,
	solids: readonly Solid[],
	horse: GameState,
) {
	const targetSpeed =
		state.gait === -1 ? FOOT_REVERSE_SPEED : FOOT_SPEEDS[state.gait];
	state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 8);
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
