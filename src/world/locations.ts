import type { MessageKey } from '../i18n/index.ts';
import { insideStable, inTackRoom } from './stable-layout.ts';

export function isSand(x: number, z: number) {
	return Math.abs(x) < 16 && z < 20 && z > -38;
}

export function locationName(x: number, z: number): MessageKey {
	if (inTackRoom(x, z)) return 'location.tack';
	if (insideStable(x, z)) return 'location.stable';
	if (z < -40) return 'location.forest';
	if (Math.abs(x) < 17 && z < 21) return 'location.arena';
	if (x < -20 && z < 25 && z > -10) return 'location.stud';
	return 'location.glade';
}
