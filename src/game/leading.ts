import type { GameState, Solid } from './types.ts';
import { WORLD_RADIUS, HORSE_COLLISION_RADIUS } from './tuning.ts';
export const LEAD_LENGTH = 6;
export function leadPathClear(
	horse: GameState,
	person: GameState,
	solids: readonly Solid[],
) {
	for (let i = 1; i < 32; i++) {
		const t = i / 32,
			x = horse.x + (person.x - horse.x) * t,
			z = horse.z + (person.z - horse.z) * t;
		if (
			solids.some(
				(s) =>
					Math.abs(x - s.x) < s.w / 2 + 0.05 &&
					Math.abs(z - s.z) < s.d / 2 + 0.05,
			)
		)
			return false;
	}
	return true;
}
export function stepLedHorse(
	horse: GameState,
	person: GameState,
	dt: number,
	solids: readonly Solid[],
) {
	const distance = Math.hypot(person.x - horse.x, person.z - horse.z);
	const desired = Math.atan2(person.x - horse.x, person.z - horse.z);
	const error = Math.atan2(
		Math.sin(desired - horse.heading),
		Math.cos(desired - horse.heading),
	);
	const turn = distance > 2.8 ? Math.max(-1, Math.min(1, error * 2)) : 0;
	horse.heading += turn * dt * 1.7;
	const target =
		distance > 2.8 && Math.abs(error) < 0.9
			? Math.min(4.2, (distance - 2.6) * 2)
			: 0;
	horse.speed += (target - horse.speed) * Math.min(1, dt * 5);
	const x = horse.x + Math.sin(horse.heading) * horse.speed * dt,
		z = horse.z + Math.cos(horse.heading) * horse.speed * dt;
	const blocked =
		Math.hypot(x, z) > WORLD_RADIUS ||
		Math.hypot(person.x - x, person.z - z) < 2.3 ||
		solids.some(
			(s) =>
				Math.abs(x - s.x) < s.w / 2 + HORSE_COLLISION_RADIUS &&
				Math.abs(z - s.z) < s.d / 2 + HORSE_COLLISION_RADIUS,
		);
	if (blocked) horse.speed = 0;
	else {
		horse.x = x;
		horse.z = z;
	}
	horse.gait = horse.speed > 0.12 ? (horse.speed > 3 ? 2 : 1) : 0;
	return turn;
}
