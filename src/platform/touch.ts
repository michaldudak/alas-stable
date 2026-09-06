import { readStoredValue } from './storage.ts';
import { requireElement } from './dom.ts';
import { stickAxis } from './gamepad.ts';

type TouchMode = 'auto' | 'on' | 'off';
interface TouchActions {
	isPaused(): boolean;
	pause(): void;
	unlockAudio(): void;
	changed(): void;
}

/** Pointer capture lets the movement stick, scene drag and action buttons work together. */
export function createTouchControls(root: HTMLElement, actions: TouchActions) {
	const events = new AbortController();
	const options = { signal: events.signal };
	const overlay = requireElement('#touch-controls', HTMLElement, root);
	const modeSelect = requireElement('#touch-mode', HTMLSelectElement, root);
	const coarse = matchMedia('(any-pointer: coarse)');
	const storageKey = 'alas-stable.touchControls';
	let mode: TouchMode = 'auto';
	let usingGamepad = false;
	let touched = false;
	try {
		const saved = readStoredValue(localStorage, storageKey);
		if (saved === 'auto' || saved === 'on' || saved === 'off') mode = saved;
	} catch {
		/* Touch controls also work without storage. */
	}
	const sticks = ['touch-move'].map((id) => ({
		element: requireElement('#' + id, HTMLElement, root),
		pointer: null as number | null,
		x: 0,
		y: 0,
	}));
	function release(stick: (typeof sticks)[number]) {
		const pointer = stick.pointer;
		stick.pointer = null;
		stick.x = stick.y = 0;
		stick.element.style.setProperty('--stick-x', '0px');
		stick.element.style.setProperty('--stick-y', '0px');
		stick.element.classList.remove('held');
		if (pointer !== null && stick.element.hasPointerCapture(pointer))
			stick.element.releasePointerCapture(pointer);
	}
	function clear() {
		for (const stick of sticks) release(stick);
	}
	function refresh() {
		const visible =
			mode === 'on' ||
			(mode === 'auto' &&
				!usingGamepad &&
				(touched || navigator.maxTouchPoints > 0 || coarse.matches));
		if (!visible) clear();
		const changed = overlay.hidden === visible;
		overlay.hidden = !visible;
		root.classList.toggle('touch-enabled', visible);
		modeSelect.value = mode;
		if (changed) actions.changed();
	}
	for (const stick of sticks) {
		const move = (event: PointerEvent) => {
			if (event.pointerId !== stick.pointer) return;
			const bounds = stick.element.getBoundingClientRect();
			const radius = Math.min(bounds.width, bounds.height) * 0.32;
			const dx = event.clientX - (bounds.left + bounds.width / 2);
			const dy = event.clientY - (bounds.top + bounds.height / 2);
			const length = Math.max(radius, Math.hypot(dx, dy));
			stick.x = stickAxis(dx / length);
			stick.y = stickAxis(dy / length);
			stick.element.style.setProperty(
				'--stick-x',
				(dx / length) * radius + 'px',
			);
			stick.element.style.setProperty(
				'--stick-y',
				(dy / length) * radius + 'px',
			);
		};
		stick.element.addEventListener(
			'pointerdown',
			(event) => {
				if (
					actions.isPaused() ||
					overlay.hidden ||
					stick.pointer !== null ||
					event.button !== 0
				)
					return;
				event.preventDefault();
				actions.unlockAudio();
				stick.pointer = event.pointerId;
				stick.element.setPointerCapture(event.pointerId);
				stick.element.classList.add('held');
				move(event);
			},
			options,
		);
		stick.element.addEventListener('pointermove', move, options);
		for (const name of [
			'pointerup',
			'pointercancel',
			'lostpointercapture',
		] as const) {
			stick.element.addEventListener(
				name,
				(event) => {
					if (event.pointerId === stick.pointer) release(stick);
				},
				options,
			);
		}
		stick.element.addEventListener(
			'contextmenu',
			(event) => event.preventDefault(),
			options,
		);
	}
	const bindings = Array.from(
		overlay.querySelectorAll<HTMLButtonElement>('[data-touch-action]'),
	).map((button) => ({
		button,
		source: requireElement(
			'#' + button.dataset.touchAction,
			HTMLButtonElement,
			root,
		),
	}));
	for (const { button, source } of bindings) {
		const activate = () => {
			if (!actions.isPaused()) {
				actions.unlockAudio();
				source.click();
			}
		};
		button.addEventListener(
			'pointerdown',
			(event) => {
				if (event.pointerType !== 'touch' || button.disabled) return;
				event.preventDefault();
				activate();
			},
			options,
		);
		button.addEventListener(
			'click',
			(event) => {
				if (event instanceof PointerEvent && event.pointerType === 'touch')
					return;
				activate();
			},
			options,
		);
	}
	modeSelect.addEventListener(
		'change',
		() => {
			const value = modeSelect.value;
			if (value !== 'auto' && value !== 'on' && value !== 'off') return;
			mode = value;
			try {
				localStorage.setItem(storageKey, mode);
			} catch {
				/* Keep the session preference. */
			}
			refresh();
		},
		options,
	);
	window.addEventListener(
		'pointerdown',
		(event) => {
			if (event.pointerType !== 'touch') return;
			touched = true;
			usingGamepad = false;
			refresh();
		},
		{ ...options, capture: true },
	);
	window.addEventListener('blur', clear, options);
	document.addEventListener(
		'visibilitychange',
		() => {
			if (document.hidden) clear();
		},
		options,
	);
	window.addEventListener(
		'resize',
		() => {
			const held = sticks.some((stick) => stick.pointer !== null);
			clear();
			if (held) actions.pause();
		},
		options,
	);
	coarse.addEventListener('change', refresh, options);
	refresh();
	return {
		get turn() {
			return -sticks[0].x;
		},
		get move() {
			return -sticks[0].y;
		},
		clear,
		useGamepad() {
			if (!usingGamepad) {
				usingGamepad = true;
				refresh();
			}
		},
		sync() {
			for (const { button, source } of bindings) {
				button.disabled = source.disabled;
				button.setAttribute(
					'aria-label',
					source.getAttribute('aria-label') ?? source.textContent ?? '',
				);
				button.title = source.getAttribute('aria-label') ?? '';
				const pressed = source.getAttribute('aria-pressed');
				if (pressed !== null) button.setAttribute('aria-pressed', pressed);
			}
			modeSelect.value = mode;
		},
		dispose() {
			clear();
			events.abort();
			root.classList.remove('touch-enabled');
		},
	};
}
