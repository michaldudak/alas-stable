/**
 * The neck and head rig. The sculpt has no neck bones of its own, so skin
 * weights come from where each vertex sits between two planes: the base of the
 * neck (withers to the point of the chest) and the throatlatch (poll to the
 * throat). Coordinates are body space: (y, z), +Z forward.
 */

type YZ = readonly [number, number];

/** Top of the withers and the point of the chest bound the base of the neck. */
const WITHERS: YZ = [2.63, 0.5];
const CHEST: YZ = [1.55, 1.05];
/** The poll and the throatlatch bound the head. */
const POLL: YZ = [3.52, 1.52];
const THROAT: YZ = [2.37, 1.3];

/** Joint pivots: neck root, mid-neck and the head at the atlas. */
export const NECK_PIVOTS: readonly YZ[] = [
	[1.75, 0.82],
	[2.42, 1.12],
	[2.95, 1.42],
];

function normal(a: YZ, b: YZ, towards: YZ): YZ {
	const dy = b[0] - a[0],
		dz = b[1] - a[1];
	let ny = -dz,
		nz = dy;
	if ((towards[0] - a[0]) * ny + (towards[1] - a[1]) * nz < 0) {
		ny = -ny;
		nz = -nz;
	}
	const length = Math.hypot(ny, nz);
	return [ny / length, nz / length];
}

const BASE_NORMAL = normal(WITHERS, CHEST, POLL),
	HEAD_NORMAL = normal(POLL, THROAT, [2.7, 2.15]);

const smooth = (edge0: number, edge1: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
};

/** Position along the neck: 0 at its base, 1 at the throatlatch. */
export function neckCoordinate(y: number, z: number) {
	const s =
		(y - WITHERS[0]) * BASE_NORMAL[0] + (z - WITHERS[1]) * BASE_NORMAL[1];
	const h = (y - POLL[0]) * HEAD_NORMAL[0] + (z - POLL[1]) * HEAD_NORMAL[1];
	if (s <= 0) return s / 1.2;
	if (h >= 0) return 1 + h / 1.2;
	return s / (s - h);
}

/**
 * Shares of the body, the two neck bones and the head for a vertex, summing
 * to one. Overlapping bands give a smooth bend at each joint.
 */
export function neckWeights(
	y: number,
	z: number,
): [number, number, number, number] {
	const u = neckCoordinate(y, z);
	const root = smooth(-0.06, 0.22, u),
		middle = smooth(0.35, 0.65, u),
		head = smooth(0.9, 1.06, u);
	return [1 - root, root * (1 - middle), middle * (1 - head), head];
}

/** The hindquarters pivot at the loins, behind the saddle; (y, z) in body space. */
export const CROUP_PIVOT: YZ = [2.3, -0.62];

/**
 * Share of a vertex that moves with the hindquarters: none under the saddle,
 * all of it from the point of the hip backwards.
 */
export function croupWeight(z: number) {
	return smooth(-0.5, -0.95, z);
}
