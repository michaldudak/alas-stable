import type { MessageKey } from '../i18n/index.ts';
import { regionAt } from '../game/regions.ts';
import { BEACH } from './region-layout.ts';
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
	if (region === 'beach' || region === 'mountains') return true;
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
		if (lx < BEACH.shore) return 'location.sea';
		if (lx > BEACH.dunes) return 'location.carPark';
		return 'location.beach';
	}
	if (region !== 'home') return `region.${region}`;
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
