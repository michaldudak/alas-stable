import type { GameState, Solid } from './types.ts';
import { planApproach, REACH } from './riding.ts';
import { leadPathClear } from './leading.ts';
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
function byDistance<T extends { state: GameState }>(
	horses: readonly T[],
	person: GameState,
) {
	return horses
		.map((horse) => ({
			horse,
			distance: Math.hypot(person.x - horse.state.x, person.z - horse.state.z),
		}))
		.filter(({ distance }) => distance <= REACH)
		.sort((a, b) => a.distance - b.distance)
		.map(({ horse }) => horse);
}
/** The nearest horse the rider can walk up to and mount, with the walk there. */
export function nearbyMount<T extends { state: GameState }>(
	horses: readonly T[],
	person: GameState,
	solids: readonly Solid[],
	/** Extra routes to a horse, such as through its stall door. */
	via: (horse: GameState) => { x: number; z: number }[][] = () => [],
) {
	for (const horse of byDistance(horses, person)) {
		const plan = planApproach(
			horse.state,
			person,
			[
				...solids,
				...horses.filter((h) => h !== horse).map((h) => horseBarrier(h.state)),
			],
			via(horse.state),
		);
		if (plan) return { horse, side: plan, path: plan.path };
	}
	return undefined;
}
/** The nearest horse within reach of the lead rope, with nothing in between. */
export function nearbyLead<T extends { state: GameState }>(
	horses: readonly T[],
	person: GameState,
	solids: readonly Solid[],
) {
	return byDistance(horses, person).find((horse) =>
		leadPathClear(horse.state, person, solids),
	);
}
