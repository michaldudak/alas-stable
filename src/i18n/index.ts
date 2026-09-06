import { readStoredValue } from '../platform/storage.ts';
import { en } from './en.ts';
import { pl } from './pl.ts';

export type Language = 'en' | 'pl';
export type MessageKey = keyof typeof en;
export type Parameters = Record<string, string>;
export const LANGUAGE_STORAGE_KEY = 'alas-stable.language';
const catalogs = { en, pl };
let language: Language = 'en';
const listeners = new Set<() => void>();

export function detectLanguage(
	preferences: readonly string[],
	hostname = '',
): Language {
	if (hostname === 'stajnia.ali.dudak.pl') return 'pl';
	if (hostname === 'alas-stable.dudak.pl') return 'en';
	for (const preference of preferences) {
		const base = preference.toLowerCase().split('-')[0];
		if (base === 'pl' || base === 'en') return base;
	}
	return 'en';
}

export function initializeLanguage() {
	let saved: string | null = null;
	try {
		saved = readStoredValue(localStorage, LANGUAGE_STORAGE_KEY);
	} catch {
		/* Storage may be disabled. */
	}
	language =
		saved === 'en' || saved === 'pl'
			? saved
			: detectLanguage(
					navigator.languages.length
						? navigator.languages
						: [navigator.language],
					window.location.hostname,
				);
	updateDocument();
}

export function getLanguage() {
	return language;
}

export function translate(
	key: MessageKey,
	locale: Language,
	parameters: Parameters = {},
): string {
	return catalogs[locale][key].replace(
		/\{(\w+)\}/g,
		(match, name: string) => parameters[name] ?? match,
	);
}

export function t(key: MessageKey, parameters: Parameters = {}): string {
	return translate(key, language, parameters);
}

function updateDocument() {
	document.documentElement.lang = language;
	document.title = t('app.title');
}

export function setLanguage(next: Language) {
	language = next;
	try {
		localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
	} catch {
		/* Keep the in-memory choice when storage is unavailable. */
	}
	updateDocument();
	for (const listener of listeners) listener();
}

export function onLanguageChange(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Bind shell placeholders once, preserving elements, focus and event handlers. */
export function bindTranslations(root: HTMLElement) {
	const bindings: (() => void)[] = [];
	const render = (template: string) =>
		template.replace(/\{\{([\w.]+)\}\}/g, (_, key: MessageKey) => t(key));
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();
	while (node) {
		const text = node as Text;
		const template = text.data;
		if (template.includes('{{'))
			bindings.push(() => {
				text.data = render(template);
			});
		node = walker.nextNode();
	}
	for (const element of root.querySelectorAll('*')) {
		for (const attribute of element.attributes) {
			if (attribute.value.includes('{{')) {
				const template = attribute.value;
				bindings.push(() =>
					element.setAttribute(attribute.name, render(template)),
				);
			}
		}
	}
	const refresh = () => {
		for (const binding of bindings) binding();
	};
	refresh();
	return refresh;
}
