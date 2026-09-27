import type { Solid } from '../game/types.ts';

/** Every stable shares one cross-section; only the number of stall bays differs. */
export interface StableSpec {
	id: 'main' | 'linden' | 'meadow';
	x: number;
	z: number;
	/** Eight-metre stall bays on each side of the aisle. */
	bays: number;
	/** The bay nearest the south doors on the east side becomes the tack room. */
	tackRoom: boolean;
}

export const STABLE_HALF_WIDTH = 12;
export const AISLE_HALF_WIDTH = 3.7;
export const BAY_LENGTH = 8;

export const STABLES: readonly StableSpec[] = [
	{ id: 'main', x: -38, z: -9, bays: 5, tackRoom: true },
	{ id: 'linden', x: -38, z: 50, bays: 3, tackRoom: false },
	{ id: 'meadow', x: -8, z: 52, bays: 3, tackRoom: false },
];

export const halfDepth = (spec: StableSpec) => spec.bays * 4 + 1;
/** Local Z of the centre of stall bay `i`, counted from the north doors. */
export const bayCenter = (spec: StableSpec, i: number) =>
	-halfDepth(spec) + 4 + BAY_LENGTH * i;

/** The main stable, with its extent, for code that only concerns the home yard. */
export const STABLE = {
	...STABLES[0],
	halfWidth: STABLE_HALF_WIDTH,
	halfDepth: halfDepth(STABLES[0]),
	aisleHalfWidth: AISLE_HALF_WIDTH,
};

export type StableWall = Solid & { h: number; stall?: boolean };

/** Rendered walls and physical barriers share these dimensions (stable-local). */
export function stableWalls(spec: StableSpec): StableWall[] {
	const depth = halfDepth(spec),
		last = bayCenter(spec, spec.bays - 1);
	const walls: StableWall[] = [
		{ x: -12, z: 0, w: 0.4, d: depth * 2, h: 6 },
		{ x: 12, z: 0, w: 0.4, d: depth * 2, h: 6 },
		// End walls leave a 7.6-unit doorway in the middle of each gable.
		...[-depth, depth].flatMap((z) =>
			[-1, 1].map((side) => ({ x: side * 7.9, z, w: 8.2, d: 0.4, h: 6 })),
		),
	];
	for (const side of [-1, 1]) {
		for (let i = 1; i < spec.bays; i++)
			walls.push({
				x: side * 7.85,
				z: -depth + BAY_LENGTH * i,
				w: 8.3,
				d: 0.22,
				h: 3.8,
			});
		const tack = side > 0 && spec.tackRoom;
		// The last bay closes two metres short of the gable, leaving an alcove.
		if (!tack)
			walls.push({
				x: side * 7.85,
				z: depth - 2,
				w: 8.3,
				d: 0.22,
				h: 3.8,
			});
		for (let i = 0; i < spec.bays; i++) {
			if (tack && i === spec.bays - 1) continue;
			// Each stall opens onto the aisle through a 3.2-unit doorway.
			for (const offset of [-2.8, 2.8])
				walls.push({
					x: side * AISLE_HALF_WIDTH,
					z: bayCenter(spec, i) + offset,
					w: 0.2,
					d: 2.4,
					h: 1.8,
					stall: true,
				});
		}
	}
	// Tack-room entrance is 4.8 units wide, opening directly onto the aisle.
	if (spec.tackRoom)
		walls.push(
			{ x: AISLE_HALF_WIDTH, z: last - 3.25, w: 0.2, d: 1.5, h: 4.6 },
			{
				x: AISLE_HALF_WIDTH,
				z: (last + 3.5 + depth) / 2,
				w: 0.2,
				d: depth - last - 3.5,
				h: 4.6,
			},
		);
	return walls;
}

export function stableSolids(spec: StableSpec = STABLE): Solid[] {
	return stableWalls(spec).map((w) => ({
		x: w.x + spec.x,
		z: w.z + spec.z,
		w: w.w,
		d: w.d,
	}));
}

export function allStableSolids() {
	return STABLES.flatMap((spec) => stableSolids(spec));
}

export function stableAt(x: number, z: number, margin = 0) {
	return STABLES.find(
		(spec) =>
			Math.abs(x - spec.x) < STABLE_HALF_WIDTH + margin &&
			Math.abs(z - spec.z) < halfDepth(spec) + margin,
	);
}

export function insideStable(x: number, z: number, margin = 0) {
	return stableAt(x, z, margin) !== undefined;
}

export function inTackRoom(x: number, z: number) {
	const spec = stableAt(x, z);
	return (
		!!spec?.tackRoom &&
		x > spec.x + AISLE_HALF_WIDTH &&
		z > spec.z + bayCenter(spec, spec.bays - 1) - 4
	);
}

/** Stall interiors, where waiting horses stay unless someone leads them out. */
export function stallAt(x: number, z: number) {
	const spec = stableAt(x, z);
	if (!spec) return undefined;
	const localX = x - spec.x,
		localZ = z - spec.z;
	if (Math.abs(localX) < AISLE_HALF_WIDTH) return undefined;
	const bay = Math.floor((localZ + halfDepth(spec)) / BAY_LENGTH);
	if (bay < 0 || bay >= spec.bays) return undefined;
	if (spec.tackRoom && localX > 0 && bay === spec.bays - 1) return undefined;
	const side = Math.sign(localX);
	return {
		x: spec.x + side * 7.85,
		z: spec.z + bayCenter(spec, bay),
		halfWidth: 3.6,
		halfDepth: 3.6,
	};
}
