import type { GameState, Solid } from './types.ts';
import { mountSide } from './riding.ts';
export function horseBarrier(horse: GameState): Solid {
	const across = Math.abs(Math.cos(horse.heading)),
		along = Math.abs(Math.sin(horse.heading));
	return {
		x: horse.x,
		z: horse.z,
		w: 1.3 * across + 2.5 * along,
		d: 2.5 * across + 1.3 * along,
	};
}
export function nearbyMount<T extends { state: GameState }>(
	horses: readonly T[],
	person: GameState,
	solids: readonly Solid[],
) {
	const candidates = horses
		.filter(
			(h) => Math.hypot(person.x - h.state.x, person.z - h.state.z) <= 3.3,
		)
		.sort(
			(a, b) =>
				Math.hypot(person.x - a.state.x, person.z - a.state.z) -
				Math.hypot(person.x - b.state.x, person.z - b.state.z),
		);
	for (const horse of candidates) {
		const side = mountSide(
			horse.state,
			[
				...solids,
				...horses.filter((h) => h !== horse).map((h) => horseBarrier(h.state)),
			],
			person,
		);
		if (side) return { horse, side };
	}
	return undefined;
}
