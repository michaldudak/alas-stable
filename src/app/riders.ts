import * as THREE from 'three';
import { createHorse } from '../horse/model.ts';
import { createHorseAnimation } from '../horse/animation.ts';
import { dressFigure, type Outfit } from '../horse/figure.ts';
import { profile } from '../world/roster.ts';
import {
	createNpc,
	routeFromPoints,
	stepNpc,
	type Route,
} from '../game/npc.ts';
import { horseBarrier } from '../game/herd.ts';
import type { Obstacle, Solid } from '../game/types.ts';
import { ARENA, raceTrackPoint } from '../world/layout.ts';

type RouteName = 'race-inner' | 'race-outer' | 'trail' | 'arena';

const RIDERS: {
	name: string;
	/** Roster ID of the rider's own horse. */
	horse: string;
	route: RouteName;
	/** Share of the route already ridden at the start. */
	start: number;
	pace: number;
	outfit: Outfit;
}[] = [
	{
		name: 'Zosia',
		horse: 'SZAFIR',
		route: 'race-inner',
		start: 0,
		pace: 0.25,
		outfit: { jacket: '#9c3b3b', helmet: '#26211d' },
	},
	{
		name: 'Kuba',
		horse: 'GROM',
		route: 'race-outer',
		start: 0.06,
		pace: 0.05,
		outfit: { jacket: '#c8a23a', helmet: '#3a3a3a', hair: '#2b2018' },
	},
	{
		name: 'Ola',
		horse: 'KARMEL',
		route: 'trail',
		start: 0.55,
		pace: 0,
		outfit: { jacket: '#4c6a8c', helmet: '#7275a3', hair: '#a8773f' },
	},
	{
		name: 'Hania',
		horse: 'KOMETA',
		route: 'arena',
		start: 0,
		pace: 0,
		outfit: { jacket: '#35584c', helmet: '#26211d', hair: '#3a2718' },
	},
];

/** Points along a straight line, every `step` metres, excluding its end. */
function line(
	a: { x: number; z: number },
	b: { x: number; z: number },
	step = 2,
) {
	const count = Math.max(
		1,
		Math.round(Math.hypot(b.x - a.x, b.z - a.z) / step),
	);
	return Array.from({ length: count }, (_, i) => ({
		x: a.x + ((b.x - a.x) * i) / count,
		z: a.z + ((b.z - a.z) * i) / count,
	}));
}

/** A half circle from `start` radians round (x, z), sin → x and cos → z. */
function bend(
	x: number,
	z: number,
	radius: number,
	start: number,
	end: number,
) {
	const count = Math.ceil((Math.abs(end - start) * radius) / 1.5);
	return Array.from({ length: count }, (_, i) => {
		const a = start + ((end - start) * i) / count;
		return { x: x + Math.sin(a) * radius, z: z + Math.cos(a) * radius };
	});
}

function routes(trail: readonly { x: number; z: number }[]) {
	const race = (lane: number) =>
		routeFromPoints(
			Array.from({ length: 160 }, (_, i) => raceTrackPoint(i / 160, lane)),
			3,
		);
	// Up the centre line over the three uprights, back down over the oxer.
	const north = ARENA.z - ARENA.halfDepth + 9,
		south = ARENA.z + ARENA.halfDepth - 9;
	const arena = [
		...line({ x: 0, z: south }, { x: 0, z: north }),
		...bend(6, north, 6, Math.PI + Math.PI / 2, Math.PI / 2),
		...line({ x: 12, z: north }, { x: 12, z: south }),
		...bend(6, south, 6, Math.PI / 2, -Math.PI / 2),
	];
	return {
		'race-inner': race(-2),
		'race-outer': race(2),
		trail: routeFromPoints(trail, 2, 1, 0.5),
		arena: routeFromPoints(arena, 3, 2, 0.3, 4),
	} satisfies Record<RouteName, Route>;
}

/**
 * Other riders out for a ride: two gallop on the racecourse, one trots the
 * bridleway and one schools over the arena jumps. They wait for anyone in
 * their way and head home at night.
 */
export function createRiders(
	scene: THREE.Scene,
	trail: readonly { x: number; z: number }[],
) {
	const paths = routes(trail);
	const riders = RIDERS.map((spec) => {
		const route = paths[spec.route];
		const model = createHorse();
		model.setAppearance(profile(spec.horse)?.appearance ?? {});
		model.root.name = spec.horse;
		model.halter.visible = false;
		model.bridle.visible = true;
		dressFigure(model.rider, spec.outfit);
		scene.add(model.root);
		return {
			...spec,
			model,
			npc: createNpc(route, Math.floor(spec.start * route.points.length)),
			animation: createHorseAnimation(model),
			turn: 0,
			out: true,
		};
	});
	const bounds = new THREE.Sphere();
	return {
		riders,
		/** Horses under the other riders, as solids for everyone else. */
		barriers(): Solid[] {
			return riders
				.filter((rider) => rider.out)
				.map((rider) => horseBarrier(rider.npc.state));
		},
		update(
			dt: number,
			elapsed: number,
			obstacles: Obstacle[],
			player: readonly Solid[],
			waiting: readonly Solid[],
			frustum: THREE.Frustum,
			camera: THREE.Camera,
			night: boolean,
		) {
			const others = riders.map((rider) => horseBarrier(rider.npc.state));
			riders.forEach((rider, i) => {
				const { state } = rider.npc,
					root = rider.model.root;
				bounds.center.set(state.x, 1.8, state.z);
				bounds.radius = 3.6;
				const distance = bounds.center.distanceTo(camera.position);
				const seen = distance < 220 && frustum.intersectsSphere(bounds);
				// Riders only leave or come back where nobody is watching.
				if (rider.out === night && (!seen || distance > 90)) rider.out = !night;
				root.visible = rider.out && seen;
				if (!rider.out) return;
				rider.turn = stepNpc(
					rider.npc,
					dt,
					obstacles,
					[...player, ...others.filter((_, j) => j !== i)],
					rider.pace,
					waiting,
				);
				root.position.set(state.x, state.height, state.z);
				root.rotation.y = state.heading;
				if (root.visible && distance < 120)
					rider.animation.update(
						dt,
						state,
						elapsed,
						rider.turn,
						state.gait ? 1 + rider.pace * 0.3 : 1,
					);
			});
		},
	};
}
