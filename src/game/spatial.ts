import type { Solid } from './types.ts';

/**
 * A coarse grid over static solids, so creatures that move every frame only
 * test the walls, fences and trunks around them.
 */
export function createSolidGrid(solids: readonly Solid[], cell = 12) {
	const cells = new Map<string, Solid[]>();
	const key = (i: number, j: number) => `${i}:${j}`;
	for (const solid of solids) {
		const i0 = Math.floor((solid.x - solid.w / 2) / cell),
			i1 = Math.floor((solid.x + solid.w / 2) / cell),
			j0 = Math.floor((solid.z - solid.d / 2) / cell),
			j1 = Math.floor((solid.z + solid.d / 2) / cell);
		for (let i = i0; i <= i1; i++)
			for (let j = j0; j <= j1; j++) {
				const k = key(i, j);
				if (!cells.has(k)) cells.set(k, []);
				cells.get(k)!.push(solid);
			}
	}
	return {
		/** Solids overlapping the square of `radius` around a point, without duplicates. */
		near(x: number, z: number, radius: number, into: Solid[] = []) {
			into.length = 0;
			const i0 = Math.floor((x - radius) / cell),
				i1 = Math.floor((x + radius) / cell),
				j0 = Math.floor((z - radius) / cell),
				j1 = Math.floor((z + radius) / cell);
			for (let i = i0; i <= i1; i++)
				for (let j = j0; j <= j1; j++)
					for (const solid of cells.get(key(i, j)) ?? [])
						if (!into.includes(solid)) into.push(solid);
			return into;
		},
	};
}
