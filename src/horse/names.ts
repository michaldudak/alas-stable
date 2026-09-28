/** Longest name that still fits a stall nameplate. */
export const NAME_LENGTH = 14;

/**
 * Cleans a name typed by the player: no control characters or angle brackets,
 * single spaces, at most `NAME_LENGTH` characters. Empty names fall back.
 */
export function normalizeHorseName(value: unknown, fallback: string) {
	if (typeof value !== 'string') return fallback;
	const cleaned = value
		.replace(/[\p{C}<>]/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
	// Count letters as the reader sees them, so accents and emoji stay whole.
	const letters = Array.from(
		new Intl.Segmenter().segment(cleaned),
		(part) => part.segment,
	);
	return letters.slice(0, NAME_LENGTH).join('').trim() || fallback;
}

/** Names offered by the dice button, per language. Player-readable. */
export const NAME_IDEAS = {
	pl: [
		'Cynamon',
		'Pierniczek',
		'Karmelek',
		'Gwiazdka',
		'Iskierka',
		'Kropka',
		'Tęcza',
		'Perełka',
		'Bursztyn',
		'Mgiełka',
		'Wicherek',
		'Płomyk',
		'Czekolada',
		'Śnieżka',
		'Sasanka',
		'Malinka',
		'Jagódka',
		'Orzeszek',
		'Łatka',
		'Promyk',
		'Grzywka',
		'Kasztanka',
		'Chmurka',
		'Dzwonek',
	],
	en: [
		'Biscuit',
		'Maple',
		'Pepper',
		'Willow',
		'Hazel',
		'Clover',
		'Honey',
		'Comet',
		'Shadow',
		'Blaze',
		'Daisy',
		'Ginger',
		'Nutmeg',
		'Pebble',
		'Misty',
		'Sunny',
		'Toffee',
		'Button',
		'Juniper',
		'Rosie',
		'Skye',
		'Bramble',
		'Cocoa',
		'Starlight',
	],
} as const;

/** A suggestion that no horse in `taken` uses yet. */
export function suggestName(
	language: keyof typeof NAME_IDEAS,
	taken: readonly string[],
	random: () => number = Math.random,
) {
	const used = new Set(taken.map((name) => name.toLocaleLowerCase()));
	const ideas = NAME_IDEAS[language].filter(
		(name) => !used.has(name.toLocaleLowerCase()),
	);
	const list = ideas.length ? ideas : NAME_IDEAS[language];
	return list[Math.floor(random() * list.length)];
}
