import * as THREE from 'three';
import {
	createGraph,
	nearestNode,
	resample,
	type Graph,
	type Point,
} from '../game/navigation.ts';
import {
	AISLE_HALF_WIDTH,
	STABLES,
	bayCenter,
	halfDepth,
} from './stable-layout.ts';
import {
	ARENA,
	BRIDLEWAY,
	CLUBHOUSE,
	PASTURE,
	RACE_TRACK,
	raceTrackPoint,
} from './layout.ts';
import type { Stall } from './roster.ts';

/** The bridleway loop, sampled as it is drawn and ridden. */
export function bridlewayPoints(): Point[] {
	const curve = new THREE.CatmullRomCurve3(
		BRIDLEWAY.map((p) => new THREE.Vector3(p.x, 0, p.z)),
		true,
	);
	return curve.getPoints(240).map((p) => ({ x: p.x, z: p.z }));
}

/** Points along a straight line, every `step` metres, excluding its end. */
function line(a: Point, b: Point, step = 2) {
	const count = Math.max(
		1,
		Math.round(Math.hypot(b.x - a.x, b.z - a.z) / step),
	);
	return Array.from({ length: count }, (_, i) => ({
		x: a.x + ((b.x - a.x) * i) / count,
		z: a.z + ((b.z - a.z) * i) / count,
	}));
}

/** An arc round (x, z) from `start` to `end` radians; sin gives x, cos gives z. */
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

/** The yard door of a stable: outside on the apron and just inside the gable. */
function doors(id: Stall['stable']) {
	const spec = STABLES.find((s) => s.id === id)!;
	// Riders use the door that faces the yard between the stables.
	const end = spec.z < 20 ? 1 : -1,
		depth = halfDepth(spec);
	return {
		outside: { x: spec.x, z: spec.z + end * (depth + 4) },
		inside: { x: spec.x, z: spec.z + end * (depth - 2) },
	};
}

/**
 * Walking through a stable to a stall and in: where the handler stands in the
 * aisle, the doorway, the middle of the stall and the way the horse then faces.
 */
export function stallAccess(stall: Stall) {
	const spec = STABLES.find((s) => s.id === stall.stable)!;
	const z = spec.z + bayCenter(spec, stall.bay),
		side = stall.side;
	const { outside, inside } = doors(stall.stable);
	return {
		outside,
		inside,
		/** The aisle in front of the stall door. */
		aisle: { x: spec.x, z },
		/** Where the handler waits, across the aisle from the door. */
		handler: { x: spec.x - side * 2.2, z: z + (inside.z > z ? 1.2 : -1.2) },
		doorway: { x: spec.x + side * (AISLE_HALF_WIDTH + 0.2), z },
		stall: { x: spec.x + side * 6.2, z },
		/** Facing the aisle, like every horse waiting in its stall. */
		face: (-side * Math.PI) / 2,
	};
}

/**
 * The network the other riders use: the bridleway loop and spurs to the
 * stables, the clubhouse, the arena, the racecourse and the pasture gate.
 */
export function createPaths() {
	const trail = bridlewayPoints();
	const loop = resample([...trail, trail[0]], 6).slice(0, -1);
	const nodes: (Point & { name: string })[] = loop.map((p, i) => ({
		...p,
		name: `bw${i}`,
	}));
	const edges: [string, string][] = loop.map((_, i) => [
		`bw${i}`,
		`bw${(i + 1) % loop.length}`,
	]);
	/** A spur of named points, joined to the bridleway at its nearest node. */
	function spur(points: (Point & { name: string })[]) {
		const graph = createGraph(nodes.slice(0, loop.length), []);
		const join = nearestNode(graph, points[0].x, points[0].z);
		nodes.push(...points);
		edges.push([`bw${join}`, points[0].name]);
		for (let i = 1; i < points.length; i++)
			edges.push([points[i - 1].name, points[i].name]);
	}
	const main = doors('main'),
		linden = doors('linden');
	spur([
		{ name: 'yard', x: -38, z: 25.5 },
		{ name: 'main-out', ...main.outside },
		{ name: 'main-in', ...main.inside },
	]);
	spur([
		{ name: 'linden-out', ...linden.outside },
		{ name: 'linden-in', ...linden.inside },
	]);
	spur([
		{ name: 'club-walk', x: -54.5, z: 36 },
		{ name: 'club', x: CLUBHOUSE.door.x + 1.2, z: CLUBHOUSE.door.z },
	]);
	spur([
		{ name: 'arena-gate', x: 0, z: 25 },
		{ name: 'arena-in', x: 0, z: 16 },
	]);
	const gateZ = RACE_TRACK.z - RACE_TRACK.radius - RACE_TRACK.halfWidth;
	spur([
		{ name: 'race-path', x: 48, z: 52 },
		{ name: 'race-path2', x: 56, z: 64 },
		{ name: 'race-gate', x: RACE_TRACK.gateX, z: gateZ - 3 },
		{ name: 'race-in', x: RACE_TRACK.gateX, z: gateZ + 3 },
	]);
	spur([
		{ name: 'pasture-path', x: 80, z: -8 },
		{
			name: 'pasture-gate',
			x: PASTURE.x - PASTURE.halfWidth - 3,
			z: PASTURE.z - 5.5,
		},
	]);
	const graph = createGraph(nodes, edges);
	// Up the arena's centre line over the three uprights, back over the oxer.
	const north = ARENA.z - ARENA.halfDepth + 9,
		south = ARENA.z + ARENA.halfDepth - 9;
	const arena = [
		...line({ x: 0, z: south }, { x: 0, z: north }),
		...bend(6, north, 6, Math.PI + Math.PI / 2, Math.PI / 2),
		...line({ x: 12, z: north }, { x: 12, z: south }),
		...bend(6, south, 6, Math.PI / 2, -Math.PI / 2),
	];
	const race = (lane: number) =>
		Array.from({ length: 160 }, (_, i) => raceTrackPoint(i / 160, lane));
	// Grassy verges beside the bridleway where riders stop for a break,
	// just off the track on the side away from the middle of the grounds.
	const centre = trail.reduce(
		(sum, p) => ({
			x: sum.x + p.x / trail.length,
			z: sum.z + p.z / trail.length,
		}),
		{ x: 0, z: 0 },
	);
	const restSpots = trail
		.filter((_, i) => i % 24 === 12)
		.map((p, i) => {
			const next = trail[(trail.indexOf(p) + 1) % trail.length];
			const heading = Math.atan2(next.x - p.x, next.z - p.z);
			const out = Math.hypot(p.x - centre.x, p.z - centre.z);
			return {
				name: `rest${i}`,
				x: p.x + ((p.x - centre.x) / out) * 3.4,
				z: p.z + ((p.z - centre.z) / out) * 3.4,
				heading,
			};
		});
	return {
		graph,
		trail,
		loops: {
			'race-inner': race(-2),
			'race-outer': race(2),
			trail,
			arena,
		},
		/** Where each loop is joined and left, as graph nodes. */
		entries: {
			'race-inner': 'race-in',
			'race-outer': 'race-in',
			trail: '',
			arena: 'arena-in',
		},
		restSpots,
		/** Where riders stop to watch the horses on the pasture. */
		pastureView: { x: 85, z: -2.5, heading: Math.PI / 2 },
		/** Graph node outside the yard door of a stable. */
		stableNode: (id: Stall['stable']) =>
			id === 'main' ? 'main-in' : `${id}-in`,
	};
}

export type Paths = ReturnType<typeof createPaths>;
export type LoopName = keyof Paths['loops'];
export type { Graph };
