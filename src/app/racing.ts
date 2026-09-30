import * as THREE from 'three';
import { createHorse } from '../horse/model.ts';
import { createHorseAnimation, type HeadTarget } from '../horse/animation.ts';
import { dressFigure } from '../horse/figure.ts';
import type { Appearance } from '../horse/appearance.ts';
import { createNpc, follow, routeFromPoints, stepNpc } from '../game/npc.ts';
import {
	advanceLap,
	courseProgress,
	place,
	startLap,
	type Lap,
} from '../game/race.ts';
import { horseBarrier } from '../game/herd.ts';
import type { GameState, Solid } from '../game/types.ts';
import {
	HIPPODROME,
	hippodromeLength,
	hippodromePoint,
} from '../world/region-layout.ts';

/** The three horses that race against the player, each in its own lane. */
const RACERS: {
	lane: number;
	pace: number;
	appearance: Partial<Appearance>;
	silks: string;
}[] = [
	{
		lane: -1,
		pace: 0.1,
		appearance: { coat: '#343330', hair: '#47332d', cloth: '#b75f59' },
		silks: '#c8453c',
	},
	{
		lane: 2.5,
		pace: 0.2,
		appearance: { coat: '#e6e0d2', hair: '#e9e3d1', cloth: '#7275a3' },
		silks: '#2f5aa8',
	},
	{
		lane: 6,
		pace: 0.28,
		appearance: { coat: '#665046', hair: '#47332d', cloth: '#b3a45a' },
		silks: '#e9c341',
	},
];

/** How far behind the line the racers wait, in metres. */
const BEHIND = 4;
const SAMPLES = 360;

export type RaceEvent =
	| { kind: 'near' }
	| { kind: 'ready' }
	| { kind: 'count'; n: number }
	| { kind: 'go' }
	| { kind: 'false-start' }
	| { kind: 'finish'; place: number; time: number }
	| { kind: 'abandon' };

/** Whether a point is in the white start box, on the inside behind the line. */
export function inStartBox(x: number, z: number) {
	const lx = x - HIPPODROME.x,
		lz = z - HIPPODROME.z;
	const inner = HIPPODROME.radius - HIPPODROME.halfWidth;
	return lx > -10 && lx < -0.5 && lz > inner && lz < inner + 4.2;
}

/**
 * Races at the racecourse: three horses wait behind the line, and when the
 * player stands still in the start box a countdown starts a one-lap race.
 * Places are decided by who crosses the line first after passing all the
 * quarter posts; the crowd cheers as the field gallops past the stand.
 */
