export const styleOptions = {
	maneStyle: [
		['short', 'Krótka'],
		['long', 'Długa'],
		['braided', 'Zapleciona'],
	],
	tailStyle: [
		['short', 'Krótki'],
		['long', 'Długi'],
		['braided', 'Zapleciony'],
	],
	ornament: [
		['none', 'Bez ozdoby'],
		['flower', 'Kwiaty'],
		['bow', 'Kokarda'],
		['ribbons', 'Wstążki'],
	],
	pattern: [
		['plain', 'Gładki'],
		['dots', 'Kropki'],
		['stripes', 'Paski'],
		['stars', 'Gwiazdki'],
	],
};
export type ColorKey = 'coat' | 'hair' | 'cloth' | 'leather' | 'ornamentColor';
export type StyleKey = keyof typeof styleOptions;
export interface Appearance extends Record<ColorKey, string> {
	maneStyle: 'short' | 'long' | 'braided';
	tailStyle: 'short' | 'long' | 'braided';
	ornament: 'none' | 'flower' | 'bow' | 'ribbons';
	pattern: 'plain' | 'dots' | 'stripes' | 'stars';
}
export const colorOptions: [ColorKey, string, string[], string[]][] = [
	[
		'coat',
		'Maść',
		['#aa6941', '#e1c39a', '#665046', '#e6e0d2', '#343330'],
		['Kasztanowa', 'Jasna', 'Gniada', 'Siwa', 'Kara'],
	],
	[
		'hair',
		'Grzywa i ogon',
		['#47332d', '#d7b879', '#e9e3d1', '#8d5236'],
		['Ciemna', 'Złota', 'Biała', 'Ruda'],
	],
	[
		'cloth',
		'Czaprak',
		['#437f79', '#b75f59', '#b3a45a', '#7275a3', '#d5ba94'],
		['Morski', 'Czerwony', 'Oliwkowy', 'Fioletowy', 'Kremowy'],
	],
	[
		'leather',
		'Siodło',
		['#60432c', '#343330', '#a17448'],
		['Brązowe', 'Czarne', 'Jasne'],
	],
	[
		'ornamentColor',
		'Kolor ozdób',
		['#e9be5f', '#c55e6e', '#7296bb', '#9982b6', '#eee4ce'],
		['Złoty', 'Różowy', 'Niebieski', 'Fioletowy', 'Kremowy'],
	],
];

export function normalizeAppearance(value: unknown): Appearance {
	const input: Record<string, unknown> =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const result: Appearance = {
		coat: '#aa6941',
		hair: '#47332d',
		cloth: '#437f79',
		leather: '#60432c',
		ornamentColor: '#e9be5f',
		maneStyle: 'long',
		tailStyle: 'long',
		ornament: input.flower === true ? 'flower' : 'none',
		pattern: 'plain',
	};
	for (const [key, , colors] of colorOptions) {
		const candidate = input[key];
		if (typeof candidate === 'string' && colors.includes(candidate))
			result[key] = candidate;
	}
	function readStyle<K extends StyleKey>(key: K): Appearance[K] {
		const candidate = input[key];
		// Only catalogued IDs may cross the persistence boundary.
		return typeof candidate === 'string' &&
			styleOptions[key].some(([id]) => id === candidate)
			? (candidate as Appearance[K])
			: result[key];
	}
	result.maneStyle = readStyle('maneStyle');
	result.tailStyle = readStyle('tailStyle');
	result.ornament = readStyle('ornament');
	result.pattern = readStyle('pattern');
	return result;
}
