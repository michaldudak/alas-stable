import {
	t,
	initializeLanguage,
	bindTranslations,
	getLanguage,
	setLanguage,
	onLanguageChange,
	type MessageKey,
	type Parameters,
} from '../i18n/index.ts';
import { stepLedHorse, leadPathClear, LEAD_LENGTH } from '../game/leading.ts';
import { createLeadRope } from '../rendering/lead-rope.ts';
import { horseBarrier, nearbyMount } from '../game/herd.ts';
import { createAppearanceStore } from '../platform/appearance-storage.ts';
import { createWalkingRider } from '../horse/walking-rider.ts';
import { mountSide, stepPerson, MOUNT_DURATION } from '../game/riding.ts';
import { MAX_FRAME_DELTA, STICK_PACE_ADJUSTMENT } from '../game/tuning.ts';
import { disposeScene } from '../rendering/resources.ts';
import { createCameraController } from '../rendering/camera.ts';
import { createMinimap } from '../ui/minimap.ts';
import { createGamepad } from '../platform/gamepad.ts';
import { createTouchControls } from '../platform/touch.ts';
import { createInput } from '../platform/input.ts';
import { requireElement } from '../platform/dom.ts';
import * as THREE from 'three';
import { icon, refreshIcons } from '../ui/icons.ts';
import shell from '../ui/shell.html?raw';
import { createWorld } from '../world/world.ts';
import { createHorse } from '../horse/model.ts';
import { createHorsePreview } from '../ui/horse-preview.ts';
import { setupAppearancePanel } from '../ui/appearance-panel.ts';
import {
	createState,
	changeGait,
	requestJump,
	step,
	GAITS,
} from '../game/physics.ts';
import { Soundscape } from '../platform/audio.ts';
import { createHorseAnimation } from '../horse/animation.ts';
import { locationName, isSand } from '../world/locations.ts';