export function createRacing(
	scene: THREE.Scene,
	random: () => number = Math.random,
) {
	const course = Array.from({ length: SAMPLES }, (_, i) =>
		hippodromePoint(i / SAMPLES),
	);
	const racers = RACERS.map((spec) => {
		const points = Array.from({ length: SAMPLES }, (_, i) =>
			hippodromePoint(i / SAMPLES, spec.lane),
		);
		const gallop = routeFromPoints(points, 3),
			trot = routeFromPoints(points, 2);
		const start =
			Math.round((1 - BEHIND / hippodromeLength(spec.lane)) * SAMPLES) %
			SAMPLES;
		const model = createHorse();
		model.setAppearance({ ...spec.appearance, equipment: 'saddled' });
		dressFigure(model.rider, { jacket: spec.silks, helmet: spec.silks });
		model.rider.visible = true;
		model.tack.visible = true;
		model.bridle.visible = true;
		model.halter.visible = false;
		scene.add(model.root);
		return {
			...spec,
			model,
			gallop,
			trot,
			start,
			animation: createHorseAnimation(model),
			npc: createNpc(gallop, start),
			lap: startLap(),
			boost: 0,
			turn: 0,
			head: { graze: 0, yaw: 0, nod: 0, chew: false } as HeadTarget,
		};
	});
	type Racer = (typeof racers)[number];
	let phase: 'idle' | 'countdown' | 'running' | 'finished' = 'idle';
	let clock = 0,
		still = 0,
		count = 3,
		settled = 0,
		wasNear = false;
	let player: Lap = startLap();
	const order: Lap[] = [];
	function line(racer: Racer) {
		racer.npc = createNpc(racer.gallop, racer.start);
		Object.assign(racer.npc.state, { gait: 0, speed: 0 });
		racer.lap = startLap();
		racer.lap.at = racer.start / SAMPLES;
	}
	for (const racer of racers) line(racer);
	const bounds = new THREE.Sphere(),
		startPoint = new THREE.Vector3();
	const events: RaceEvent[] = [];
	return {
		racers,
		get phase() {
			return phase;
		},
		/** Seconds since the start, while racing. */
		get time() {
			return clock;
		},
		/** The player's place, 1–4, while racing. */
		get place() {
			return place(player, [player, ...racers.map((r) => r.lap)], order);
		},
		/** Horses waiting at the start, as solids; racing horses pass through. */
		barriers(): Solid[] {
			return phase === 'idle' || phase === 'countdown'
				? racers.map((racer) => horseBarrier(racer.npc.state))
				: [];
		},
		/** How loudly the crowd cheers: most when the field passes the stand. */
		cheer() {
			if (phase === 'idle' || phase === 'countdown') return 0;
			const near = racers.some(
				(racer) =>
					!racer.lap.finished &&
					racer.npc.state.z - HIPPODROME.z > 20 &&
					Math.abs(racer.npc.state.x - HIPPODROME.x) < 70,
			);
			return near ? 1 : 0.25;
		},
		/**
		 * Advances the race. `rider` is the player's horse while mounted at the
		 * racecourse, otherwise undefined.
		 */
		update(
			dt: number,
			elapsed: number,
			rider: Readonly<GameState> | undefined,
			frustum: THREE.Frustum,
			camera: THREE.Camera,
		) {
			events.length = 0;
			const inBox = !!rider && inStartBox(rider.x, rider.z);
			const near =
				!!rider &&
				Math.hypot(
					rider.x - HIPPODROME.x + 5,
					rider.z - HIPPODROME.z - HIPPODROME.radius,
				) < 40;
			if (near && !wasNear && phase === 'idle') events.push({ kind: 'near' });
			wasNear = near;
			if (phase === 'idle') {
				still =
					rider && inBox && rider.gait === 0 && Math.abs(rider.speed) < 0.3
						? still + dt
						: 0;
				if (still > 1) {
					phase = 'countdown';
					clock = 0;
					count = 3;
					events.push({ kind: 'ready' }, { kind: 'count', n: 3 });
					for (const racer of racers) racer.boost = (random() - 0.5) * 0.12;
				}
			} else if (phase === 'countdown') {
				clock += dt;
				if (!rider || !inBox || rider.gait > 0) {
					phase = 'idle';
					still = 0;
					events.push({ kind: 'false-start' });
				} else if (clock >= 3) {
					phase = 'running';
					clock = 0;
					player = startLap();
					player.at = courseProgress(course, rider.x, rider.z);
					order.length = 0;
					events.push({ kind: 'go' });
				} else {
					// Three, two, one: a second each.
					const n = 3 - Math.floor(clock);
					if (n < count) {
						count = n;
						events.push({ kind: 'count', n });
					}
				}
			} else {
				clock += dt;
				if (phase === 'running') {
					if (!rider || clock > 240) {
						phase = 'finished';
						events.push({ kind: 'abandon' });
					} else if (
						advanceLap(player, courseProgress(course, rider.x, rider.z))
					) {
						order.push(player);
						phase = 'finished';
						events.push({
							kind: 'finish',
							place: order.indexOf(player) + 1,
							time: clock,
						});
					}
				}
			}
			// The racers gallop their lanes, sprinting for home in the straight.
			const racing = phase === 'running' || phase === 'finished';
			for (const racer of racers) {
				const state = racer.npc.state;
				if (racing) {
					const done = racer.lap.finished;
					const sprint = racer.lap.at > 0.8 && racer.lap.posts === 3 ? 0.12 : 0;
					racer.turn = stepNpc(
						racer.npc,
						dt,
						[],
						[],
						done ? 0 : racer.pace + racer.boost + sprint,
					).turn;
					if (
						!done &&
						advanceLap(racer.lap, courseProgress(course, state.x, state.z))
					) {
						order.push(racer.lap);
						follow(racer.npc, racer.trot);
					}
				} else {
					racer.turn = 0;
					state.gait = 0;
					state.speed = 0;
				}
				// A glance about while waiting at the start.
				racer.head.yaw = racing
					? 0
					: 0.25 * Math.sin(elapsed * 0.4 + racer.lane);
			}
			// Once everyone is home, the field walks back to the start unseen.
			if (phase === 'finished' && racers.every((r) => r.lap.finished)) {
				settled += dt;
				const start = hippodromePoint(0.995);
				startPoint.set(start.x, 1.5, start.z);
				const watched =
					frustum.containsPoint(startPoint) &&
					camera.position.distanceTo(startPoint) < 160;
				if (settled > 8 && !watched) {
					phase = 'idle';
					settled = 0;
					still = 0;
					for (const racer of racers) line(racer);
				}
			} else settled = 0;
			for (const racer of racers) {
				const state = racer.npc.state,
					root = racer.model.root;
				root.position.set(state.x, state.height, state.z);
				root.rotation.y = state.heading;
				bounds.center.set(state.x, 1.8, state.z);
				bounds.radius = 3.6;
				const distance = bounds.center.distanceTo(camera.position);
				root.visible = distance < 240 && frustum.intersectsSphere(bounds);
				if (root.visible && distance < 130)
					racer.animation.update(dt, state, elapsed, racer.turn, 1, racer.head);
			}
			return events;
		},
	};
}
