import * as THREE from 'three';
import { createHorse } from '../horse/model.ts';
import { createHorseAnimation, type HeadTarget } from '../horse/animation.ts';
import { dressFigure, type Outfit } from '../horse/figure.ts';
import { createWalkingRider } from '../horse/walking-rider.ts';
import {
	createNpc,
	follow,
	routeFromPoints,
	routeLength,
	stepNpc,
	type Route,
	type Traffic,
} from '../game/npc.ts';
import {
	findPath,
	nearestNode,
	nodeIndex,
	resample,
	type Point,
} from '../game/navigation.ts';
import { transferFrame, MOUNT_DURATION } from '../game/riding.ts';
import { createWander, stepWander, type Wander } from '../game/wander.ts';
import { horseBarrier } from '../game/herd.ts';
import type { GameState, Obstacle, Solid } from '../game/types.ts';
import { createLeadRope } from '../rendering/lead-rope.ts';
import { profile } from '../world/roster.ts';
import {
	createPaths,
	stallAccess,
	type LoopName,
	type Paths,
} from '../world/paths.ts';
import { stableSolids, stallAt, STABLES } from '../world/stable-layout.ts';

type Activity = 'race' | 'trail' | 'arena' | 'pasture' | 'rest';

const RIDERS: {
	name: string;
	/** Roster ID of the rider's own horse. */
	horse: string;
	outfit: Outfit;
	/** How much the rider likes each way of spending a ride. */
	likes: Record<Activity, number>;
	/** What she is doing when the game starts, and how far round. */
	first: {
		activity: 'race' | 'trail' | 'arena';
		loop: LoopName;
		start: number;
	};
	pace: number;
}[] = [
	{
		name: 'Zosia',
		horse: 'SZAFIR',
		outfit: { jacket: '#9c3b3b', helmet: '#26211d' },
		likes: { race: 5, trail: 2, arena: 1.5, pasture: 1.5, rest: 1 },
		first: { activity: 'race', loop: 'race-inner', start: 0 },
		pace: 0.25,
	},
	{
		name: 'Kuba',
		horse: 'GROM',
		outfit: { jacket: '#c8a23a', helmet: '#3a3a3a', hair: '#2b2018' },
		likes: { race: 4, trail: 3, arena: 1, pasture: 1, rest: 1.5 },
		first: { activity: 'race', loop: 'race-outer', start: 0.06 },
		pace: 0.05,
	},
	{
		name: 'Ola',
		horse: 'KARMEL',
		outfit: { jacket: '#4c6a8c', helmet: '#7275a3', hair: '#a8773f' },
		likes: { race: 1, trail: 5, arena: 1, pasture: 2.5, rest: 2 },
		first: { activity: 'trail', loop: 'trail', start: 0.55 },
		pace: 0,
	},
	{
		name: 'Hania',
		horse: 'KOMETA',
		outfit: { jacket: '#35584c', helmet: '#26211d', hair: '#3a2718' },
		likes: { race: 1, trail: 2, arena: 5, pasture: 1.5, rest: 1 },
		first: { activity: 'arena', loop: 'arena', start: 0 },
		pace: 0,
	},
];

const WALK_SPEED = 1.7,
	LEAD_SPEED = 1.35,
	LEAD_DISTANCE = 2.5,
	STALL_SPEED = 0.9;
const angleTo = (from: number, to: number) =>
	Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** One thing a rider does; the next is planned when it is finished. */
type Task =
	| { kind: 'ride'; route: Route }
	| {
			kind: 'loop';
			route: Route;
			/** Metres still to ride before looking for the way out. */
			distance: number;
			exit?: Point;
	  }
	| { kind: 'dismount'; time: number; side?: Point }
	| { kind: 'mount'; time: number; side?: Point }
	| { kind: 'walk'; points: Point[]; lead: boolean; speed: number }
	| { kind: 'tack'; time: number; on: boolean }
	| { kind: 'stable'; started: boolean }
	| { kind: 'fetch'; started: boolean }
	| { kind: 'rest'; time: number; duration: number }
	| { kind: 'enter' }
	| { kind: 'exit' };

type Plan = (() => Task)[];

