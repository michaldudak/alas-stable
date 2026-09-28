import type { Appearance } from '../horse/appearance.ts';
import type { StableSpec } from './stable-layout.ts';

/** A stall: the stable, the bay counted from the north doors and the aisle side. */
export interface Stall {
	stable: StableSpec['id'];
	bay: number;
	side: -1 | 1;
}

/**
 * Every horse on the grounds. `id` keys saved appearances and names and never
 * changes; `name` is the default name, which the player may change.
 */
export interface HorseProfile {
	id: string;
	name: string;
	home: Stall;
	/** Where the horse spends the day. */
	starts: 'stall' | 'pasture' | 'rider';
	appearance?: Partial<Appearance>;
	/** Spot on the pasture, relative to its centre, for horses turned out. */
	pasture?: { x: number; z: number; heading: number };
}

export const ROSTER: readonly HorseProfile[] = [
	{
		id: 'Raven',
		name: 'Raven',
		home: { stable: 'main', bay: 4, side: -1 },
		starts: 'rider',
	},
	{
		id: 'ISKRA',
		name: 'Iskra',
		home: { stable: 'main', bay: 0, side: -1 },
		starts: 'stall',
		appearance: { coat: '#e1c39a', hair: '#e9e3d1', maneStyle: 'short' },
	},
	{
		id: 'KOMETA',
		name: 'Kometa',
		home: { stable: 'main', bay: 1, side: -1 },
		starts: 'rider',
		appearance: {
			coat: '#aa6941',
			hair: '#d7b879',
			cloth: '#437f79',
			maneStyle: 'braided',
			pattern: 'stars',
		},
	},
	{
		id: 'LUNA',
		name: 'Luna',
		home: { stable: 'main', bay: 2, side: -1 },
		starts: 'stall',
		appearance: { coat: '#e6e0d2', hair: '#47332d', maneStyle: 'braided' },
	},
	{
		id: 'FUKS',
		name: 'Fuks',
		home: { stable: 'main', bay: 3, side: -1 },
		starts: 'stall',
		appearance: { coat: '#aa6941', hair: '#47332d' },
	},
	{
		id: 'KARMEL',
		name: 'Karmel',
		home: { stable: 'main', bay: 0, side: 1 },
		starts: 'rider',
		appearance: {
			coat: '#e1c39a',
			hair: '#e9e3d1',
			cloth: '#7275a3',
			ornament: 'bow',
			ornamentColor: '#9982b6',
		},
	},
	{
		id: 'MAKS',
		name: 'Maks',
		home: { stable: 'main', bay: 1, side: 1 },
		starts: 'stall',
		appearance: { coat: '#665046', hair: '#47332d', tailStyle: 'braided' },
	},
	{
		id: 'BURZA',
		name: 'Burza',
		home: { stable: 'main', bay: 2, side: 1 },
		starts: 'stall',
		appearance: { coat: '#343330', hair: '#d7b879' },
	},
	{
		id: 'KASZTAN',
		name: 'Kasztan',
		home: { stable: 'main', bay: 3, side: 1 },
		starts: 'stall',
		appearance: { coat: '#665046', hair: '#d7b879' },
	},
	{
		id: 'BAJKA',
		name: 'Bajka',
		home: { stable: 'linden', bay: 0, side: 1 },
		starts: 'stall',
		appearance: { coat: '#aa6941', hair: '#8d5236', maneStyle: 'short' },
	},
	{
		id: 'SZAFIR',
		name: 'Szafir',
		home: { stable: 'linden', bay: 1, side: -1 },
		starts: 'rider',
		appearance: {
			coat: '#665046',
			hair: '#47332d',
			cloth: '#b75f59',
			maneStyle: 'short',
			tailStyle: 'braided',
		},
	},
	{
		id: 'GROM',
		name: 'Grom',
		home: { stable: 'linden', bay: 1, side: 1 },
		starts: 'rider',
		appearance: {
			coat: '#343330',
			hair: '#47332d',
			cloth: '#b3a45a',
			leather: '#343330',
		},
	},
	{
		id: 'DUKAT',
		name: 'Dukat',
		home: { stable: 'linden', bay: 2, side: -1 },
		starts: 'stall',
		appearance: { coat: '#e1c39a', hair: '#d7b879' },
	},
	{
		id: 'WIATR',
		name: 'Wiatr',
		home: { stable: 'meadow', bay: 0, side: -1 },
		starts: 'pasture',
		appearance: { coat: '#343330', hair: '#47332d' },
		pasture: { x: -8, z: 6, heading: 1.2 },
	},
	{
		id: 'FIGA',
		name: 'Figa',
		home: { stable: 'meadow', bay: 1, side: -1 },
		starts: 'stall',
		appearance: { coat: '#e6e0d2', hair: '#e9e3d1', tailStyle: 'short' },
	},
	{
		id: 'ZORZA',
		name: 'Zorza',
		home: { stable: 'meadow', bay: 0, side: 1 },
		starts: 'pasture',
		appearance: { coat: '#e1c39a', hair: '#e9e3d1', maneStyle: 'short' },
		pasture: { x: 5, z: -4, heading: -2 },
	},
	{
		id: 'GRAFIT',
		name: 'Grafit',
		home: { stable: 'meadow', bay: 1, side: 1 },
		starts: 'pasture',
		appearance: { coat: '#e6e0d2', hair: '#47332d', tailStyle: 'short' },
		pasture: { x: 2, z: 16, heading: 0.4 },
	},
];

export const profile = (id: string) => ROSTER.find((horse) => horse.id === id);

/** The horse whose home is this stall, if any. */
export function resident(stable: StableSpec['id'], bay: number, side: -1 | 1) {
	return ROSTER.find(
		(horse) =>
			horse.home.stable === stable &&
			horse.home.bay === bay &&
			horse.home.side === side,
	);
}

/**
 * Stall numbers painted on the nameplates: the west side from the north doors,
 * then the east side, skipping the tack room.
 */
export function stallNumber(spec: StableSpec, bay: number, side: -1 | 1) {
	if (side < 0) return bay + 1;
	return spec.bays + bay + 1;
}
