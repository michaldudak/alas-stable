/** Positions of the large features of the map, shared by scenery, physics and the minimap. */

export type Point = { x: number; z: number };

/** The jumping arena's fence line; the south side has a gate in the middle. */
export const ARENA = { x: 0, z: -9, halfWidth: 17, halfDepth: 30 };

/** Control points of the bridleway loop through the meadow and the forest. */
export const BRIDLEWAY: readonly Point[] = [
	{ x: 0, z: 31 },
	{ x: 36, z: 40 },
	{ x: 70, z: 10 },
	{ x: 63, z: -57 },
	{ x: 10, z: -80 },
	{ x: -60, z: -62 },
	{ x: -72, z: -4 },
	{ x: -44, z: 30 },
];

/**
 * An oval racecourse: two straights joined by semicircular bends. Distances are
 * measured to the centre line of the sand.
 */
export const RACE_TRACK = {
	x: 72,
	z: 104,
	/** Half the length of each straight. */
	straight: 34,
	/** Radius of the bends' centre line. */
	radius: 25,
	halfWidth: 5,
	/** The rails leave an opening in the north straight, towards the stables. */
	gateX: 60,
	gateHalfWidth: 4.5,
};

export function raceTrackDistance(x: number, z: number) {
	const dx = Math.max(0, Math.abs(x - RACE_TRACK.x) - RACE_TRACK.straight),
		dz = z - RACE_TRACK.z;
	return Math.hypot(dx, dz) - RACE_TRACK.radius;
}

/** The point on the racecourse centre line at `u` ∈ [0, 1), anticlockwise from the start. */
export function raceTrackPoint(u: number, lane = 0) {
	const { x, z, straight, radius } = RACE_TRACK;
	const r = radius + lane;
	const bend = Math.PI * r,
		length = 4 * straight + 2 * bend;
	let s = (((u % 1) + 1) % 1) * length;
	// North straight, westwards from the east end.
	if (s < 2 * straight) return { x: x + straight - s, z: z - r };
	s -= 2 * straight;
	if (s < bend) {
		const a = s / r;
		return { x: x - straight - Math.sin(a) * r, z: z - Math.cos(a) * r };
	}
	s -= bend;
	if (s < 2 * straight) return { x: x - straight + s, z: z + r };
	s -= 2 * straight;
	const a = s / r;
	return { x: x + straight + Math.sin(a) * r, z: z + Math.cos(a) * r };
}

export const raceTrackLength = () =>
	4 * RACE_TRACK.straight + 2 * Math.PI * RACE_TRACK.radius;

/** A fenced paddock of lush grass east of the bridleway. */
export const PASTURE = {
	x: 118,
	z: -8,
	halfWidth: 28,
	halfDepth: 34,
	/** The gate sits in the middle of the west fence. */
	gateHalfWidth: 3.5,
};

export function inPasture(x: number, z: number, margin = 0) {
	return (
		Math.abs(x - PASTURE.x) < PASTURE.halfWidth + margin &&
		Math.abs(z - PASTURE.z) < PASTURE.halfDepth + margin
	);
}

/** Worn tracks connecting the new areas to the bridleway. */
export const PATHS: readonly { points: Point[]; halfWidth: number }[] = [
	// Bridleway to the racecourse gate.
	{
		points: [
			{ x: 40, z: 40 },
			{ x: 52, z: 56 },
			{ x: RACE_TRACK.gateX, z: RACE_TRACK.z - RACE_TRACK.radius - 4 },
		],
		halfWidth: 2.6,
	},
	// Bridleway to the pasture gate.
	{
		points: [
			{ x: 69, z: -8 },
			{ x: 80, z: -8 },
			{ x: PASTURE.x - PASTURE.halfWidth + 1, z: PASTURE.z },
		],
		halfWidth: 2.6,
	},
	// The yard in front of the southern stables.
	{
		points: [
			{ x: -38, z: 31 },
			{ x: -38, z: 37 },
		],
		halfWidth: 3.6,
	},
	{
		points: [
			{ x: -8, z: 31 },
			{ x: -8, z: 39 },
		],
		halfWidth: 3.6,
	},
	// From the clubhouse door to the bridleway by the stable yard.
	{
		points: [
			{ x: -59.9, z: 36 },
			{ x: -54, z: 34 },
			{ x: -49, z: 31 },
		],
		halfWidth: 1.4,
	},
];

/**
 * The riders' clubhouse beside the stable yard, where the other riders spend
 * the night. The door is in the middle of the east wall.
 */
export const CLUBHOUSE = {
	x: -64,
	z: 36,
	halfWidth: 4,
	halfDepth: 3.2,
	door: { x: -59.9, z: 36 },
};