/**
 * Other riders sharing the grounds. Each spends the day on rides of her
 * choice (racing laps, the bridleway, schooling over the arena jumps, or a
 * break on the grass or by the pasture), rides home at dusk, untacks her horse
 * in the aisle, leads it into its stall and walks to the clubhouse, and in the
 * morning fetches and tacks it up again.
 */
export function createRiders(
	scene: THREE.Scene,
	random: () => number = Math.random,
) {
	const paths: Paths = createPaths();
	const loops = {
		'race-inner': routeFromPoints(paths.loops['race-inner'], 3),
		'race-outer': routeFromPoints(paths.loops['race-outer'], 3),
		trail: routeFromPoints(paths.loops.trail, 2, 1, 0.5),
		arena: routeFromPoints(paths.loops.arena, 3, 2, 0.3, 4),
	} satisfies Record<LoopName, Route>;
	const node = (name: string) =>
		paths.graph.nodes[nodeIndex(paths.graph, name)];
	const exitOf = (loop: LoopName) => {
		const entry = paths.entries[loop];
		return entry ? node(entry) : undefined;
	};
	const riders = RIDERS.map((spec, rank) => {
		const home = profile(spec.horse)!.home;
		const model = createHorse();
		model.setAppearance(profile(spec.horse)?.appearance ?? {});
		model.root.name = spec.horse;
		dressFigure(model.rider, spec.outfit);
		scene.add(model.root);
		const walker = createWalkingRider();
		dressFigure(walker.root, spec.outfit);
		scene.add(walker.root);
		const route = loops[spec.first.loop];
		return {
			...spec,
			rank,
			home,
			access: stallAccess(home),
			model,
			walker,
			rope: createLeadRope(scene),
			animation: createHorseAnimation(model),
			npc: createNpc(route, Math.floor(spec.first.start * route.points.length)),
			/** The rider on foot. */
			person: { x: 0, z: 0, heading: 0, speed: 0, height: 0, turn: 0 },
			where: 'riding' as 'riding' | 'foot' | 'inside',
			horseMode: 'ridden' as
				'ridden' | 'led' | 'guided' | 'stabled' | 'resting',
			activity: spec.first.activity as Activity | 'home' | 'morning',
			lane: spec.first.loop,
			task: undefined as Task | undefined,
			plan: [] as Plan,
			/** Where a led horse walks: the handler's footsteps. */
			crumbs: [] as Point[],
			/** Where a horse walks by itself into or out of its stall. */
			horsePath: [] as Point[],
			horseFace: 0,
			horseTurn: 0,
			wander: undefined as Wander | undefined,
			head: { graze: 0, yaw: 0, nod: 0, chew: false } as HeadTarget,
			stroke: 0,
			transfer: undefined as { seat: number; swing: number } | undefined,
			wakeHour: 7 + rank * 0.45 + random() * 0.3,
			homeHour: 18.6 + rank * 0.4 + random() * 0.3,
			started: false,
		};
	});
	type Rider = (typeof riders)[number];
	for (const rider of riders) {
		const loop = rider.first.loop;
		rider.task = {
			kind: 'loop',
			route: loops[loop],
			distance: routeLength(loops[loop]) * (1 + random() * 2),
			exit: exitOf(loop),
		};
		if (rider.first.activity === 'race')
			rider.plan = [() => rideTo(rider, 'race-gate')];
		if (rider.first.activity === 'arena')
			rider.plan = [() => rideTo(rider, 'arena-gate')];
	}

	/** The way from a point to a graph node, as points every two metres. */
	function wayTo(from: Point, name: string) {
		const start = nearestNode(paths.graph, from.x, from.z),
			end = nodeIndex(paths.graph, name);
		const chain = findPath(paths.graph, start, end) ?? [end];
		return resample(
			[{ x: from.x, z: from.z }, ...chain.map((i) => paths.graph.nodes[i])],
			2,
		);
	}
	/** A ride along points, trotting, walking round tight bends and at the end. */
	const ride = (points: Point[]): Task => ({
		kind: 'ride',
		route: routeFromPoints(points, 2, 1, 0.7, 2, false),
	});
	const rideTo = (rider: Rider, name: string) =>
		ride(wayTo(rider.npc.state, name));
	const outNode = (rider: Rider) =>
		paths.stableNode(rider.home.stable).replace('-in', '-out');

	const busy = (activity: Activity, rider: Rider) =>
		riders.filter((r) => r !== rider && r.activity === activity).length;
	/** Plans the next ride of the day, avoiding a crowd. */
	function planDay(rider: Rider): Plan {
		const choices = (Object.keys(rider.likes) as Activity[]).filter(
			(a) =>
				!(a === 'arena' && busy('arena', rider) > 0) &&
				!(a === 'race' && busy('race', rider) > 1) &&
				!(a === 'pasture' && busy('pasture', rider) > 0),
		);
		let roll = random() * choices.reduce((sum, a) => sum + rider.likes[a], 0);
		let activity = choices[0];
		for (const choice of choices) {
			roll -= rider.likes[choice];
			if (roll <= 0) {
				activity = choice;
				break;
			}
		}
		rider.activity = activity;
		const laps = (loop: LoopName, min: number, max: number) =>
			routeLength(loops[loop]) * (min + random() * (max - min));
		if (activity === 'race') {
			const other = riders.find((r) => r !== rider && r.activity === 'race');
			const lane: LoopName =
				other?.lane === 'race-inner' ? 'race-outer' : 'race-inner';
			rider.lane = lane;
			return [
				() => rideTo(rider, 'race-in'),
				() => ({
					kind: 'loop',
					route: loops[lane],
					distance: laps(lane, 1.5, 3.5),
					exit: exitOf(lane),
				}),
				() => rideTo(rider, 'race-gate'),
			];
		}
		if (activity === 'arena')
			return [
				() => rideTo(rider, 'arena-in'),
				() => ({
					kind: 'loop',
					route: loops.arena,
					distance: laps('arena', 2.5, 5),
					exit: exitOf('arena'),
				}),
				() => rideTo(rider, 'arena-gate'),
			];
		if (activity === 'trail')
			return [
				() => ({
					kind: 'loop',
					route: loops.trail,
					distance: laps('trail', 0.4, 1.1),
				}),
			];
		// A break: stop off the track, let the horse graze and stroke it.
		return [
			() => {
				const here = rider.npc.state;
				const spot =
					activity === 'pasture'
						? paths.pastureView
						: [...paths.restSpots].sort(
								(a, b) =>
									Math.hypot(a.x - here.x, a.z - here.z) -
									Math.hypot(b.x - here.x, b.z - here.z),
							)[Math.floor(random() * 2)];
				const via =
					activity === 'pasture'
						? 'pasture-path'
						: paths.graph.nodes[nearestNode(paths.graph, spot.x, spot.z)].name;
				return ride([...wayTo(here, via), { x: spot.x, z: spot.z }]);
			},
			() => ({ kind: 'dismount', time: 0 }),
			() => ({ kind: 'rest', time: 0, duration: 25 + random() * 35 }),
			() => ({ kind: 'mount', time: 0 }),
		];
	}
	/** Rides home, untacks, stables the horse and walks to the clubhouse. */
	function planEvening(rider: Rider): Plan {
		const a = rider.access;
		const along = Math.sign(a.aisle.z - a.inside.z);
		return [
			...(rider.where === 'foot'
				? [(): Task => ({ kind: 'mount', time: 0 })]
				: []),
			() => rideTo(rider, outNode(rider)),
			() => ({ kind: 'dismount', time: 0 }),
			() => ({
				kind: 'walk',
				lead: true,
				speed: LEAD_SPEED,
				points: resample(
					[
						{ ...rider.person },
						a.inside,
						{ x: a.aisle.x, z: a.aisle.z + along * 1.6 },
					],
					1,
				),
			}),
			() => ({ kind: 'tack', time: 0, on: false }),
			() => ({ kind: 'stable', started: false }),
			() => ({
				kind: 'walk',
				lead: false,
				speed: WALK_SPEED,
				points: resample(
					[{ ...rider.person }, a.inside, ...wayTo(a.outside, 'club')],
					1,
				),
			}),
			() => ({ kind: 'enter' }),
		];
	}
	/** Walks to the stable, fetches and tacks up the horse and leads it out. */
	function planMorning(rider: Rider): Plan {
		const a = rider.access;
		const beyond = {
			x: a.outside.x,
			z: a.outside.z + Math.sign(a.outside.z - a.inside.z) * 3,
		};
		return [
			() => ({ kind: 'exit' }),
			() => ({
				kind: 'walk',
				lead: false,
				speed: WALK_SPEED,
				points: resample(
					[...wayTo(node('club'), outNode(rider)), a.inside, a.handler],
					1,
				),
			}),
			() => ({ kind: 'fetch', started: false }),
			() => ({ kind: 'tack', time: 0, on: true }),
			() => ({
				kind: 'walk',
				lead: true,
				speed: LEAD_SPEED,
				points: resample([{ ...rider.person }, a.inside, a.outside, beyond], 1),
			}),
			() => ({ kind: 'mount', time: 0 }),
		];
	}
	/** Puts a rider in the clubhouse and her horse in its stall, untacked. */
	function sendHome(rider: Rider) {
		const a = rider.access;
		rider.where = 'inside';
		rider.horseMode = 'stabled';
		rider.activity = 'home';
		rider.task = undefined;
		rider.plan = [];
		Object.assign(rider.npc.state, {
			x: a.stall.x,
			z: a.stall.z,
			heading: a.face,
			speed: 0,
			gait: 0,
			jump: -1,
			height: 0,
		});
		rider.model.tack.visible = false;
		rider.wander = stallWander(rider);
	}
	function stallWander(rider: Rider) {
		const a = rider.access;
		return createWander(
			rider.npc.state,
			{ enclosure: stallAt(a.stall.x, a.stall.z), range: 2.5 },
			random,
		);
	}
	/** The ground beside the horse's left shoulder, where riders mount. */
	function sidePoint(horse: GameState) {
		return {
			x: horse.x + Math.cos(horse.heading) * 1.65,
			z: horse.z - Math.sin(horse.heading) * 1.65,
		};
	}

	/** Walks the rider on foot along points; true once she has arrived. */
	function walk(rider: Rider, points: Point[], speed: number, dt: number) {
		const p = rider.person;
		const before = p.heading;
		let budget = speed * dt;
		while (budget > 0 && points.length) {
			const next = points[0];
			const dx = next.x - p.x,
				dz = next.z - p.z,
				d = Math.hypot(dx, dz);
			if (d < 0.02) {
				points.shift();
				continue;
			}
			const move = Math.min(d, budget);
			p.x += (dx / d) * move;
			p.z += (dz / d) * move;
			budget -= move;
			p.heading += angleTo(p.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
			if (move >= d) points.shift();
		}
		p.speed = points.length ? speed : 0;
		p.turn = dt > 0 ? angleTo(before, p.heading) / dt : 0;
		return points.length === 0;
	}
	/** Turns the rider on foot to look at a point. */
	function face(rider: Rider, target: Point, dt: number) {
		const p = rider.person,
			before = p.heading;
		p.heading +=
			angleTo(p.heading, Math.atan2(target.x - p.x, target.z - p.z)) *
			Math.min(1, dt * 5);
		p.speed = 0;
		p.turn = dt > 0 ? angleTo(before, p.heading) / dt : 0;
	}
	/** Moves the horse towards a point, turning to walk forwards. */
	function moveHorseTo(
		rider: Rider,
		target: Point,
		dt: number,
		maxSpeed: number,
	) {
		const h = rider.npc.state;
		const dx = target.x - h.x,
			dz = target.z - h.z,
			d = Math.hypot(dx, dz);
		const before = h.heading;
		let speed = 0;
		if (d > 0.03) {
			const move = Math.min(d, maxSpeed * dt);
			h.x += (dx / d) * move;
			h.z += (dz / d) * move;
			speed = move / Math.max(dt, 1e-4);
			// Short shuffles keep the heading; real steps turn the horse.
			if (move > 0.004)
				h.heading +=
					angleTo(h.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
		}
		h.speed += (speed - h.speed) * Math.min(1, dt * 6);
		h.gait = h.speed > 0.15 ? 1 : 0;
		rider.horseTurn = dt > 0 ? angleTo(before, h.heading) / dt / 1.4 : 0;
		return d < 0.08;
	}
	/** A led horse walks in its handler's footsteps, a rope's length behind. */
	function followCrumbs(rider: Rider, dt: number) {
		const p = rider.person,
			crumbs = rider.crumbs;
		const last = crumbs[crumbs.length - 1];
		if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.2)
			crumbs.push({ x: p.x, z: p.z });
		let need = LEAD_DISTANCE,
			target: Point = crumbs[0];
		for (let i = crumbs.length - 1; i > 0; i--) {
			const a = crumbs[i],
				b = crumbs[i - 1];
			const d = Math.hypot(a.x - b.x, a.z - b.z);
			if (d >= need) {
				target = {
					x: a.x + ((b.x - a.x) * need) / d,
					z: a.z + ((b.z - a.z) * need) / d,
				};
				// Forget footsteps the horse has passed.
				if (i > 2) crumbs.splice(0, i - 2);
				break;
			}
			need -= d;
		}
		moveHorseTo(rider, target, dt, 2.4);
	}

	/** Runs the current task; true once it is finished. */
	function runTask(
		rider: Rider,
		task: Task,
		dt: number,
		obstacles: Obstacle[],
		blockers: readonly Solid[],
		passable: readonly Solid[],
		traffic: readonly Traffic[],
	): boolean {
		const h = rider.npc.state,
			p = rider.person;
		switch (task.kind) {
			case 'ride':
			case 'loop': {
				if (rider.npc.route !== task.route) follow(rider.npc, task.route);
				const result = stepNpc(
					rider.npc,
					dt,
					obstacles,
					blockers,
					rider.pace,
					passable,
					traffic,
					rider.rank,
				);
				rider.horseTurn = result.turn;
				if (task.kind === 'ride') return result.arrived;
				if (rider.npc.travelled < task.distance) return false;
				return (
					!task.exit || Math.hypot(h.x - task.exit.x, h.z - task.exit.z) < 6
				);
			}
			case 'dismount':
			case 'mount': {
				const mounting = task.kind === 'mount';
				h.speed = 0;
				h.gait = 0;
				rider.horseTurn = 0;
				task.side ??= sidePoint(h);
				// On foot, walk up to the horse's shoulder before climbing on.
				if (
					mounting &&
					task.time === 0 &&
					Math.hypot(p.x - task.side.x, p.z - task.side.z) > 0.15
				) {
					walk(rider, [task.side], WALK_SPEED * 0.8, dt);
					return false;
				}
				task.time += dt;
				rider.where = 'foot';
				const t = Math.min(1, task.time / (MOUNT_DURATION * 0.8));
				const frame = transferFrame(
					h,
					task.side,
					mounting ? 1 - t : t,
					rider.model.getAppearance().equipment === 'bareback',
				);
				Object.assign(p, {
					x: frame.x,
					z: frame.z,
					heading: frame.heading,
					height: frame.height,
					speed: 0,
					turn: 0,
				});
				rider.transfer = { seat: frame.seat, swing: frame.swing };
				if (t < 1) return false;
				rider.transfer = undefined;
				p.height = 0;
				if (mounting) {
					rider.where = 'riding';
					rider.horseMode = 'ridden';
				} else rider.horseMode = 'resting';
				return true;
			}
			case 'walk': {
				if (task.lead && rider.horseMode !== 'led') {
					rider.horseMode = 'led';
					rider.crumbs = [{ x: h.x, z: h.z }];
				}
				const done = walk(rider, task.points, task.speed, dt);
				if (task.lead) followCrumbs(rider, dt);
				return done;
			}
			case 'tack': {
				// Beside the horse while taking the saddle off or putting it on.
				task.time += dt;
				const side = sidePoint(h);
				if (Math.hypot(p.x - side.x, p.z - side.z) > 0.1 && task.time < 3)
					walk(rider, [side], WALK_SPEED * 0.7, dt);
				else face(rider, h, dt);
				h.speed = 0;
				h.gait = 0;
				rider.horseTurn = 0;
				rider.stroke = task.time > 1 && task.time < 2.4 ? 1 : 0;
				if (task.time > 2.5) rider.model.tack.visible = task.on;
				return task.time > 4.2;
			}
			case 'stable':
			case 'fetch': {
				const a = rider.access;
				if (!task.started) {
					task.started = true;
					rider.horseMode = 'guided';
					rider.wander = undefined;
					if (task.kind === 'stable') {
						rider.horsePath = [a.aisle, a.doorway, a.stall];
						rider.horseFace = a.face;
					} else {
						rider.horsePath = [a.stall, a.doorway, a.aisle];
						rider.horseFace = Math.atan2(
							a.inside.x - a.aisle.x,
							a.inside.z - a.aisle.z,
						);
					}
				}
				// The handler waits across the aisle, watching her horse.
				if (Math.hypot(p.x - a.handler.x, p.z - a.handler.z) > 0.1)
					walk(rider, [a.handler], WALK_SPEED, dt);
				else face(rider, h, dt);
				const next = rider.horsePath[0];
				if (next) {
					if (moveHorseTo(rider, next, dt, STALL_SPEED))
						rider.horsePath.shift();
					return false;
				}
				const error = angleTo(h.heading, rider.horseFace);
				const before = h.heading;
				h.heading += Math.sign(error) * Math.min(Math.abs(error), dt * 1.2);
				rider.horseTurn = angleTo(before, h.heading) / Math.max(dt, 1e-4) / 1.4;
				h.speed = 0;
				h.gait = 0;
				if (Math.abs(error) > 0.05) return false;
				if (task.kind === 'stable') {
					rider.horseMode = 'stabled';
					rider.wander = stallWander(rider);
				}
				return true;
			}
			case 'rest': {
				task.time += dt;
				// The horse grazes on a loose rein while its rider strokes its neck.
				rider.head.graze =
					task.time > 1.5 && task.time < task.duration - 2 ? 1 : 0;
				rider.head.chew = rider.head.graze > 0;
				rider.stroke = Math.sin(task.time * 0.35) > 0.3 ? 1 : 0;
				face(rider, neckPoint, dt);
				return task.time > task.duration;
			}
			case 'enter':
				rider.where = 'inside';
				p.speed = 0;
				return true;
			case 'exit': {
				const door = node('club');
				Object.assign(p, {
					x: door.x,
					z: door.z,
					heading: Math.PI / 2,
					speed: 0,
					height: 0,
				});
				rider.where = 'foot';
				return true;
			}
		}
	}

	/** Night falls: ride home now, finishing a lap or cutting a break short. */
	function goHome(rider: Rider) {
		const task = rider.task;
		if (task?.kind === 'loop') task.distance = 0;
		else if (task?.kind === 'ride' || task?.kind === 'rest')
			rider.task = undefined;
		rider.activity = 'home';
		rider.plan = planEvening(rider);
	}

	const bounds = new THREE.Sphere(),
		neckPoint = new THREE.Vector3(),
		stallSolids = new Map(STABLES.map((spec) => [spec.id, stableSolids(spec)]));

	function draw(
		rider: Rider,
		dt: number,
		elapsed: number,
		frustum: THREE.Frustum,
		camera: THREE.Camera,
	) {
		const h = rider.npc.state,
			p = rider.person,
			model = rider.model,
			root = model.root;
		root.position.set(h.x, h.height, h.z);
		root.rotation.y = h.heading;
		model.rider.visible = rider.where === 'riding';
		// The bridle and reins only while ridden; otherwise the halter.
		model.bridle.visible = rider.horseMode === 'ridden';
		model.halter.visible = !model.bridle.visible;
		bounds.center.set(h.x, 1.8, h.z);
		bounds.radius = 3.6;
		const distance = bounds.center.distanceTo(camera.position);
		root.visible = distance < 220 && frustum.intersectsSphere(bounds);
		if (root.visible && distance < 120)
			rider.animation.update(
				dt,
				h,
				elapsed,
				rider.horseTurn,
				h.gait && rider.horseMode === 'ridden' ? 1 + rider.pace * 0.3 : 1,
				rider.head,
			);
		const walker = rider.walker;
		walker.root.position.set(p.x, p.height, p.z);
		walker.root.rotation.y = p.heading;
		bounds.center.set(p.x, 1.2, p.z);
		bounds.radius = 1.4;
		const near = bounds.center.distanceTo(camera.position);
		walker.root.visible =
			rider.where === 'foot' && near < 160 && frustum.intersectsSphere(bounds);
		if (walker.root.visible && near < 90) {
			const withHorse =
				rider.horseMode === 'led' ||
				rider.horseMode === 'guided' ||
				rider.horseMode === 'resting' ||
				rider.task?.kind === 'tack';
			walker.pose(dt, {
				speed: p.speed,
				turn: p.turn,
				lead: rider.horseMode === 'led',
				seat: rider.transfer?.seat,
				swing: rider.transfer?.swing,
				side: 1,
				look: withHorse ? neckPoint : undefined,
				touch:
					rider.stroke > 0
						? { target: neckPoint, amount: rider.stroke, stroke: 1 }
						: undefined,
			});
		}
		rider.rope.update(
			walker.leadHand,
			model.leadAnchor,
			walker.root.visible && rider.horseMode === 'led',
		);
	}

	return {
		riders,
		paths,
		/** The other riders' horses, as solids for everyone else. */
		barriers(): Solid[] {
			return riders.map((rider) => horseBarrier(rider.npc.state));
		},
		/** Ridden horses for the minimap, and horses standing or being led. */
		markers() {
			return {
				ridden: riders
					.filter((rider) => rider.where === 'riding')
					.map((rider) => rider.npc.state),
				standing: riders
					.filter((rider) => rider.where !== 'riding')
					.map((rider) => rider.npc.state),
			};
		},
		update(
			dt: number,
			elapsed: number,
			hour: number,
			obstacles: Obstacle[],
			player: readonly Solid[],
			waiting: readonly Solid[],
			frustum: THREE.Frustum,
			camera: THREE.Camera,
		) {
			const traffic: Traffic[] = riders
				.filter((rider) => rider.horseMode === 'ridden')
				.map((rider) => ({ ...rider.npc.state, rank: rider.rank }));
			for (const rider of riders) {
				const night = hour >= rider.homeHour || hour < rider.wakeHour;
				// A game that starts at night finds everyone already home.
				if (!rider.started) {
					rider.started = true;
					if (night) sendHome(rider);
				}
				if (
					night &&
					rider.activity !== 'home' &&
					(rider.activity !== 'morning' || (!rider.task && !rider.plan.length))
				)
					goHome(rider);
				else if (
					!night &&
					rider.where === 'inside' &&
					rider.activity === 'home' &&
					!rider.task &&
					!rider.plan.length
				) {
					rider.activity = 'morning';
					rider.plan = planMorning(rider);
				}
				if (!rider.task) {
					const next = rider.plan.shift();
					if (next) rider.task = next();
					else if (rider.where === 'riding') {
						rider.plan = planDay(rider);
						rider.task = rider.plan.shift()?.();
					}
				}
				rider.stroke = 0;
				rider.model.neck[1].getWorldPosition(neckPoint);
				const standing = riders
					.filter((other) => other !== rider && other.horseMode !== 'ridden')
					.map((other) => horseBarrier(other.npc.state));
				if (
					rider.task &&
					runTask(
						rider,
						rider.task,
						dt,
						obstacles,
						player,
						[...waiting, ...standing],
						traffic.filter((other) => other.rank !== rider.rank),
					)
				)
					rider.task = undefined;
				if (rider.horseMode === 'stabled' && rider.wander) {
					// A stabled horse potters about its stall like the others.
					const motion = stepWander(
						rider.npc.state,
						rider.wander,
						dt,
						stallSolids.get(rider.home.stable)!,
						undefined,
						random,
					);
					rider.horseTurn = motion.turn;
					Object.assign(rider.head, {
						graze: motion.graze,
						yaw: motion.look,
						chew: motion.chew,
						rest: motion.rest,
					});
				} else if (rider.horseMode !== 'resting')
					Object.assign(rider.head, {
						graze: 0,
						yaw: 0,
						chew: false,
						rest: 0,
					});
				draw(rider, dt, elapsed, frustum, camera);
			}
		},
	};
}
