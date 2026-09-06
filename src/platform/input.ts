interface InputActions {
	isPaused(): boolean;
	unlockAudio(): void;
	tempo(delta: number): void;
	jump(): void;
	mount(): void;
	lead(): void;
	toggleCamera(): void;
	pause(): void;
}

const GAME_KEYS = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'KeyW',
	'KeyS',
	'KeyA',
	'KeyD',
	'Space',
	'KeyC',
	'KeyE',
	'KeyL',
	'Escape',
]);

/** Keyboard commands fire once; held keys only drive steering. */
export function createInput(canvas: HTMLCanvasElement, actions: InputActions) {
	const events = new AbortController();
	const options = { signal: events.signal };
	const keys = new Set<string>();
	let look = 0,
		dragging = false,
		previousMouse = 0;
	function clear() {
		keys.clear();
		dragging = false;
	}
	window.addEventListener(
		'keydown',
		(event) => {
			actions.unlockAudio();
			if (actions.isPaused()) return;
			if (
				event.target instanceof HTMLElement &&
				event.target.closest(
					'button, input, textarea, select, [contenteditable="true"]',
				)
			)
				return;
			if (!GAME_KEYS.has(event.code)) return;
			event.preventDefault();
			keys.add(event.code);
			if (event.repeat) return;
			if (['ArrowUp', 'KeyW'].includes(event.code)) actions.tempo(1);
			if (['ArrowDown', 'KeyS'].includes(event.code)) actions.tempo(-1);
			if (event.code === 'KeyE') actions.mount();
			if (event.code === 'KeyL') actions.lead();
			if (event.code === 'Space') actions.jump();
			if (event.code === 'KeyC') actions.toggleCamera();
			if (event.code === 'Escape') actions.pause();
		},
		options,
	);
	window.addEventListener(
		'keyup',
		(event) => {
			keys.delete(event.code);
		},
		options,
	);
	window.addEventListener('pointerdown', () => actions.unlockAudio(), options);
	canvas.addEventListener(
		'pointerdown',
		(event) => {
			if (actions.isPaused()) return;
			dragging = true;
			previousMouse = event.clientX;
			canvas.setPointerCapture(event.pointerId);
			canvas.focus({ preventScroll: true });
		},
		options,
	);
	canvas.addEventListener(
		'pointermove',
		(event) => {
			if (!dragging) return;
			look = Math.max(
				-2.6,
				Math.min(2.6, look - (event.clientX - previousMouse) * 0.006),
			);
			previousMouse = event.clientX;
		},
		options,
	);
	for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
		canvas.addEventListener(
			event,
			() => {
				dragging = false;
			},
			options,
		);
	window.addEventListener(
		'blur',
		() => {
			clear();
			actions.pause();
		},
		options,
	);
	document.addEventListener(
		'visibilitychange',
		() => {
			if (document.hidden) {
				clear();
				actions.pause();
			}
		},
		options,
	);
	return {
		get turn() {
			return (
				Number(keys.has('ArrowLeft') || keys.has('KeyA')) -
				Number(keys.has('ArrowRight') || keys.has('KeyD'))
			);
		},
		get look() {
			return look;
		},
		update(dt: number, stickLook = 0) {
			if (stickLook)
				look = Math.max(-2.6, Math.min(2.6, look + stickLook * dt * 2.8));
			else if (!dragging) look *= Math.exp(-dt * 2.5);
		},
		resetLook() {
			look = 0;
		},
		clear,
		dispose() {
			clear();
			events.abort();
		},
	};
}
