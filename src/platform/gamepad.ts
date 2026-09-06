interface GamepadActions {
	isPaused(): boolean;
	pause(): void;
	resume(): void;
	unlockAudio(): void;
	tempo(delta: number): void;
	jump(): void;
	mount(): void;
	lead(): void;
	toggleCamera(): void;
	appearance(): void;
	settings(): void;
	help(): void;
	status(connected: boolean, vibration: boolean): void;
}

/** Rescale the useful stick range after removing hardware drift. */
export function stickAxis(value = 0) {
	if (!Number.isFinite(value)) return 0;
	return (
		Math.sign(value) * Math.min(1, Math.max(0, (Math.abs(value) - 0.18) / 0.82))
	);
}

export function createGamepad(actions: GamepadActions) {
	let pad: Gamepad | undefined;
	let previous: boolean[] = [];
	let direction = 0;
	let menuNavigationReady = false;
	let repeatAt = 0;
	let clock = 0;
	let rumbleUntil = 0;
	let rumbleStrength = 0;
	let failedActuator = false;
	let enabled = true;
	let turn = 0;
	let look = 0;
	let move = 0;
	let zoom = 0;
	let suspended = false;
	let lastStatus = '';
	let generation = 0;
	function report() {
		const vibration = !!pad?.vibrationActuator && !failedActuator;
		const status = `${!!pad}:${vibration}`;
		if (status !== lastStatus) {
			lastStatus = status;
			actions.status(!!pad, vibration);
		}
	}
	function stop() {
		turn = look = move = zoom = 0;
		rumbleUntil = 0;
		try {
			void pad?.vibrationActuator?.reset().catch(() => {});
		} catch {
			// Controllers can disappear between polling and resetting the actuator.
		}
	}
	function pulse(strength: number, duration: number) {
		const actuator = pad?.vibrationActuator;
		if (!enabled || !actuator || failedActuator || suspended) return;
		if (clock < rumbleUntil && strength <= rumbleStrength) return;
		rumbleUntil = clock + duration / 1000;
		rumbleStrength = strength;
		const activeGeneration = generation;
		const fail = () => {
			if (generation !== activeGeneration) return;
			failedActuator = true;
			report();
		};
		try {
			void actuator
				.playEffect('dual-rumble', {
					startDelay: 0,
					duration,
					strongMagnitude: strength,
					weakMagnitude: strength * 0.65,
				})
				.catch(fail);
		} catch {
			fail();
		}
	}
	function navigate(delta: number, horizontal: boolean) {
		document.documentElement.classList.add('gamepad-active');
		const dialog = document.querySelector('dialog[open]');
		if (!dialog) return;
		const active = document.activeElement;
		if (horizontal && active instanceof HTMLSelectElement) {
			active.selectedIndex =
				(active.selectedIndex + delta + active.options.length) %
				active.options.length;
			active.dispatchEvent(new Event('change', { bubbles: true }));
			return;
		}
		const controls = Array.from(
			dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), select:not(:disabled)',
			),
		).filter((element) => element.getClientRects().length > 0);
		if (!controls.length) return;
		const index = controls.indexOf(active as HTMLElement);
		const next =
			controls[
				index < 0 ? 0 : (index + delta + controls.length) % controls.length
			];
		next.focus();
		next.scrollIntoView({ block: 'nearest' });
	}
	return {
		get turn() {
			return turn;
		},
		get look() {
			return look;
		},
		get move() {
			return move;
		},
		get zoom() {
			return zoom;
		},
		pulse,
		stop,
		setEnabled(value: boolean) {
			enabled = value;
			if (!enabled) stop();
		},
		update(dt: number) {
			clock += dt;
			let pads: (Gamepad | null)[] = [];
			try {
				pads = Array.from(navigator.getGamepads?.() ?? []);
			} catch {
				/* Optional browser capability. */
			}
			const next =
				pads.find(
					(candidate) =>
						candidate?.connected &&
						candidate.mapping === 'standard' &&
						candidate.index === pad?.index,
				) ??
				pads.find(
					(candidate) =>
						candidate?.connected && candidate.mapping === 'standard',
				);
			if (next?.index !== pad?.index || next?.id !== pad?.id) {
				const disconnected = !!pad;
				stop();
				pad = next ?? undefined;
				generation++;
				previous = [];
				direction = 0;
				failedActuator = false;
				if (disconnected) actions.pause();
			} else pad = next ?? undefined;
			report();
			if (!pad) return;
			const buttons = pad.buttons.map((button) => button.pressed);
			if (document.hidden || !document.hasFocus()) {
				if (!suspended) stop();
				suspended = true;
				previous = buttons;
				return;
			}
			if (suspended) {
				previous = buttons;
				suspended = false;
			}
			const pressed = (index: number) => !!buttons[index] && !previous[index];
			const anyPress = buttons.some(
				(value, index) => value && !previous[index],
			);
			if (anyPress) {
				document.documentElement.classList.add('gamepad-active');
				actions.unlockAudio();
			}
			// Snapshot before dispatch: opening dialogs clears other input state.
			const edges = buttons.map((_, index) => pressed(index));
			previous = buttons;
			turn = look = move = zoom = 0;
			if (actions.isPaused()) {
				if (edges[1] || edges[9]) {
					actions.resume();
					return;
				}
				const horizontal =
					!!buttons[14] || !!buttons[15] || Math.abs(pad.axes[0] ?? 0) > 0.55;
				const axis = horizontal ? pad.axes[0] : pad.axes[1];
				const nextDirection =
					buttons[12] || buttons[14]
						? -1
						: buttons[13] || buttons[15]
							? 1
							: Math.abs(axis ?? 0) > 0.55
								? Math.sign(axis!)
								: 0;
				if (!nextDirection) menuNavigationReady = true;
				if (
					menuNavigationReady &&
					nextDirection &&
					(nextDirection !== direction || clock >= repeatAt)
				) {
					navigate(nextDirection, horizontal);
					repeatAt = clock + (nextDirection === direction ? 0.16 : 0.4);
				}
				direction = nextDirection;
				if (edges[0]) {
					const active = document.activeElement;
					if (active instanceof HTMLSelectElement) navigate(1, true);
					else if (
						active instanceof HTMLButtonElement &&
						active.closest('dialog[open]')
					)
						active.click();
				}
				return;
			}
			direction = 0;
			menuNavigationReady = false;
			if (edges[9]) {
				actions.pause();
				return;
			}
			if (edges[8]) {
				actions.help();
				return;
			}
			if (edges[14]) {
				actions.appearance();
				return;
			}
			if (edges[15]) {
				actions.settings();
				return;
			}
			turn = -stickAxis(pad.axes[0]);
			look = -stickAxis(pad.axes[2]);
			move = -stickAxis(pad.axes[1]);
			zoom = stickAxis(pad.axes[3]);
			if (edges[4] || edges[13]) actions.tempo(-1);
			if (edges[5] || edges[12]) actions.tempo(1);
			if (edges[0]) actions.jump();
			if (edges[1]) actions.mount();
			if (edges[2]) actions.lead();
			if (edges[3]) actions.toggleCamera();
		},
		dispose() {
			stop();
			generation++;
			pad = undefined;
			document.documentElement.classList.remove('gamepad-active');
		},
	};
}
