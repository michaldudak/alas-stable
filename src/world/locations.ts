import type { MessageKey } from '../i18n/index.ts';
import { stableAt, inTackRoom } from './stable-layout.ts';
import { ARENA, RACE_TRACK, inPasture, raceTrackDistance } from './layout.ts';

export function isSand(x: number, z: number) {
	return (
		(Math.abs(x - ARENA.x) < ARENA.halfWidth - 1 &&
			Math.abs(z - ARENA.z) < ARENA.halfDepth - 1) ||
		Math.abs(raceTrackDistance(x, z)) < RACE_TRACK.halfWidth
	);
}

export function locationName(x: number, z: number): MessageKey {
	if (inTackRoom(x, z)) return 'location.tack';
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