export function startGame() {
	const events = new AbortController();
	const app = requireElement('#app', HTMLElement);
	initializeLanguage();
	app.innerHTML = shell;
	const refreshShell = bindTranslations(app);
	refreshIcons();
	const canvas = requireElement('#game', HTMLCanvasElement);
	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	} catch (error) {
		requireElement('#error', HTMLElement).hidden = false;
		throw error;
	}
	renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
	renderer.setSize(innerWidth, innerHeight);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	const scene = new THREE.Scene(),
		camera = new THREE.PerspectiveCamera(
			52,
			innerWidth / innerHeight,
			0.1,
			350,
		);
	const world = createWorld(scene);
	const raven = createHorse();
	raven.root.name = 'Raven';
	scene.add(raven.root);
	const herd = [raven, ...world.stable.horses].map((model) => {
		scene.attach(model.root);
		const state =
			model === raven
				? createState()
				: {
						...createState(),
						x: model.root.position.x,
						z: model.root.position.z,
						heading: model.root.rotation.y,
					};
		const store = createAppearanceStore(
			undefined,
			model === raven
				? 'polana-appearance'
				: 'polana-appearance-' + model.root.name,
			model === raven ? {} : model.getAppearance(),
		);
		model.setAppearance(store.load());
		return {
			model,
			state,
			store,
			name: model.root.name,
			animation: createHorseAnimation(model),
		};
	});
	let selected = herd[0];
	let horse = selected.model,
		state = selected.state,
		horseAnimation = selected.animation;
	let preview = createHorsePreview(
		requireElement('#horse-preview', HTMLCanvasElement),
		horse,
	);
	const audio = new Soundscape();
	const otherHorseSolids = () =>
		herd.filter((h) => h !== selected).map((h) => horseBarrier(h.state));
	function selectHorse(next: typeof selected) {
		next.model.tack.visible = true;
		if (selected === next) return;
		horse.rider.visible = false;
		selected = next;
		horse = next.model;
		state = next.state;
		horseAnimation = next.animation;
		preview.dispose();
		preview = createHorsePreview(
			requireElement('#horse-preview', HTMLCanvasElement),
			horse,
		);
		setupAppearancePanel(
			$('swatches'),
			horse,
			selected.store,
			horse.getAppearance(),
		);
		requireElement('#dress-dialog h2', HTMLElement).textContent = selected.name;
		$('preview-rider').setAttribute('aria-pressed', 'false');
	}
	const person = createState();
	const walker = createWalkingRider(horse.rider);
	scene.add(walker.root);
	const rope = createLeadRope(scene);
	let leading = false;
	let leadBlocked = false;
	let riding: 'mounted' | 'on-foot' | 'mounting' | 'dismounting' = 'mounted';
	let transferTime = 0;
	let footstepTimer = 0;
	let transferSide = { side: -1, x: 0, z: 0 };
	let approach = { x: 0, z: 0, heading: 0 };
	const activeState = () => (riding === 'mounted' ? state : person);
	const transferring = () => riding === 'mounting' || riding === 'dismounting';
	let firstPerson = false,
		paused = false,
		elapsed = 0,
		hintUntil = 9,
		started = false;
	const $ = (id: string) => requireElement(`#${id}`, HTMLElement);
	const dialog = (id: string) => requireElement(`#${id}`, HTMLDialogElement);
	const dialogs = [
		dialog('pause-dialog'),
		dialog('help-dialog'),
		dialog('dress-dialog'),
		dialog('settings-dialog'),
	];
	function focusGame() {
		canvas.focus({ preventScroll: true });
	}
	function showDialog(dialog: HTMLDialogElement) {
		input.clear();
		gamepad.stop();
		touch.clear();
		paused = true;
		dialog.showModal();
	}
	function closeDialog(dialog: HTMLDialogElement) {
		dialog.close();
		paused = false;
		focusGame();
	}
	for (const dialog of dialogs)
		dialog.addEventListener('cancel', (event) => {
			event.preventDefault();
			closeDialog(dialog);
		});
	function pause() {
		if (!dialogs.some((d) => d.open)) showDialog(dialog('pause-dialog'));
	}
	let currentHint: {
		title: MessageKey;
		subtitle: MessageKey;
		parameters: Parameters;
	} = { title: 'hint.startTitle', subtitle: 'hint.startBody', parameters: {} };
	function renderHint() {
		requireElement('#hint strong', HTMLElement).textContent = t(
			currentHint.title,
			currentHint.parameters,
		);
		requireElement('#hint p', HTMLElement).textContent = t(
			currentHint.subtitle === 'hint.startBody' &&
				app.classList.contains('touch-enabled')
				? 'touch.startBody'
				: currentHint.subtitle,
			currentHint.parameters,
		);
	}
	function hint(
		title: MessageKey,
		subtitle: MessageKey,
		duration = 4,
		parameters: Parameters = {},
	) {
		currentHint = { title, subtitle, parameters };
		renderHint();
		hintUntil = elapsed + duration;
		$('hint').classList.remove('hidden');
	}
	function updateGait() {
		const leadLabel = leading
			? t('action.releaseLead')
			: t('action.attachLead');
		requireElement('#lead span', HTMLElement).textContent = leadLabel;
		$('lead').setAttribute('aria-label', leadLabel);
		$('lead').setAttribute('aria-pressed', String(leading));
		$('lead').title = leadLabel + ' (L)';
		requireElement('#lead', HTMLButtonElement).disabled = riding !== 'on-foot';
		const active = activeState();
		requireElement('#camera span', HTMLElement).textContent = firstPerson
			? t('camera.firstPerson')
			: riding === 'mounted'
				? t('camera.horse')
				: t('camera.rider');
		const cameraLabel = requireElement(
			'#camera span',
			HTMLElement,
		).textContent!;
		$('camera').setAttribute('aria-label', cameraLabel);
		$('camera').title = cameraLabel + ' (C)';
		$('gait').textContent =
			riding === 'mounted'
				? state.gait === -1
					? t('gait.reverse')
					: t(GAITS[state.gait])
				: active.gait === -1
					? t('gait.reverse')
					: t(
							(['gait.stand', 'gait.personWalk', 'gait.run'] as const)[
								active.gait
							],
						);
		const label =
			riding === 'mounted' ? t('action.dismount') : t('action.mount');
		requireElement('#mount span', HTMLElement).textContent = label;
		$('mount').setAttribute('aria-label', label);
		$('mount').title = label + ' (E)';
		requireElement('#mount', HTMLButtonElement).disabled = transferring();
		requireElement('#jump', HTMLButtonElement).disabled = riding !== 'mounted';
		document
			.querySelectorAll('.gait-steps b')
			.forEach((bar, i) => bar.classList.toggle('on', i <= active.gait));
		requireElement('#slower', HTMLButtonElement).disabled =
			transferring() || active.gait === -1;
		requireElement('#faster', HTMLButtonElement).disabled =
			transferring() || active.gait === (riding === 'mounted' ? 3 : 2);
		touch.sync();
	}
	function tempo(delta: number) {
		if (transferring()) return;
		if (riding === 'mounted') changeGait(state, delta);
		else person.gait = THREE.MathUtils.clamp(person.gait + delta, -1, 2);
		updateGait();
		if (!started && riding === 'mounted' && state.gait) {
			started = true;
			hint('hint.startedTitle', 'hint.startedBody', 6);
		}
	}
	function toggleCamera() {
		firstPerson = !firstPerson;
		horse.rider.visible = !firstPerson && riding === 'mounted';
		walker.root.visible = !firstPerson && riding !== 'mounted';
		input.resetLook();
		requireElement('#camera span', HTMLElement).textContent = firstPerson
			? t('camera.firstPerson')
			: riding === 'mounted'
				? t('camera.horse')
				: t('camera.rider');
		$('camera').setAttribute('aria-pressed', String(firstPerson));
		updateGait();
		updateCamera(1, true);
	}
	function jump() {
		if (riding === 'mounted') requestJump(state);
	}
	function releaseLead() {
		if (!leading) return;
		leading = false;
		leadBlocked = false;
		state.gait = 0;
		state.speed = 0;
	}
	function lead() {
		if (riding !== 'on-foot') return;
		if (leading) {
			releaseLead();
			updateGait();
			hint('hint.released', 'hint.waiting', 4, { name: selected.name });
			return;
		}
		const target = nearbyMount(herd, person, world.solids);
		if (!target) {
			hint('hint.approach', 'hint.attach');
			return;
		}
		selectHorse(target.horse);
		leading = true;
		state.gait = 0;
		state.speed = 0;
		updateGait();
		hint('hint.leading', 'hint.follow', 4, { name: selected.name });
	}
	function mount() {
		if (transferring()) return;
		if (
			riding === 'mounted' &&
			(state.gait !== 0 || Math.abs(state.speed) > 0.12 || state.jump >= 0)
		) {
			hint('hint.stopTitle', 'hint.stopBody');
			return;
		}
		if (riding === 'on-foot') {
			const target = nearbyMount(herd, person, world.solids);
			if (!target) {
				hint('hint.approach', 'hint.chooseHorse');
				return;
			}
			releaseLead();
			selectHorse(target.horse);
		}
		const side = mountSide(
			state,
			[...world.solids, ...otherHorseSolids()],
			riding === 'on-foot' ? person : undefined,
		);
		if (!side) {
			hint('hint.spaceTitle', 'hint.spaceBody');
			return;
		}
		releaseLead();
		state.gait = 0;
		state.speed = 0;
		transferSide = side;
		transferTime = 0;
		approach = { x: person.x, z: person.z, heading: person.heading };
		person.gait = 0;
		person.speed = 0;
		person.jump = -1;
		person.height = 0;
		riding = riding === 'mounted' ? 'dismounting' : 'mounting';
		horse.rider.visible = false;
		walker.root.visible = !firstPerson;
		input.clear();
		updateGait();
	}
	function updateTransfer(dt: number) {
		transferTime += dt;
		const t = Math.min(1, transferTime / MOUNT_DURATION);
		const ease = (v: number) => {
			v = THREE.MathUtils.clamp(v, 0, 1);
			return v * v * (3 - 2 * v);
		};
		if (riding === 'mounting' && t < 0.25) {
			const p = ease(t / 0.25);
			person.x = THREE.MathUtils.lerp(approach.x, transferSide.x, p);
			person.z = THREE.MathUtils.lerp(approach.z, transferSide.z, p);
			person.height = 0;
			person.heading =
				approach.heading +
				Math.atan2(
					Math.sin(state.heading - approach.heading),
					Math.cos(state.heading - approach.heading),
				) *
					p;
			walker.pose(dt, 1.8);
		} else {
			const u = riding === 'mounting' ? 1 - (t - 0.25) / 0.75 : t;
			const across = ease(u / 0.8);
			person.x = THREE.MathUtils.lerp(state.x, transferSide.x, across);
			person.z = THREE.MathUtils.lerp(state.z, transferSide.z, across);
			person.heading = state.heading;
			person.height =
				(horse.getAppearance().equipment === 'bareback' ? 1.32 : 1.4) *
					(1 - ease((u - 0.15) / 0.85)) +
				0.18 * Math.sin(Math.PI * u);
			walker.pose(dt, 0, 1 - ease(u), Math.sin(Math.PI * u), transferSide.side);
		}
		if (t >= 1) {
			riding = riding === 'mounting' ? 'mounted' : 'on-foot';
			person.height = 0;
			horse.rider.visible = !firstPerson && riding === 'mounted';
			walker.root.visible = !firstPerson && riding === 'on-foot';
			updateGait();
			hint(
				riding === 'mounted' ? 'hint.mounted' : 'hint.walkTitle',
				riding === 'mounted' ? 'hint.mountedBody' : 'hint.walkBody',
				4,
				{ name: selected.name },
			);
		}
	}
	function home() {
		releaseLead();
		riding = 'mounted';
		walker.root.visible = false;
		horse.rider.visible = !firstPerson;
		const spawn = createState();
		// Keep the return shortcut clear of horses already waiting at the entrance.
		const barriers = [...world.solids, ...otherHorseSolids()];
		for (const offset of [0, 4, -4, 8, -8, 12, -12, 16, -16]) {
			spawn.x = offset;
			if (
				!barriers.some(
					(b) =>
						Math.abs(spawn.x - b.x) < b.w / 2 + 0.8 &&
						Math.abs(spawn.z - b.z) < b.d / 2 + 0.8,
				)
			)
				break;
		}
		Object.assign(state, spawn);
		input.resetLook();
		updateGait();
		updateCamera(1, true);
		focusGame();
		hint('hint.homeTitle', 'hint.homeBody');
	}
	$('faster').onclick = () => {
		tempo(1);
		focusGame();
	};
	$('slower').onclick = () => {
		tempo(-1);
		focusGame();
	};
	$('lead').onclick = () => {
		lead();
		focusGame();
	};
	$('mount').onclick = () => {
		mount();
		focusGame();
	};
	$('jump').onclick = () => {
		jump();
		focusGame();
	};
	$('camera').onclick = () => {
		toggleCamera();
		focusGame();
	};
	$('home').onclick = home;
	$('pause').onclick = pause;
	$('resume').onclick = () => closeDialog(dialog('pause-dialog'));
	$('settings').onclick = () => showDialog(dialog('settings-dialog'));
	$('close-settings').onclick = () => closeDialog(dialog('settings-dialog'));
	const languageSelect = requireElement('#language', HTMLSelectElement);
	languageSelect.value = getLanguage();
	languageSelect.onchange = () => {
		if (languageSelect.value === 'en' || languageSelect.value === 'pl')
			setLanguage(languageSelect.value);
	};
	$('help').onclick = () => showDialog(dialog('help-dialog'));
	for (const id of ['close-help', 'help-play'])
		$(id).onclick = () => closeDialog(dialog('help-dialog'));
	$('wardrobe').onclick = () => showDialog(dialog('dress-dialog'));
	$('preview-left').onclick = () => preview.rotate(-1);
	$('preview-right').onclick = () => preview.rotate(1);
	$('preview-in').onclick = () => preview.zoom(1);
	$('preview-out').onclick = () => preview.zoom(-1);
	$('preview-reset').onclick = () => preview.reset();
	$('preview-rider').onclick = () =>
		$('preview-rider').setAttribute(
			'aria-pressed',
			String(preview.toggleRider()),
		);
	for (const id of ['close-dress', 'dress-play'])
		$(id).onclick = () => closeDialog(dialog('dress-dialog'));
	$('sound').onclick = () => {
		audio.enabled = !audio.enabled;
		$('sound').innerHTML =
			`${icon(audio.enabled ? 'volume-2' : 'volume-x')}<span>${t('action.sound')}</span>`;
		$('sound').setAttribute('aria-pressed', String(audio.enabled));
		refreshIcons();
		focusGame();
	};
	$('sound').setAttribute('aria-pressed', 'true');
	const fullscreenButtons = [
		'fullscreen',
		'pause-fullscreen',
		'settings-fullscreen',
	];
	const fullscreenStatuses = [
		'pause-fullscreen-status',
		'settings-fullscreen-status',
	];
	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
			for (const id of fullscreenStatuses) $(id).hidden = true;
		} catch {
			hint('hint.fullscreenTitle', 'hint.fullscreenBody');
			for (const id of fullscreenStatuses) {
				$(id).textContent = t('controller.fullscreenHelp');
				$(id).hidden = false;
			}
		}
		if (!paused) focusGame();
	}
	for (const id of fullscreenButtons)
		$(id).onclick = () => {
			void toggleFullscreen();
		};
	const syncFullscreen = () => {
		for (const id of fullscreenButtons)
			$(id).setAttribute('aria-pressed', String(!!document.fullscreenElement));
	};
	document.addEventListener('fullscreenchange', syncFullscreen, {
		signal: events.signal,
	});
	syncFullscreen();
	setupAppearancePanel(
		$('swatches'),
		horse,
		selected.store,
		horse.getAppearance(),
	);
	const input = createInput(canvas, {
		isPaused: () => paused,
		unlockAudio: () => {
			void audio.unlock();
		},
		tempo,
		jump,
		mount,
		lead,
		toggleCamera,
		pause,
	});

	const touch = createTouchControls(app, {
		changed: renderHint,
		isPaused: () => paused,
		pause,
		unlockAudio: () => {
			void audio.unlock();
		},
	});
	$('touch-menu').onclick = pause;
	$('pause-sound').onclick = () => $('sound').click();
	let controllerConnected = false;
	let controllerVibration = false;
	const renderControllerStatus = () => {
		$('controller-status').textContent = t(
			!controllerConnected
				? 'controller.disconnected'
				: controllerVibration
					? 'controller.ready'
					: 'controller.noVibration',
		);
	};
	const gamepad = createGamepad({
		isPaused: () => paused,
		pause,
		resume: () => {
			const open = dialogs.find((entry) => entry.open);
			if (open) closeDialog(open);
		},
		unlockAudio: () => {
			void audio.unlock();
		},
		tempo,
		jump,
		mount,
		lead,
		toggleCamera,
		fullscreen: () => {
			void toggleFullscreen();
		},
		appearance: () => showDialog(dialog('dress-dialog')),
		settings: () => showDialog(dialog('settings-dialog')),
		help: () => showDialog(dialog('help-dialog')),
		activity: () => touch.useGamepad(),
		status: (connected, vibration) => {
			controllerConnected = connected;
			controllerVibration = vibration;
			renderControllerStatus();
		},
	});
	const vibrationToggle = requireElement(
		'#controller-vibration',
		HTMLButtonElement,
	);
	vibrationToggle.onclick = () => {
		const enabled = vibrationToggle.getAttribute('aria-pressed') !== 'true';
		vibrationToggle.setAttribute('aria-pressed', String(enabled));
		gamepad.setEnabled(enabled);
	};
	$('controller-test').onclick = () => gamepad.pulse(0.6, 250);
	for (const [id, target] of [
		['pause-settings', 'settings-dialog'],
		['pause-help', 'help-dialog'],
		['pause-appearance', 'dress-dialog'],
	] as const) {
		$(id).onclick = () => {
			closeDialog(dialog('pause-dialog'));
			showDialog(dialog(target));
		};
	}
	$('pause-home').onclick = () => {
		closeDialog(dialog('pause-dialog'));
		home();
	};
	for (const event of ['keydown', 'pointerdown'])
		window.addEventListener(
			event,
			() => document.documentElement.classList.remove('gamepad-active'),
			{ signal: events.signal },
		);
	window.addEventListener(
		'resize',
		() => {
			renderer.setSize(innerWidth, innerHeight);
			camera.aspect = innerWidth / innerHeight;
			camera.updateProjectionMatrix();
		},
		{ signal: events.signal },
	);
	const cameraController = createCameraController(
		camera,
		world.stable.cameraBlockers,
	);
	function updateCamera(dt: number, snap = false) {
		cameraController.update(
			activeState(),
			dt,
			firstPerson,
			input.look,
			snap,
			riding !== 'mounted',
			leading,
		);
	}
	const minimap = createMinimap(
		requireElement('#map', HTMLCanvasElement),
		world,
	);

	const unsubscribeLanguage = onLanguageChange(() => {
		refreshShell();
		renderControllerStatus();
		languageSelect.value = getLanguage();
		updateGait();
		renderHint();
		$('location').textContent = t(
			locationName(activeState().x, activeState().z),
		);
		requireElement('#sound span', HTMLElement).textContent = t('action.sound');
		setupAppearancePanel(
			$('swatches'),
			horse,
			selected.store,
			horse.getAppearance(),
		);
	});
	updateGait();
	updateCamera(1, true);
	focusGame();
	// Clamp long frames: tab suspension must not teleport the horse through barriers.
	let previousTime = performance.now();
	let wasNudging = false;
	renderer.setAnimationLoop((time) => {
		const dt = Math.min(
			MAX_FRAME_DELTA,
			Math.max(0, (time - previousTime) / 1000),
		);
		previousTime = time;
		gamepad.update(dt);
		if (!paused) {
			elapsed += dt;
			const turn = THREE.MathUtils.clamp(
				input.turn + gamepad.turn + touch.turn,
				-1,
				1,
			);
			const move = THREE.MathUtils.clamp(gamepad.move + touch.move, -1, 1);
			const nudge =
				!transferring() &&
				(move !== 0 || (wasNudging && activeState().gait === 0))
					? move
					: undefined;
			wasNudging = !transferring() && move !== 0;
			if (!firstPerson) cameraController.adjustDistance(gamepad.zoom, dt);
			const wasJumping = state.jump >= 0;
			const oldGait = activeState().gait;
			if (
				!leading &&
				step(
					state,
					dt,
					riding === 'mounted' ? turn : 0,
					world.obstacles,
					[...world.solids, ...otherHorseSolids()],
					riding === 'mounted' ? nudge : undefined,
				)
			) {
				audio.tone(170, 0.18, 0.07, 65, 'triangle');
				if (riding === 'mounted') gamepad.pulse(0.5, 140);
				hint('hint.railTitle', 'hint.railBody');
			}
			const previousPerson = { ...person };
			if (riding === 'mounted' && wasJumping && state.jump < 0)
				gamepad.pulse(0.4, 120);
			const barriers = [
				...world.solids,
				...otherHorseSolids(),
				...world.obstacles
					.filter((o) => !o.down)
					.map((o) => ({ x: o.x, z: o.z, w: o.width, d: 0.18 })),
			];
			if (riding === 'on-foot')
				stepPerson(person, dt, turn, barriers, state, nudge);
			let leadTurn = 0;
			if (leading) {
				const taut =
					Math.hypot(person.x - state.x, person.z - state.z) > LEAD_LENGTH ||
					!leadPathClear(state, person, barriers);
				if (taut) {
					Object.assign(person, {
						x: previousPerson.x,
						z: previousPerson.z,
						gait: 0,
						speed: 0,
					});
					if (!leadBlocked) hint('hint.waitTitle', 'hint.waitBody');
				}
				leadBlocked = taut;
				leadTurn = stepLedHorse(state, person, dt, barriers);
			}
			if (transferring()) updateTransfer(dt);
			else if (riding === 'on-foot')
				walker.pose(dt, person.speed, 0, 0, -1, leading);
			if (activeState().gait !== oldGait) updateGait();
			walker.root.position.set(person.x, person.height, person.z);
			walker.root.rotation.y = person.heading;
			horse.root.position.set(state.x, state.height, state.z);
			horse.root.rotation.y = state.heading;
			const footfalls = horseAnimation.update(
				dt,
				state,
				elapsed,
				riding === 'mounted' ? turn : leadTurn,
				riding === 'mounted' && state.gait !== 0
					? 1 + (nudge ?? 0) * STICK_PACE_ADJUSTMENT
					: 1,
			);
			if (riding === 'mounted' && footfalls > 0)
				gamepad.pulse(0.08 + Math.abs(state.speed) * 0.012, 35);
			for (const obstacle of world.obstacles) {
				if (leading) obstacle.down = Math.max(0, obstacle.down - dt);
				obstacle.rails.rotation.x = obstacle.down ? 1.4 : 0;
				obstacle.rails.position.y = obstacle.down ? -0.28 : 0;
			}
			input.update(dt, gamepad.look);
			updateCamera(dt);
			const active = activeState();
			if (riding === 'on-foot' && Math.abs(person.speed) > 0.2) {
				footstepTimer -= dt;
				if (footstepTimer <= 0) {
					audio.tone(105, 0.045, 0.018, 45, 'triangle');
					footstepTimer = Math.abs(person.speed) > 2.5 ? 0.23 : 0.36;
				}
			} else footstepTimer = 0;
			audio.tick(
				dt,
				active,
				isSand(active.x, active.z),
				riding === 'mounted' ? footfalls : 0,
			);
			$('location').textContent = t(locationName(active.x, active.z));
			$('hint').classList.toggle('hidden', elapsed > hintUntil);
		}
		for (const entry of herd) {
			const mounted = entry === selected && riding === 'mounted';
			entry.model.halter.visible = !mounted;
			entry.model.bridle.visible = mounted;
		}
		scene.updateMatrixWorld(true);
		rope.update(walker.leadHand, horse.leadAnchor, leading);
		world.stable.update(elapsed, horse);
		minimap.draw(
			activeState(),
			herd
				.filter((h) => riding !== 'mounted' || h !== selected)
				.map((h) => h.state),
		);
		renderer.render(scene, camera);
		if (dialog('dress-dialog').open) preview.render();
	});
	// A read-only snapshot helps repeatable browser checks without altering gameplay.
	if (import.meta.env.DEV)
		window.__polana = {
			snapshot: () => ({
				...activeState(),
				riding,
				activeHorse: selected.name,
				leading,
				horses: herd.map((h) => ({
					name: h.name,
					x: h.state.x,
					z: h.state.z,
					heading: h.state.heading,
					halter: h.model.halter.visible,
					appearance: h.model.getAppearance(),
				})),
				horse: { x: state.x, z: state.z, heading: state.heading },
				paused,
				firstPerson,
				cameraDistanceScale: cameraController.distanceScale,
				cameraLook: input.look,
				obstacles: world.obstacles.map(({ z, down }) => ({ z, down })),
				calls: renderer.info.render.calls,
			}),
		};

	let disposed = false;
	return {
		dispose() {
			if (disposed) return;
			disposed = true;
			renderer.setAnimationLoop(null);
			events.abort();
			unsubscribeLanguage();
			touch.dispose();
			input.dispose();
			gamepad.dispose();
			preview.dispose();
			audio.dispose();
			for (const entry of herd) entry.model.dispose();
			disposeScene(scene);
			renderer.dispose();
			delete window.__polana;
			for (const dialog of dialogs) dialog.close();
			app.replaceChildren();
		},
	};
}
