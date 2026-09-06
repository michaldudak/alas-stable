import type { MessageKey } from '../i18n/index.ts';
export const styleOptions = {
	equipment: [
		['saddled', 'equipment.saddled'],
		['bareback', 'equipment.bareback'],
	],
	maneStyle: [
		['short', 'mane.short'],
		['long', 'mane.long'],
		['braided', 'mane.braided'],
	],
	tailStyle: [
		['short', 'tail.short'],
		['long', 'tail.long'],
		['braided', 'tail.braided'],
	],
	ornament: [
		['none', 'ornament.none'],
		['flower', 'ornament.flower'],
		['bow', 'ornament.bow'],
		['ribbons', 'ornament.ribbons'],
	],
	pattern: [
		['plain', 'pattern.plain'],
		['dots', 'pattern.dots'],
		['stripes', 'pattern.stripes'],
		['stars', 'pattern.stars'],
	],
} as const;
export type ColorKey = 'coat' | 'hair' | 'cloth' | 'leather' | 'ornamentColor';
export type StyleKey = keyof typeof styleOptions;
export interface Appearance extends Record<ColorKey, string> {
	maneStyle: 'short' | 'long' | 'braided';
	tailStyle: 'short' | 'long' | 'braided';
	ornament: 'none' | 'flower' | 'bow' | 'ribbons';
	pattern: 'plain' | 'dots' | 'stripes' | 'stars';
	equipment: 'saddled' | 'bareback';
}
export const colorOptions: [ColorKey, MessageKey, string[], MessageKey[]][] = [
	[
		'coat',
		'appearance.coat',
		['#aa6941', '#e1c39a', '#665046', '#e6e0d2', '#343330'],
		['coat.chestnut', 'coat.light', 'coat.bay', 'coat.gray', 'coat.black'],
	],
	[
		'hair',
		'appearance.hairColor',
		['#47332d', '#d7b879', '#e9e3d1', '#8d5236'],
		['hair.dark', 'hair.gold', 'hair.white', 'hair.red'],
	],
	[
		'cloth',
		'appearance.cloth',
		['#437f79', '#b75f59', '#b3a45a', '#7275a3', '#d5ba94'],
		['color.teal', 'color.red', 'color.olive', 'color.purple', 'color.cream'],
	],
	[
		'leather',
		'appearance.saddle',
		['#60432c', '#343330', '#a17448'],
		['leather.brown', 'leather.black', 'leather.light'],
	],
	[
		'ornamentColor',
		'appearance.ornamentColor',
		['#e9be5f', '#c55e6e', '#7296bb', '#9982b6', '#eee4ce'],
		['color.gold', 'color.pink', 'color.blue', 'color.purple', 'color.cream'],
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
		equipment: 'saddled',
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
	result.equipment = readStyle('equipment');
	return result;
}
