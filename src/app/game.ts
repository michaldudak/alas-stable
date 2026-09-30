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
import { horseBarrier, nearbyLead, nearbyMount } from '../game/herd.ts';
import { createAppearanceStore } from '../platform/appearance-storage.ts';
import { createWalkingRider } from '../horse/walking-rider.ts';
import {
	APPROACH_SPEED,
	transferFrame,
	mountSide,
	stepPerson,
	MOUNT_DURATION,
} from '../game/riding.ts';
import { MAX_FRAME_DELTA, STICK_PACE_ADJUSTMENT } from '../game/tuning.ts';
import { disposeScene } from '../rendering/resources.ts';
import { createCameraController } from '../rendering/camera.ts';
import { createMinimap } from '../ui/minimap.ts';
import { createGamepad } from '../platform/gamepad.ts';
import { createTouchControls } from '../platform/touch.ts';
import { createInput } from '../platform/input.ts';
import { requireElement } from '../platform/dom.ts';
import { readStoredValue } from '../platform/storage.ts';
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
import { createNameStore } from '../platform/name-storage.ts';
import { normalizeHorseName, suggestName } from '../horse/names.ts';
import { profile } from '../world/roster.ts';
import { createWander, feed, settle, stepWander } from '../game/wander.ts';
import { createHearts } from '../rendering/hearts.ts';
import { createRiders } from './riders.ts';
import { createRacing, type RaceEvent } from './racing.ts';
import { formatTime } from '../game/race.ts';
import {
	carriedPose,
	grabbable,
	holdPose,
	obstacleClear,
	railSolids,
	wingSolids,
} from '../game/obstacles.ts';
import { placeJump, type Jump } from '../world/jumps.ts';
import { createSolidGrid } from '../game/spatial.ts';
import { insideStable, stallAt, stallDoorway } from '../world/stable-layout.ts';
import { PASTURE, inPasture } from '../world/layout.ts';
import { BEACH, PARKING } from '../world/region-layout.ts';
import { REGION_IDS, regionAt, type RegionId } from '../game/regions.ts';
import {
	RIG,
	boardingPath,
	readyToBoard,
	rampApproach,
	rigPoint,
	rigSolids,
	stallPose,
	stepAlong,
	unloadingPath,
	type RigPose,
} from '../game/trailer.ts';
import { drawTravelMap } from '../ui/travel-map.ts';
import type { HeadTarget } from '../horse/animation.ts';
import type { Solid } from '../game/types.ts';

/** How a horse left at a spot may move about: in its stall, the pasture or nearby. */
function waitingPlace(x: number, z: number) {
	const stall = stallAt(x, z);
	if (stall) return { enclosure: stall, range: 3, grassy: true };
	if (inPasture(x, z))
		return {
			enclosure: {
				x: PASTURE.x,
				z: PASTURE.z,
				halfWidth: PASTURE.halfWidth,
				halfDepth: PASTURE.halfDepth,
			},
			range: 14,
			grassy: true,
		};
	if (insideStable(x, z)) return { range: 1.5, grassy: false };
	return { range: 5, grassy: !isSand(x, z) };
}
import {
	createEnvironment,
	isNightHour,
	WEATHERS,
	type Weather,
} from '../game/environment.ts';

/** How level the camera looks in each place: higher to take in the peaks. */
const CAMERA_LIFT: Record<RegionId, number> = {
	home: 0,
	beach: 0.5,
	mountains: 1,
	hippodrome: 0.35,
};

