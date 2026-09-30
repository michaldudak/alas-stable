import { REGIONS } from '../game/regions.ts';
import type { RigPose } from '../game/trailer.ts';

/**
 * Layout of the places the car drives to, shared by scenery, physics, the
 * minimap and place names. Offsets are metres from each place's centre.
 */

/** The seaside: the sea to the west, a wide beach, then dunes and pines. */
export const BEACH = {
	...REGIONS.beach,
	/** The mean waterline, west of the centre. */
	shore: -36,
	/** How far into the shallows horses may wade. */
	wade: -47,
	/** Where the dunes rise, east of the centre. */
	dunes: 23,
	/** The gap through the dunes to the car park. */
	gapHalfWidth: 9,
	/** East edge of the car park behind the dunes. */
	parkEnd: 47,
	/** A wooden pier running out to sea. */
	pier: { z: 64, halfWidth: 2.2, end: -190 },
};

/** A snowy valley ringed by mountains, with a hut and a frozen tarn. */
export const MOUNTAINS = {
	...REGIONS.mountains,
	hut: { x: -34, z: -40, halfWidth: 6, halfDepth: 4.5 },
	/** The frozen tarn is fenced off. */
	tarn: { x: 48, z: -38, radiusX: 26, radiusZ: 17 },
};

/** A grand racecourse with a grass track, a grandstand and a starting gate. */
export const HIPPODROME = {
	...REGIONS.hippodrome,
	/** Half the length of each straight. */
	straight: 95,
	/** Radius of the bends' centre line. */
	radius: 52,
	halfWidth: 8,
	/** The rails open onto the track here, on the north straight. */
	gateX: 60,
	gateHalfWidth: 5,
};

/** The distance from a point to the racecourse centre line (negative inside). */
export function hippodromeDistance(x: number, z: number) {
	const { straight, radius } = HIPPODROME;
	const dx = Math.max(0, Math.abs(x - HIPPODROME.x) - straight),
		dz = z - HIPPODROME.z;
	return Math.hypot(dx, dz) - radius;
}

/** Where the car parks in each place: the hitch point and the car's heading. */
export const PARKING: Readonly<Record<keyof typeof REGIONS, RigPose>> = {
	home: { x: -73, z: 25, heading: -Math.PI / 2 },
	beach: { x: BEACH.x + 37, z: BEACH.z + 1.5, heading: Math.PI / 2 },
	mountains: { x: MOUNTAINS.x + 8, z: MOUNTAINS.z + 118, heading: 0 },
	hippodrome: {
		x: HIPPODROME.x + 20,
		z: HIPPODROME.z - HIPPODROME.radius - 44,
		heading: -Math.PI / 2,
	},
};
