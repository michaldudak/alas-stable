import type { MessageKey } from '../i18n/index.ts';
import { regionAt } from '../game/regions.ts';
import {
	BEACH,
	HIPPODROME,
	MOUNTAINS,
	PARKING,
	hippodromeDistance,
	pierHeight,
} from './region-layout.ts';
import { stableAt, inTackRoom } from './stable-layout.ts';
import {
	ARENA,
	RACE_TRACK,
	inPasture,
	insideClubhouse,
	raceTrackDistance,
} from './layout.ts';

/** Soft going underfoot: sand, the beach, or snow. */
export function isSand(x: number, z: number) {
	const region = regionAt(x, z);
	// Hooves ring on the boards of the pier.
	if (region === 'beach') return pierHeight(x, z) === 0;
	if (region === 'mountains') return true;
	if (region !== 'home') return false;
	return (
		(Math.abs(x - ARENA.x) < ARENA.halfWidth - 1 &&
			Math.abs(z - ARENA.z) < ARENA.halfDepth - 1) ||
		Math.abs(raceTrackDistance(x, z)) < RACE_TRACK.halfWidth
	);
}

export function locationName(x: number, z: number): MessageKey {
	const region = regionAt(x, z);
	if (region === 'beach') {
		const lx = x - BEACH.x;
		if (pierHeight(x, z) > 0) return 'location.pier';
		if (lx < BEACH.shore) return 'location.sea';
		if (lx > BEACH.dunes) return 'location.carPark';
		return 'location.beach';
	}
	if (region === 'mountains') {
		const lx = x - MOUNTAINS.x,
			lz = z - MOUNTAINS.z;
		const { hut, tarn } = MOUNTAINS;
		if (Math.hypot(lx - hut.x, lz - hut.z) < 16) return 'location.hut';
		if (
			((lx - tarn.x) / (tarn.radiusX + 8)) ** 2 +
				((lz - tarn.z) / (tarn.radiusZ + 8)) ** 2 <
			1
		)
			return 'location.tarn';
		const parked = PARKING.mountains;
		if (Math.hypot(x - parked.x, z - parked.z) < 14) return 'location.carPark';
		return 'location.valley';
	}
	if (region === 'hippodrome') {
		const d = hippodromeDistance(x, z);
		const { stand } = HIPPODROME;
		if (Math.abs(d) < HIPPODROME.halfWidth + 0.5) return 'location.racecourse';
		if (d < 0) return 'location.infield';
		if (
			Math.abs(x - HIPPODROME.x - stand.x) < stand.halfWidth + 4 &&
			z - HIPPODROME.z > stand.z - stand.depth
		)
			return 'location.grandstand';
		const parked = PARKING.hippodrome;
		if (Math.hypot(x - parked.x, z - parked.z) < 16) return 'location.carPark';
		return 'region.hippodrome';
	}
	if (inTackRoom(x, z)) return 'location.tack';
	if (insideClubhouse(x, z)) return 'location.clubhouse';
	const stable = stableAt(x, z);
	if (stable)
		return stable.id === 'main'
			? 'location.stable'
			: stable.id === 'linden'
				? 'location.lindenStable'
				: 'location.meadowStable';
	if (inPasture(x, z)) return 'location.pasture';
	if (raceTrackDistance(x, z) < RACE_TRACK.halfWidth + 1)
		return 'location.raceTrack';
	if (z < -40) return 'location.forest';
	if (
		Math.abs(x - ARENA.x) < ARENA.halfWidth &&
		Math.abs(z - ARENA.z) < ARENA.halfDepth
	)
		return 'location.arena';
	if (x < -20 && z < 72 && z > -34) return 'location.stud';
	return 'location.glade';
}