// Horses are built from the sculpted asset: load it before calling startGame().
export { loadHorseAsset } from '../horse/asset.ts';
export { loadRiderAsset } from '../horse/rider-asset.ts';

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
			900,
		);
	const world = createWorld(scene, renderer);
	const raven = createHorse();
	raven.root.name = 'Raven';
	scene.add(raven.root);
	// The player may rename horses; IDs stay fixed for saved data.
	const names = createNameStore();
	const nameOf = (id: string) => names.load(id, profile(id)?.name ?? id);
	const herd = [raven, ...world.horses].map((model) => {
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
				? 'alas-stable-appearance'
				: 'alas-stable-appearance-' + model.root.name,
			model === raven ? {} : model.getAppearance(),
		);
		model.setAppearance(store.load());
		return {
			model,
			state,
			store,
			id: model.root.name,
			name: nameOf(model.root.name),
			animation: createHorseAnimation(model),
			wander: createWander(state, waitingPlace(state.x, state.z)),
			head: { graze: 0, yaw: 0, nod: 0, chew: false } as HeadTarget,
			turn: 0,
			/** Standing in the horse trailer. */
			aboard: false,
			/** Walking into the trailer or backing out of it. */
			boarding: undefined as
				{ path: { x: number; z: number }[]; backwards: boolean } | undefined,
		};
	});
	for (const entry of herd) world.rename(entry.id, entry.name);
	const nameInput = requireElement('#horse-name', HTMLInputElement);
	/** Shows the selected horse's name in the appearance dialog. */
	function renderName() {
		$('dress-title').textContent = selected.name;
		if (document.activeElement !== nameInput) nameInput.value = selected.name;
	}
	function rename(value: string, save: boolean) {
		const fallback = profile(selected.id)?.name ?? selected.id;
		selected.name = normalizeHorseName(value, fallback);
		$('dress-title').textContent = selected.name;
		world.rename(selected.id, selected.name);
		if (save) names.save(selected.id, selected.name);
	}
	/** Leaves a horse to potter about where it stands. */
	const leaveHorse = (entry: (typeof herd)[number]) =>
		settle(
			entry.wander,
			entry.state,
			waitingPlace(entry.state.x, entry.state.z),
		);
	let staticSolids = createSolidGrid(world.solids);
	/** The car and trailer: where they are parked and in which place. */
	let rig: RigPose = { ...PARKING.home };
	world.vehicle.place(rig);
	world.enter('home');
	/** Horses free to be led, mounted or fed: not in the trailer. */
	const free = () => herd.filter((h) => !h.aboard && !h.boarding);
	const passenger = () => herd.find((h) => h.aboard);
	/** Solids that move with the jumps: wings always, rails for walkers. */
	const jumpSolids = (rails: boolean, except?: Jump) =>
		world.obstacles.flatMap((o) =>
			o === except ? [] : [...wingSolids(o), ...(rails ? railSolids(o) : [])],
		);
	const fixedSolids = () => [
		...world.solids,
		...jumpSolids(true, carried?.jump),
		...rigSolids(rig),
	];
	/** The jump the rider is holding, and its angle relative to her heading. */
	let carried: { jump: Jump; turn: number } | undefined;
	const doorways = (horse: { x: number; z: number }) => {
		const doorway = stallDoorway(horse.x, horse.z);
		return doorway ? [doorway] : [];
	};
	const nearby: Solid[] = [];
	const frustum = new THREE.Frustum(),
		viewProjection = new THREE.Matrix4(),
		bounds = new THREE.Sphere();
	let selected = herd[0];
	let horse = selected.model,
		state = selected.state,
		horseAnimation = selected.animation;
	let preview = createHorsePreview(
		requireElement('#horse-preview', HTMLCanvasElement),
		horse,
	);
	const audio = new Soundscape();
	const environment = createEnvironment();
	let skyIcon = '';
	/** Shows the time and an icon for the weather, or the moon at night. */
	function renderSky() {
		const hour = environment.hour;
		const minutes = Math.floor((hour % 1) * 12) * 5;
		const clock = `${Math.floor(hour)}:${String(minutes).padStart(2, '0')}`;
		if ($('clock').textContent !== clock) $('clock').textContent = clock;
		const night = isNightHour(hour);
		const weather = environment.weather;
		// In the mountains rain falls as snow.
		const snowing = weather === 'rainy' && world.region === 'mountains';
		const name = snowing
			? 'cloud-snow'
			: weather === 'rainy'
				? 'cloud-rain'
				: weather === 'cloudy'
					? night
						? 'cloud-moon'
						: 'cloud'
					: weather === 'windy'
						? 'wind'
						: night
							? 'moon'
							: 'sun';
		const label = t(snowing ? 'weather.snowy' : `weather.${weather}`);
		const key = name + label;
		if (key === skyIcon) return;
		skyIcon = key;
		$('sky').innerHTML = icon(name);
		$('sky').setAttribute('aria-label', label);
		$('sky').title = label;
		refreshIcons();
	}
	const riders = createRiders(scene);
	const racing = createRacing(scene);
	/** The fastest lap of the racecourse, kept between visits. */
	let bestLap = 0;
	try {
		bestLap =
			Number(readStoredValue(localStorage, 'alas-stable.best-lap') ?? 0) || 0;
	} catch {
		/* Without storage the record lasts for this session. */
	}
	const otherHorseSolids = () => [
		...herd.filter((h) => h !== selected).map((h) => horseBarrier(h.state)),
		...riders.barriers(),
		...racing.barriers(),
	];
	function selectHorse(next: typeof selected) {
		next.model.tack.visible = true;
		if (selected === next) return;
		horse.rider.visible = false;
		leaveHorse(selected);
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
		renderName();
		$('preview-rider').setAttribute('aria-pressed', 'false');
	}
	const person = createState();
	const walker = createWalkingRider();
	scene.add(walker.root);
	const rope = createLeadRope(scene);
	let leading = false;
	let leadBlocked = false;
	let riding:
		'mounted' | 'on-foot' | 'approaching' | 'mounting' | 'dismounting' =
		'mounted';
	/** Waypoints of the walk to the horse's side before mounting. */
	let approachPath: { x: number; z: number }[] = [];
	let transferTime = 0;
	let footstepTimer = 0;
	let transferSide = { side: -1, x: 0, z: 0 };
	let approach = { x: 0, z: 0, heading: 0 };
	const activeState = () => (riding === 'mounted' ? state : person);
	const transferring = () =>
		riding === 'mounting' ||
		riding === 'dismounting' ||
		riding === 'approaching';
	/** A fade through black, with the change made while the screen is dark. */
	let fade:
		| { time: number; midway: () => void; done?: () => void; fired: boolean }
		| undefined;
	function fadeThrough(midway: () => void, done?: () => void) {
		fade = { time: 0, midway, done, fired: false };
		$('fade').classList.add('on');
		input.clear();
		touch.clear();
	}
	function updateFade(dt: number) {
		if (!fade) return;
		fade.time += dt;
		if (!fade.fired && fade.time >= 0.9) {
			fade.fired = true;
			fade.midway();
			updateGait();
			updateCamera(1, true);
		}
		if (fade.fired && fade.time >= 1.6) $('fade').classList.remove('on');
		if (fade.time >= 2.4) {
			const done = fade.done;
			fade = undefined;
			done?.();
		}
	}
	/** Close enough to the clubhouse bed to lie down. */
	const nearBed = () =>
		riding === 'on-foot' &&
		!leading &&
		!carried &&
		Math.hypot(person.x - world.bed.x, person.z - world.bed.z) < 2.4;
	/** Sleeps until seven in the morning; the other riders turn in too. */
	function sleep() {
		fadeThrough(
			() => {
				riders.restAll();
				environment.setHour(7);
				const { x, z, heading } = world.bed.wake;
				Object.assign(person, { x, z, heading, gait: 0, speed: 0 });
				input.resetLook();
			},
			() => hint('hint.wakeTitle', 'hint.wakeBody', 5),
		);
	}
	/** On foot beside the car's driver door. */
	function nearDriverDoor() {
		if (riding !== 'on-foot' || carried) return false;
		const door = rigPoint(rig, RIG.driverDoor.x, RIG.driverDoor.z);
		return Math.hypot(person.x - door.x, person.z - door.z) < 2.1;
	}
	/** On foot just behind the trailer's lowered ramp. */
	function nearRamp() {
		if (riding !== 'on-foot' || carried) return false;
		const spot = rampApproach(rig);
		return Math.hypot(person.x - spot.x, person.z - spot.z) < 3.4;
	}
	/**
	 * A horse just led out of the trailer must be walked away from the ramp
	 * before it will walk in again.
	 */
	let trailerArmed = true;
	/** A short walk the rider takes by herself, out of a horse's way. */
	let aside: { x: number; z: number; heading: number } | undefined;
	/** Steps to the side of the ramp, facing it, unless already clear of it. */
	function standAsideOfRamp() {
		const spots = [-1, 1].map((side) => ({
			...rigPoint(rig, side * 1.9, RIG.ramp.end - 0.6),
			heading: rig.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
		}));
		const [spot] = spots.sort(
			(a, b) =>
				Math.hypot(a.x - person.x, a.z - person.z) -
				Math.hypot(b.x - person.x, b.z - person.z),
		);
		aside = spot;
	}
	/** Moves the rider along her short walk aside; true while she is walking. */
	function updateAside(dt: number) {
		if (!aside) return false;
		const dx = aside.x - person.x,
			dz = aside.z - person.z,
			distance = Math.hypot(dx, dz),
			stride = 1.6 * dt;
		if (distance > stride) {
			person.heading = Math.atan2(dx, dz);
			person.x += (dx / distance) * stride;
			person.z += (dz / distance) * stride;
			walker.pose(dt, { speed: 1.6 });
			return true;
		}
		person.x = aside.x;
		person.z = aside.z;
		person.heading = aside.heading;
		aside = undefined;
		return false;
	}
	/** The led horse walks up the ramp into the trailer by itself. */
	function board(entry: (typeof herd)[number]) {
		leading = false;
		leadBlocked = false;
		person.gait = 0;
		person.speed = 0;
		entry.boarding = { path: boardingPath(rig), backwards: false };
		standAsideOfRamp();
		updateGait();
		audio.nicker();
		hint('hint.boardingTitle', 'hint.boardingBody', 4, { name: entry.name });
	}
	/** Fetches a horse out of the trailer: it backs down the ramp on the lead. */
	function unload(entry: (typeof herd)[number]) {
		selectHorse(entry);
		entry.aboard = false;
		entry.boarding = { path: unloadingPath(rig), backwards: true };
		person.gait = 0;
		person.speed = 0;
		standAsideOfRamp();
		updateGait();
		hint('hint.unloadTitle', 'hint.unloadBody', 4, { name: entry.name });
	}
	/** Ends a walk into or out of the trailer. */
	function boarded(entry: (typeof herd)[number]) {
		const backwards = entry.boarding?.backwards;
		entry.boarding = undefined;
		Object.assign(entry.state, { speed: 0, gait: 0 });
		if (backwards) {
			entry.state.height = 0;
			if (entry === selected && riding === 'on-foot') {
				leading = true;
				trailerArmed = false;
				updateGait();
				hint('hint.leading', 'hint.follow', 4, { name: entry.name });
			} else leaveHorse(entry);
			return;
		}
		entry.aboard = true;
		Object.assign(entry.state, stallPose(rig));
		hint('hint.aboardTitle', 'hint.aboardBody', 6, { name: entry.name });
	}
	const travelButtons = Array.from(
		document.querySelectorAll<HTMLButtonElement>('[data-region]'),
	);
	/** Opens the map of places to drive to. */
	function openTravel() {
		const inside = passenger();
		$('travel-cargo').textContent = inside
			? t('travel.cargo', { name: inside.name })
			: t('travel.empty');
		for (const button of travelButtons) {
			const here = button.dataset.region === world.region;
			button.disabled = here;
			button.classList.toggle('here', here);
		}
		drawTravelMap(
			requireElement('#travel-canvas', HTMLCanvasElement),
			world.region,
		);
		showDialog(dialog('travel-dialog'));
		travelButtons.find((button) => !button.disabled)?.focus();
	}
	/** Parks the car in a place, with the horse in the trailer riding along. */
	function park(id: RegionId) {
		const inside = passenger();
		world.enter(id);
		staticSolids = createSolidGrid(world.solids);
		rig = { ...PARKING[id] };
		world.vehicle.place(rig);
		if (inside)
			Object.assign(inside.state, stallPose(rig), { speed: 0, gait: 0 });
	}
	/** Drives to another place: fades out, parks there and fades back in. */
	/** Hints and sounds for the start, the countdown and the finish. */
	function onRace(event: RaceEvent) {
		if (event.kind === 'near')
			hint('hint.raceNearTitle', 'hint.raceNearBody', 6);
		else if (event.kind === 'count') {
			hint('hint.raceCount', 'hint.raceReadyBody', 1.2, { n: String(event.n) });
			audio.tone(660, 0.18, 0.06, 660, 'square');
		} else if (event.kind === 'go') {
			hint('hint.raceGoTitle', 'hint.raceGoBody', 3);
			audio.tone(990, 0.5, 0.07, 990, 'square');
			gamepad.pulse(0.6, 200);
		} else if (event.kind === 'false-start')
			hint('hint.falseStartTitle', 'hint.falseStartBody', 4);
		else if (event.kind === 'abandon')
			hint('hint.raceAbandonTitle', 'hint.raceAbandonBody', 5);
		else if (event.kind === 'finish') {
			const record = !bestLap || event.time < bestLap;
			if (record) {
				bestLap = event.time;
				try {
					localStorage.setItem('alas-stable.best-lap', String(bestLap));
				} catch {
					/* The record lasts for this session. */
				}
			}
			hint(
				'hint.finishTitle',
				record ? 'hint.recordBody' : 'hint.finishBody',
				7,
				{
					place: String(event.place),
					time: formatTime(event.time),
					best: formatTime(bestLap),
				},
			);
			for (let i = 0; i < 3; i++)
				setTimeout(
					() => audio.tone(784 + i * 196, 0.25, 0.05, 784 + i * 196),
					i * 160,
				);
			if (event.place === 1) {
				horse.neck[1].getWorldPosition(headPoint);
				hearts.burst(headPoint.setY(headPoint.y + 0.8), 8);
			}
		}
	}
	let raceShown = '';
	/** The race clock and the player's place, shown while racing. */
	function renderRace() {
		const running = racing.phase === 'running' && world.region === 'hippodrome';
		const text = running
			? `${formatTime(racing.time)} · ${t('race.place', { place: String(racing.place) })}`
			: '';
		if (text === raceShown) return;
		raceShown = text;
		$('race').hidden = !running;
		$('race').textContent = text;
	}
	function travel(id: RegionId) {
		closeDialog(dialog('travel-dialog'));
		releaseLead();
		carried = undefined;
		audio.engine();
		fadeThrough(
			() => {
				park(id);
				// The rider climbs out of the driver's door and looks back at the trailer.
				const door = rigPoint(rig, RIG.driverDoor.x + 0.5, RIG.driverDoor.z);
				Object.assign(person, {
					...door,
					heading: rig.heading + Math.PI,
					gait: 0,
					speed: 0,
					height: 0,
				});
				input.resetLook();
			},
			() =>
				hint(
					'hint.arrivedTitle',
					passenger() ? 'hint.arrivedWithHorse' : 'hint.arrivedAlone',
					6,
					{
						place: t(`region.${id}`),
						name: passenger()?.name ?? '',
					},
				),
		);
	}
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
		dialog('travel-dialog'),
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
		requireElement('#treat', HTMLButtonElement).disabled =
			transferring() || !!carried;
		requireElement('#grab', HTMLButtonElement).disabled = riding !== 'on-foot';
		$('grab').setAttribute('aria-pressed', String(!!carried));
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
		if (transferring() || fade) return;
		if (riding === 'mounted') changeGait(state, delta);
		// Holding a jump, the rider can only walk it forwards or pull it back.
		else
			person.gait = THREE.MathUtils.clamp(
				person.gait + delta,
				-1,
				carried ? 1 : 2,
			);
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
		leaveHorse(selected);
	}
	/** Takes hold of the nearest jump, or puts the held one down. */
	function grab() {
		if (riding !== 'on-foot' || feeding) return;
		if (carried) {
			carried = undefined;
			updateGait();
			hint('hint.jumpPlacedTitle', 'hint.jumpPlacedBody', 3);
			return;
		}
		const jump = grabbable(world.obstacles, person);
		if (!jump) {
			hint('hint.grabTitle', 'hint.grabBody');
			return;
		}
		releaseLead();
		const hold = holdPose(jump, person);
		const spot = { ...person, x: hold.x, z: hold.z };
		// Step to the middle of the rails, unless something is in the way.
		if (
			[...world.solids, ...jumpSolids(true, jump), ...otherHorseSolids()].some(
				(b) =>
					Math.abs(spot.x - b.x) < b.w / 2 + 0.28 &&
					Math.abs(spot.z - b.z) < b.d / 2 + 0.28,
			)
		) {
			hint('hint.grabTitle', 'hint.grabBody');
			return;
		}
		Object.assign(person, { x: hold.x, z: hold.z, heading: hold.heading });
		person.gait = Math.min(person.gait, 0);
		person.speed = 0;
		jump.down = 0;
		carried = { jump, turn: hold.turn };
		updateGait();
		hint('hint.grabbedTitle', 'hint.grabbedBody', 5);
	}
	/** Moves the held jump with the rider, or holds her back when it would hit something. */
	function carry(previous: typeof person) {
		if (!carried) return;
		const { jump, turn } = carried;
		const pose = carriedPose(person, turn);
		const candidate = { ...jump, ...pose };
		staticSolids.near(pose.x, pose.z, jump.width, nearby);
		nearby.push(
			...jumpSolids(true, jump),
			...herd.map((h) => horseBarrier(h.state)),
		);
		if (!obstacleClear(candidate, nearby)) {
			Object.assign(person, {
				x: previous.x,
				z: previous.z,
				heading: previous.heading,
				speed: 0,
			});
			return;
		}
		Object.assign(jump, pose);
		placeJump(jump);
	}
	const hearts = createHearts(scene);
	const headPoint = new THREE.Vector3();
	/** The rider holding out a carrot, then stroking the horse's forehead. */
	let feeding: { entry: (typeof herd)[number]; time: number } | undefined;
	/** Seconds since the rider began patting the neck from the saddle. */
	let patTime = 9,
		patSide = -1;
	const PAT_DURATION = 2.3;
	const mountedHead: HeadTarget = { graze: 0, yaw: 0, nod: 0, chew: false };
	const smooth = THREE.MathUtils.smoothstep;
	function treat() {
		if (riding === 'mounted') {
			// From the saddle, a few pats on the neck.
			if (patTime < PAT_DURATION) return;
			patTime = 0;
			// Pat the side of the neck that faces the camera, so the pat is seen.
			patSide =
				(camera.position.x - state.x) * Math.cos(state.heading) -
					(camera.position.z - state.z) * Math.sin(state.heading) >=
				0
					? 1
					: -1;
			hint('hint.patTitle', 'hint.patBody', 3, { name: selected.name });
			return;
		}
		if (riding !== 'on-foot' || feeding) return;
		const target = free()
			.filter((h) => !(leading && h === selected))
			.map((h) => ({
				h,
				d: Math.hypot(h.state.x - person.x, h.state.z - person.z),
			}))
			.filter(({ d }) => d < 3.6)
			.sort((a, b) => a.d - b.d)[0]?.h;
		if (!target) {
			hint('hint.treatTitle', 'hint.treatBody');
			return;
		}
		feeding = { entry: target, time: 0 };
		feed(target.wander);
		person.gait = 0;
		person.speed = 0;
		updateGait();
	}
	/** Leans over, pats the neck three times and sits up again; the horse nods. */
	function updatePat(dt: number) {
		const before = patTime;
		patTime += dt;
		const time = patTime;
		if (before >= PAT_DURATION + 0.1) return;
		if (riding !== 'mounted') {
			patTime = PAT_DURATION + 1;
			horse.gesture(0, 0);
			return;
		}
		const lean = smooth(time, 0, 0.45) * (1 - smooth(time, 1.75, 2.25));
		// Three pats: the hand lifts and comes down on the neck.
		const beat = (time - 0.5) / 0.38;
		const lift = beat > 0 && beat < 3 ? Math.abs(Math.sin(Math.PI * beat)) : 0;
		horse.gesture(lean, lift, patSide);
		for (const contact of [0.5, 0.88, 1.26])
			if (before < contact && time >= contact) audio.pat();
		if (before < 0.55 && time >= 0.55) {
			horse.neck[1].getWorldPosition(headPoint);
			hearts.burst(headPoint.setY(headPoint.y + 0.7), 4);
		}
		if (before < 1.1 && time >= 1.1) audio.nicker();
	}
	/** How the ridden horse holds its head: it turns towards a patting hand. */
	function ridingHead() {
		const react =
			patTime < PAT_DURATION
				? smooth(patTime, 0.5, 1) * (1 - smooth(patTime, 1.7, 2.3))
				: 0;
		mountedHead.yaw = 0.3 * react * patSide;
		mountedHead.nod = 0.12 * react;
		return mountedHead;
	}
	/**
	 * Faces the rider to the horse's head and plays the hand-over: the carrot is
	 * taken, then the rider strokes the forehead until she walks on.
	 */
	function updateFeeding(dt: number) {
		if (!feeding) return undefined;
		feeding.time += dt;
		const { entry, time } = feeding;
		entry.model.forehead.getWorldPosition(headPoint);
		const bearing = Math.atan2(headPoint.x - person.x, headPoint.z - person.z);
		person.heading +=
			Math.atan2(
				Math.sin(bearing - person.heading),
				Math.cos(bearing - person.heading),
			) * Math.min(1, dt * 6);
		// Once the carrot is gone, walking on ends the stroking early.
		const done = time > 3.9 || (time > 1.3 && person.gait !== 0);
		if (!done) {
			person.gait = 0;
			person.speed = 0;
		}
		// The carrot disappears as the horse takes it.
		walker.treat.visible = time < 1.15;
		if (time >= 1.15 && time - dt < 1.15) {
			audio.crunch();
			hearts.burst(headPoint.clone().setY(headPoint.y + 0.5), 5);
			hint('hint.treatDone', 'hint.treatFollow', 4, { name: entry.name });
		}
		if (time >= 1.6 && time - dt < 1.6) audio.nicker();
		if (done) {
			feeding = undefined;
			walker.treat.visible = false;
			updateGait();
			return undefined;
		}
		return {
			offer: smooth(time, 0, 0.45) * (1 - smooth(time, 1.2, 1.6)),
			touch: {
				target: headPoint,
				amount: smooth(time, 1.25, 1.75) * (1 - smooth(time, 3.4, 3.9)),
				stroke: smooth(time, 1.6, 1.9),
			},
		};
	}
	function lead() {
		if (riding !== 'on-foot') return;
		if (leading) {
			releaseLead();
			updateGait();
			hint('hint.released', 'hint.waiting', 4, { name: selected.name });
			return;
		}
		// Beside the lowered ramp, the lead fetches the horse out of the trailer.
		const inside = passenger();
		if (inside && nearRamp()) {
			unload(inside);
			return;
		}
		const target = nearbyLead(free(), person, fixedSolids());
		if (!target) {
			hint('hint.approach', 'hint.attach');
			return;
		}
		selectHorse(target);
		leading = true;
		state.gait = 0;
		state.speed = 0;
		updateGait();
		hint('hint.leading', 'hint.follow', 4, { name: selected.name });
	}
	function mount() {
		if (transferring() || fade) return;
		if (nearBed()) {
			sleep();
			return;
		}
		if (nearDriverDoor()) {
			if (leading) {
				hint('hint.carLeadTitle', 'hint.carLeadBody', 5);
				return;
			}
			openTravel();
			return;
		}
		if (
			riding === 'mounted' &&
			(state.gait !== 0 || Math.abs(state.speed) > 0.12 || state.jump >= 0)
		) {
			hint('hint.stopTitle', 'hint.stopBody');
			return;
		}
		let side: typeof transferSide | undefined;
		if (riding === 'on-foot') {
			const target = nearbyMount(free(), person, fixedSolids(), doorways);
			if (!target) {
				hint('hint.approach', 'hint.chooseHorse');
				return;
			}
			releaseLead();
			carried = undefined;
			selectHorse(target.horse);
			side = target.side;
			// Walk up to the saddle first when the horse is a few steps away.
			const [first] = target.path;
			if (
				target.path.length > 1 ||
				Math.hypot(first.x - person.x, first.z - person.z) > 0.6
			) {
				approachPath = target.path;
				transferSide = target.side;
				riding = 'approaching';
				state.gait = 0;
				person.gait = 0;
				person.speed = APPROACH_SPEED;
				input.clear();
				updateGait();
				return;
			}
		} else side = mountSide(state, [...fixedSolids(), ...otherHorseSolids()]);
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
	/** Walks the rider along the planned path, then starts mounting. */
	function updateApproach(dt: number) {
		const next = approachPath[0];
		const dx = next.x - person.x,
			dz = next.z - person.z;
		const distance = Math.hypot(dx, dz),
			stride = APPROACH_SPEED * dt;
		if (distance > 0.01) person.heading = Math.atan2(dx, dz);
		if (distance > stride) {
			person.x += (dx / distance) * stride;
			person.z += (dz / distance) * stride;
			walker.pose(dt, { speed: APPROACH_SPEED });
			return;
		}
		person.x = next.x;
		person.z = next.z;
		approachPath.shift();
		if (approachPath.length) return;
		person.speed = 0;
		transferTime = 0;
		approach = { x: person.x, z: person.z, heading: person.heading };
		riding = 'mounting';
		horse.rider.visible = false;
		walker.root.visible = !firstPerson;
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
			walker.pose(dt, { speed: 1.8 });
		} else {
			const frame = transferFrame(
				state,
				transferSide,
				riding === 'mounting' ? 1 - (t - 0.25) / 0.75 : t,
				horse.getAppearance().equipment === 'bareback',
			);
			Object.assign(person, {
				x: frame.x,
				z: frame.z,
				heading: frame.heading,
				height: frame.height,
			});
			walker.pose(dt, {
				speed: 0,
				seat: frame.seat,
				swing: frame.swing,
				side: transferSide.side,
			});
		}
		if (t >= 1) {
			riding = riding === 'mounting' ? 'mounted' : 'on-foot';
			if (riding === 'on-foot') leaveHorse(selected);
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
		carried = undefined;
		aside = undefined;
		// The car comes home too, with any horse still in the trailer.
		if (world.region !== 'home' || regionAt(rig.x, rig.z) !== 'home')
			park('home');
		selected.aboard = false;
		selected.boarding = undefined;
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
	$('grab').onclick = () => {
		grab();
		focusGame();
	};
	$('treat').onclick = () => {
		treat();
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
	for (const button of travelButtons)
		button.onclick = () => {
			const id = REGION_IDS.find((region) => region === button.dataset.region);
			if (id) travel(id);
		};
	$('close-travel').onclick = () => closeDialog(dialog('travel-dialog'));
	$('pause').onclick = pause;
	$('resume').onclick = () => closeDialog(dialog('pause-dialog'));
	$('settings').onclick = () => showDialog(dialog('settings-dialog'));
	$('close-settings').onclick = () => closeDialog(dialog('settings-dialog'));
	const daytimeSelect = requireElement('#daytime', HTMLSelectElement),
		weatherSelect = requireElement('#weather-mode', HTMLSelectElement);
	function applySkySettings() {
		const daytime = daytimeSelect.value,
			weather = weatherSelect.value;
		environment.fixHour(
			daytime === 'day' ? 11 : daytime === 'night' ? 23 : null,
		);
		environment.fixWeather(
			WEATHERS.includes(weather as Weather) ? (weather as Weather) : null,
		);
		renderSky();
	}
	try {
		const daytime = readStoredValue(localStorage, 'alas-stable.daytime'),
			weather = readStoredValue(localStorage, 'alas-stable.weather');
		if (daytime === 'day' || daytime === 'night') daytimeSelect.value = daytime;
		if (weather && WEATHERS.includes(weather as Weather))
			weatherSelect.value = weather;
	} catch {
		/* Settings still apply for this session without storage. */
	}
	for (const [select, key] of [
		[daytimeSelect, 'alas-stable.daytime'],
		[weatherSelect, 'alas-stable.weather'],
	] as const)
		select.onchange = () => {
			applySkySettings();
			try {
				localStorage.setItem(key, select.value);
			} catch {
				/* The choice lasts for this session. */
			}
		};
	applySkySettings();
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
	nameInput.oninput = () => rename(nameInput.value, false);
	nameInput.onchange = () => {
		rename(nameInput.value, true);
		nameInput.value = selected.name;
	};
	nameInput.onkeydown = (event) => {
		if (event.key === 'Enter') nameInput.blur();
	};
	$('horse-name-random').onclick = () => {
		rename(
			suggestName(
				getLanguage(),
				herd.map((entry) => entry.name),
			),
			true,
		);
		nameInput.value = selected.name;
	};
	renderName();
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
		treat,
		grab,
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
		treat,
		grab,
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
	const cameraController = createCameraController(camera, world.cameraBlockers);
	function updateCamera(dt: number, snap = false) {
		cameraController.update(
			activeState(),
			dt,
			firstPerson,
			input.look,
			snap,
			riding !== 'mounted',
			leading,
			CAMERA_LIFT[world.region],
		);
	}
	const minimap = createMinimap(
		requireElement('#map', HTMLCanvasElement),
		world,
	);

	const unsubscribeLanguage = onLanguageChange(() => {
		skyIcon = '';
		renderSky();
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
	/**
	 * Horses nobody rides or leads stroll, graze and watch passers-by. Only
	 * horses in view are drawn, and only nearby ones animate every frame.
	 */
	function updateWaitingHorses(dt: number, selectedWaits: boolean) {
		const active = activeState();
		camera.updateMatrixWorld();
		viewProjection.multiplyMatrices(
			camera.projectionMatrix,
			camera.matrixWorldInverse,
		);
		frustum.setFromProjectionMatrix(viewProjection);
		for (const entry of herd) {
			const waits = entry !== selected || selectedWaits;
			const horseState = entry.state;
			if (entry.boarding) {
				const { path, backwards } = entry.boarding;
				if (stepAlong(horseState, path, dt, rig, backwards)) boarded(entry);
				entry.turn = 0;
				entry.head.graze = 0;
				entry.head.chew = false;
				entry.head.rest = 0;
				entry.model.root.position.set(
					horseState.x,
					horseState.height,
					horseState.z,
				);
				entry.model.root.rotation.y = horseState.heading;
			} else if (entry.aboard) {
				// Head low in the trailer, pulling at the hay net.
				entry.head.graze = 0.5;
				entry.head.chew = true;
				entry.head.yaw = 0;
				entry.turn = 0;
				entry.model.root.position.set(
					horseState.x,
					horseState.height,
					horseState.z,
				);
				entry.model.root.rotation.y = horseState.heading;
			} else if (waits) {
				staticSolids.near(horseState.x, horseState.z, 4, nearby);
				if (
					Math.abs(horseState.x - rig.x) < 12 &&
					Math.abs(horseState.z - rig.z) < 12
				)
					nearby.push(...rigSolids(rig));
				for (const other of herd)
					if (
						other !== entry &&
						Math.abs(other.state.x - horseState.x) < 8 &&
						Math.abs(other.state.z - horseState.z) < 8
					)
						nearby.push(horseBarrier(other.state));
				if (riding !== 'mounted')
					nearby.push({ x: person.x, z: person.z, w: 0.6, d: 0.6 });
				nearby.push(...riders.barriers());
				const motion = stepWander(
					horseState,
					entry.wander,
					dt,
					nearby,
					riding === 'mounted' && entry === selected ? undefined : active,
				);
				entry.turn = motion.turn;
				entry.head.graze = motion.graze;
				entry.head.yaw = motion.look;
				entry.head.chew = motion.chew;
				entry.head.rest = motion.rest;
				entry.model.root.position.set(horseState.x, 0, horseState.z);
				entry.model.root.rotation.y = horseState.heading;
			}
			const root = entry.model.root;
			bounds.center.set(root.position.x, 1.6, root.position.z);
			bounds.radius = 3.4;
			const distance = bounds.center.distanceTo(camera.position);
			const scripted = entry.aboard || !!entry.boarding;
			root.visible =
				(entry === selected && !waits && !scripted) ||
				(distance < 220 && frustum.intersectsSphere(bounds));
			if ((waits || scripted) && root.visible && distance < 110)
				entry.animation.update(
					dt,
					horseState,
					elapsed,
					entry.turn,
					1,
					entry.head,
				);
		}
	}
	// A floating tag names the horse within reach and the keys to use.
	const promptPoint = new THREE.Vector3();
	let promptTimer = 0,
		promptTarget: (typeof herd)[number] | undefined,
		promptMount = false,
		promptJump: Jump | undefined,
		promptUse:
			| {
					x: number;
					y: number;
					z: number;
					name: string;
					label: MessageKey;
					key: 'mount' | 'lead';
			  }
			| undefined;
	/** Something to use nearby: the bed, the car or a horse in the trailer. */
	function useTarget() {
		if (fade) return undefined;
		if (nearBed())
			return {
				x: world.bed.x,
				y: 1.6,
				z: world.bed.z,
				name: t('prompt.bed'),
				label: 'prompt.sleep' as const,
				key: 'mount' as const,
			};
		if (nearDriverDoor()) {
			const door = rigPoint(rig, 0, RIG.driverDoor.z);
			return {
				...door,
				y: 2.9,
				name: t('prompt.car'),
				label: 'prompt.drive' as const,
				key: 'mount' as const,
			};
		}
		const inside = passenger();
		if (inside && nearRamp()) {
			const back = rigPoint(rig, 0, RIG.trailer.back);
			return {
				...back,
				y: 3.4,
				name: inside.name,
				label: 'prompt.unload' as const,
				key: 'lead' as const,
			};
		}
		return undefined;
	}
	function updatePrompt(dt: number) {
		promptTimer -= dt;
		if (riding !== 'on-foot' || leading) {
			promptTarget = undefined;
			promptJump = undefined;
			promptUse = leading && riding === 'on-foot' ? useTarget() : undefined;
		} else if (promptTimer <= 0) {
			promptUse = useTarget();
			promptTimer = 0.2;
			const mountable = carried
				? undefined
				: nearbyMount(free(), person, fixedSolids(), doorways)?.horse;
			promptMount = !!mountable;
			promptTarget = carried
				? undefined
				: (mountable ?? nearbyLead(free(), person, fixedSolids()));
			promptJump = carried?.jump ?? grabbable(world.obstacles, person);
		}
		const element = $('prompt');
		// A horse within reach takes precedence over a jump nearby.
		const use = promptTarget ? undefined : promptUse;
		const jump = promptTarget || use ? undefined : promptJump;
		if (!promptTarget && !jump && !use) {
			element.hidden = true;
			return;
		}
		const target = promptTarget?.state ?? use ?? jump!;
		promptPoint
			.set(target.x, promptTarget ? 4.1 : (use?.y ?? 2.3), target.z)
			.project(camera);
		if (promptPoint.z > 1) {
			element.hidden = true;
			return;
		}
		element.hidden = false;
		const name = promptTarget?.name ?? use?.name ?? t('prompt.jump');
		if ($('prompt-name').textContent !== name)
			$('prompt-name').textContent = name;
		const pad = document.documentElement.classList.contains('gamepad-active');
		$('prompt-mount-key').textContent = pad ? 'B' : 'E';
		$('prompt-lead-key').textContent = pad ? 'X' : 'L';
		$('prompt-treat-key').textContent = pad ? 'RT' : 'T';
		$('prompt-grab-key').textContent = pad ? 'LT' : 'G';
		($('prompt-mount-key').parentElement as HTMLElement).hidden =
			!promptTarget || !promptMount;
		($('prompt-lead-key').parentElement as HTMLElement).hidden = !promptTarget;
		$('prompt-treat').hidden =
			!promptTarget ||
			Math.hypot(target.x - person.x, target.z - person.z) >= 3.6;
		$('prompt-grab').hidden = !jump;
		$('prompt-use').hidden = !use;
		if (use) {
			$('prompt-use-key').textContent =
				use.key === 'lead' ? (pad ? 'X' : 'L') : pad ? 'B' : 'E';
			const label = t(use.label);
			if ($('prompt-use-label').textContent !== label)
				$('prompt-use-label').textContent = label;
		}
		const grabLabel = t(carried ? 'prompt.drop' : 'prompt.grab');
		if ($('prompt-grab-label').textContent !== grabLabel)
			$('prompt-grab-label').textContent = grabLabel;
		// Keep the tag on screen even when the horse's head is out of view.
		const half = element.offsetWidth / 2 + 12;
		const x = THREE.MathUtils.clamp(
			((promptPoint.x + 1) / 2) * innerWidth,
			half,
			Math.max(half, innerWidth - half),
		);
		const y = THREE.MathUtils.clamp(
			((1 - promptPoint.y) / 2) * innerHeight,
			200,
			innerHeight - 220,
		);
		element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
	}
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
			environment.update(dt);
			const turn = fade
				? 0
				: THREE.MathUtils.clamp(input.turn + gamepad.turn + touch.turn, -1, 1);
			const move = fade
				? 0
				: THREE.MathUtils.clamp(gamepad.move + touch.move, -1, 1);
			updateFade(dt);
			const nudge =
				!transferring() &&
				(move !== 0 || (wasNudging && activeState().gait === 0))
					? move
					: undefined;
			wasNudging = !transferring() && move !== 0;
			if (!firstPerson) cameraController.adjustDistance(gamepad.zoom, dt);
			const wasJumping = state.jump >= 0;
			const oldGait = activeState().gait;
			// A horse waiting for its dismounted rider potters about like the others.
			const selectedWaits = riding === 'on-foot' && !leading;
			if (
				!leading &&
				!selectedWaits &&
				step(
					state,
					dt,
					riding === 'mounted' ? turn : 0,
					world.obstacles,
					[
						...world.solids,
						...jumpSolids(false),
						...otherHorseSolids(),
						...rigSolids(rig),
					],
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
			const barriers = [...fixedSolids(), ...otherHorseSolids()];
			const walkingAside = riding === 'on-foot' && updateAside(dt);
			if (riding === 'on-foot' && !walkingAside) {
				stepPerson(person, dt, turn, barriers, state, nudge);
				if (carried) carry(previousPerson);
			}
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
				// Led up behind the ramp, the horse walks into the trailer by itself.
				if (!readyToBoard(rig, state, 7)) trailerArmed = true;
				else if (trailerArmed && !passenger() && readyToBoard(rig, state))
					board(selected);
			}
			if (riding === 'approaching') updateApproach(dt);
			else if (transferring()) updateTransfer(dt);
			else if (riding === 'on-foot' && !walkingAside) {
				const hands = carried ? undefined : updateFeeding(dt);
				walker.pose(dt, {
					speed: person.speed,
					turn: dt > 0 ? (person.heading - previousPerson.heading) / dt : 0,
					lead: leading,
					carry: !!carried,
					offer: hands?.offer,
					touch: hands?.touch,
					look: hands ? headPoint : undefined,
				});
			}
			if (activeState().gait !== oldGait) updateGait();
			walker.root.position.set(person.x, person.height, person.z);
			walker.root.rotation.y = person.heading;
			horse.root.position.set(state.x, state.height, state.z);
			horse.root.rotation.y = state.heading;
			const footfalls = selectedWaits
				? 0
				: horseAnimation.update(
						dt,
						state,
						elapsed,
						riding === 'mounted' ? turn : leadTurn,
						riding === 'mounted' && state.gait !== 0
							? 1 + (nudge ?? 0) * STICK_PACE_ADJUSTMENT
							: 1,
						ridingHead(),
					);
			updateWaitingHorses(dt, selectedWaits);
			// Other riders wait for the player; horses left standing only for a while.
			riders.update(
				dt,
				elapsed,
				environment.hour,
				world.obstacles,
				riding === 'mounted'
					? [horseBarrier(state)]
					: [{ x: person.x, z: person.z, w: 0.8, d: 0.8 }],
				herd
					.filter((h) => riding !== 'mounted' || h !== selected)
					.map((h) => horseBarrier(h.state)),
				frustum,
				camera,
			);
			const raceEvents = racing.update(
				dt,
				elapsed,
				world.region === 'hippodrome' && riding === 'mounted'
					? state
					: undefined,
				frustum,
				camera,
			);
			for (const event of raceEvents) onRace(event);
			world.cheer(racing.cheer());
			renderRace();
			if (riding === 'mounted' && footfalls > 0)
				gamepad.pulse(0.08 + Math.abs(state.speed) * 0.012, 35);
			for (const obstacle of world.obstacles) {
				if (leading) obstacle.down = Math.max(0, obstacle.down - dt);
				obstacle.rails.rotation.x = obstacle.down ? 1.4 : 0;
				obstacle.rails.position.y = obstacle.down ? -0.28 : 0;
			}
			input.update(dt, gamepad.look);
			updateCamera(dt);
			updatePrompt(dt);
			const active = activeState();
			if (riding === 'on-foot' && Math.abs(person.speed) > 0.2) {
				footstepTimer -= dt;
				if (footstepTimer <= 0) {
					audio.tone(105, 0.045, 0.018, 45, 'triangle');
					footstepTimer = Math.abs(person.speed) > 2.5 ? 0.23 : 0.36;
				}
			} else footstepTimer = 0;
			updatePat(dt);
			hearts.update(dt);
			audio.tick(
				dt,
				active,
				isSand(active.x, active.z),
				riding === 'mounted' ? footfalls : 0,
			);
			$('location').textContent = t(locationName(active.x, active.z));
			renderSky();
			$('hint').classList.toggle('hidden', elapsed > hintUntil);
		}
		for (const entry of herd) {
			const mounted = entry === selected && riding === 'mounted';
			entry.model.halter.visible = !mounted;
			entry.model.bridle.visible = mounted;
		}
		scene.updateMatrixWorld(true);
		rope.update(walker.leadHand, horse.leadAnchor, leading);
		world.update(elapsed, camera, environment, innerHeight);
		audio.weather(
			world.region === 'mountains' ? 0 : environment.conditions.rain,
			environment.conditions.wind,
			environment.darkness,
			world.region === 'beach'
				? 1 - smooth(activeState().x - BEACH.x - BEACH.shore, 8, 80)
				: 0,
		);
		const others = riders.markers();
		minimap.draw(
			activeState(),
			[
				...herd
					.filter((h) => (riding !== 'mounted' || h !== selected) && !h.aboard)
					.map((h) => h.state),
				...others.standing,
			],
			others.ridden,
			world.region,
			regionAt(rig.x, rig.z) === world.region ? rig : undefined,
		);
		renderer.render(scene, camera);
		if (dialog('dress-dialog').open) preview.render();
	});
	// A read-only snapshot helps repeatable browser checks without altering gameplay.
	if (import.meta.env.DEV)
		window.__alasStable = {
			snapshot: () => ({
				...activeState(),
				riding,
				activeHorse: selected.id,
				region: world.region,
				rig: { ...rig },
				aboard: passenger()?.id ?? '',
				boarding: herd.find((h) => h.boarding)?.id ?? '',
				leading,
				horses: herd.map((h) => ({
					id: h.id,
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
				obstacles: world.obstacles.map(({ x, z, angle, down }) => ({
					x,
					z,
					angle: angle ?? 0,
					down,
					carried: carried?.jump.x === x && carried.jump.z === z,
				})),
				calls: renderer.info.render.calls,
				race: {
					phase: racing.phase,
					place: racing.place,
					time: racing.time,
					racers: racing.racers.map((r) => ({
						x: r.npc.state.x,
						z: r.npc.state.z,
						lap: { ...r.lap },
					})),
				},
				riders: riders.riders.map((r) => ({
					name: r.name,
					x: r.npc.state.x,
					z: r.npc.state.z,
					gait: r.npc.state.gait,
					height: r.npc.state.height,
					person: { x: r.person.x, z: r.person.z },
					where: r.where,
					activity: r.activity,
					horseMode: r.horseMode,
					task: r.task?.kind ?? '',
				})),
			}),
			debug: {
				setTime(hours: number) {
					environment.setHour(hours);
				},
				setWeather(weather: string) {
					if (WEATHERS.includes(weather as Weather))
						environment.setWeather(weather as Weather, true);
				},
				graze(name: string, x: number, z: number, heading: number) {
					const entry = herd.find((h) => h.id === name);
					if (!entry) return;
					Object.assign(entry.state, { x, z, heading, speed: 0, gait: 0 });
					Object.assign(entry.wander, { mode: 'graze', timer: 600 });
					entry.wander.anchor = { x, z };
				},
				/** Runs the clock and the other riders ahead, without drawing frames. */
				fastForward(seconds: number) {
					const step = 1 / 30;
					for (let t = 0; t < seconds; t += step) {
						elapsed += step;
						environment.update(step);
						riders.update(
							step,
							elapsed,
							environment.hour,
							world.obstacles,
							[],
							[],
							frustum,
							camera,
						);
					}
				},
				/** Ways the other riders use that pass through solids, with a margin. */
				navCheck(margin = 0.8) {
					const blocked: string[] = [];
					const hits = (
						a: { x: number; z: number },
						b: { x: number; z: number },
					) => {
						const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3);
						for (let i = 0; i <= steps; i++) {
							const x = a.x + ((b.x - a.x) * i) / steps,
								z = a.z + ((b.z - a.z) * i) / steps;
							const solid = world.solids.find(
								(s) =>
									Math.abs(x - s.x) < s.w / 2 + margin &&
									Math.abs(z - s.z) < s.d / 2 + margin,
							);
							if (solid)
								return `${x.toFixed(1)},${z.toFixed(1)} in ${solid.x.toFixed(1)},${solid.z.toFixed(1)} ${solid.w.toFixed(1)}x${solid.d.toFixed(1)}${solid.jumpable ? ' fence' : ''}`;
						}
						return undefined;
					};
					const { graph, loops, restSpots, pastureView } = riders.paths;
					graph.links.forEach((links, i) => {
						for (const j of links)
							if (j > i) {
								const hit = hits(graph.nodes[i], graph.nodes[j]);
								if (hit)
									blocked.push(
										`${graph.nodes[i].name}-${graph.nodes[j].name}: ${hit}`,
									);
							}
					});
					for (const [name, points] of Object.entries(loops))
						points.forEach((p, i) => {
							const hit = hits(p, points[(i + 1) % points.length]);
							if (hit) blocked.push(`${name}[${i}]: ${hit}`);
						});
					for (const spot of [...restSpots, pastureView]) {
						const hit = hits(spot, spot);
						if (hit)
							blocked.push(
								`spot ${spot.x.toFixed(1)},${spot.z.toFixed(1)}: ${hit}`,
							);
					}
					return blocked;
				},
				/** Drives straight to a place, as if chosen on the map. */
				travel(id: string) {
					const region = REGION_IDS.find((r) => r === id);
					if (region) travel(region);
				},
				teleport(x: number, z: number, heading: number) {
					Object.assign(activeState(), { x, z, heading, speed: 0, gait: 0 });
					updateGait();
					updateCamera(1, true);
				},
			},
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
			world.dispose();
			renderer.dispose();
			delete window.__alasStable;
			for (const dialog of dialogs) dialog.close();
			app.replaceChildren();
		},
	};
}
