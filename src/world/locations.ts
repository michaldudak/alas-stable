import { insideStable, inTackRoom } from './stable-layout.ts';

export function isSand(x: number, z: number) {
	return Math.abs(x) < 16 && z < 20 && z > -38;
}

export function locationName(x: number, z: number): string {
	if (inTackRoom(x, z)) return 'Siodlarnia';
	if (insideStable(x, z)) return 'Stajnia';
	if (z < -40) return 'Leśna ścieżka';
	if (Math.abs(x) < 17 && z < 21) return 'Plac do skoków';
	if (x < -20 && z < 25 && z > -10) return 'Stadnina';
	return 'Słoneczna polana';
}
