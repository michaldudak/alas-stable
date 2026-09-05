import { MAX_FRAME_DELTA } from '../game/tuning.ts';
import { disposeScene } from '../rendering/resources.ts';
import { createCameraController } from '../rendering/camera.ts';
import { createMinimap } from '../ui/minimap.ts';
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
	app.innerHTML = shell;
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
	const world = createWorld(scene),
		horse = createHorse();
	scene.add(horse.root);
	const preview = createHorsePreview(
		requireElement('#horse-preview', HTMLCanvasElement),
		horse,
	);
	const horseAnimation = createHorseAnimation(horse);
	const state = createState(),
		audio = new Soundscape();
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
	];
	function focusGame() {
		canvas.focus({ preventScroll: true });
	}
	function showDialog(dialog: HTMLDialogElement) {
		input.clear();
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
	function hint(title: string, subtitle: string, duration = 4) {
		requireElement('#hint strong', HTMLElement).textContent = title;
		requireElement('#hint p', HTMLElement).textContent = subtitle;
		hintUntil = elapsed + duration;
		$('hint').classList.remove('hidden');
	}
	function updateGait() {
		$('gait').textContent = GAITS[state.gait];
		document
			.querySelectorAll('.gait-steps b')
			.forEach((bar, i) => bar.classList.toggle('on', i <= state.gait));
		requireElement('#slower', HTMLButtonElement).disabled = state.gait === 0;
		requireElement('#faster', HTMLButtonElement).disabled = state.gait === 3;
	}
	function tempo(delta: number) {
		changeGait(state, delta);
		updateGait();
		if (!started && state.gait) {
			started = true;
			hint(
				'Świetnie! Teraz wybierz swoją drogę.',
				'← → skręcaj · Spacja — skok',
				6,
			);
		}
	}
	function toggleCamera() {
		firstPerson = !firstPerson;
		horse.rider.visible = !firstPerson;
		input.resetLook();
		requireElement('#camera span', HTMLElement).textContent = firstPerson
			? 'Oczami jeźdźca'
			: 'Zza konia';
		$('camera').setAttribute('aria-pressed', String(firstPerson));
		updateCamera(1, true);
	}
	function home() {
		Object.assign(state, createState());
		input.resetLook();
		updateGait();
		updateCamera(1, true);
		focusGame();
		hint('Z powrotem przy stajni', 'Dokąd teraz pojedziemy?');
	}
	$('faster').onclick = () => {
		tempo(1);
		focusGame();
	};
	$('slower').onclick = () => {
		tempo(-1);
		focusGame();
	};
	$('jump').onclick = () => {
		requestJump(state);
		focusGame();
	};
	$('camera').onclick = () => {
		toggleCamera();
		focusGame();
	};
	$('home').onclick = home;
	$('pause').onclick = pause;
	$('resume').onclick = () => closeDialog(dialog('pause-dialog'));
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
			`${icon(audio.enabled ? 'volume-2' : 'volume-x')}<span>Dźwięk</span>`;
		$('sound').setAttribute('aria-pressed', String(audio.enabled));
		refreshIcons();
		focusGame();
	};
	$('sound').setAttribute('aria-pressed', 'true');
	$('fullscreen').onclick = async () => {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
		} catch {
			hint('Pełny ekran jest niedostępny', 'Możesz dalej jeździć w tym oknie.');
		}
		focusGame();
	};
	setupAppearancePanel($('swatches'), horse);
	const input = createInput(canvas, {
		isPaused: () => paused,
		unlockAudio: () => {
			void audio.unlock();
		},
		tempo,
		jump: () => requestJump(state),
		toggleCamera,
		pause,
	});
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
		cameraController.update(state, dt, firstPerson, input.look, snap);
	}
	const minimap = createMinimap(
		requireElement('#map', HTMLCanvasElement),
		world,
	);

	updateGait();
	updateCamera(1, true);
	focusGame();
	// Clamp long frames: tab suspension must not teleport the horse through barriers.
	let previousTime = performance.now();
	renderer.setAnimationLoop((time) => {
		const dt = Math.min(
			MAX_FRAME_DELTA,
			Math.max(0, (time - previousTime) / 1000),
		);
		previousTime = time;
		if (!paused) {
			elapsed += dt;
			const turn = input.turn;
			const oldGait = state.gait;
			if (step(state, dt, turn, world.obstacles, world.solids)) {
				audio.tone(170, 0.18, 0.07, 65, 'triangle');
				hint(
					'Poprzeczka zaraz wróci na miejsce',
					'Spróbuj nacisnąć spację przed przeszkodą.',
				);
			}
			if (state.gait !== oldGait) updateGait();
			horse.root.position.set(state.x, state.height, state.z);
			horse.root.rotation.y = state.heading;
			const footfalls = horseAnimation.update(dt, state, elapsed, turn);
			for (const obstacle of world.obstacles) {
				obstacle.rails.rotation.x = obstacle.down ? 1.4 : 0;
				obstacle.rails.position.y = obstacle.down ? -0.28 : 0;
			}
			input.update(dt);
			updateCamera(dt);
			audio.tick(dt, state, isSand(state.x, state.z), footfalls);
			$('location').textContent = locationName(state.x, state.z);
			$('hint').classList.toggle('hidden', elapsed > hintUntil);
		}
		world.stable.update(elapsed);
		minimap.draw(state);
		renderer.render(scene, camera);
		if (dialog('dress-dialog').open) preview.render();
	});
	// A read-only snapshot helps repeatable browser checks without altering gameplay.
	if (import.meta.env.DEV)
		window.__polana = {
			snapshot: () => ({
				...state,
				paused,
				firstPerson,
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
			input.dispose();
			preview.dispose();
			audio.dispose();
			horse.dispose();
			for (const resident of world.stable.horses) resident.dispose();
			disposeScene(scene);
			renderer.dispose();
			delete window.__polana;
			for (const dialog of dialogs) dialog.close();
			app.replaceChildren();
		},
	};
}
