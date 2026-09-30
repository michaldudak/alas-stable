import type { GameState, Obstacle } from '../game/types.ts';
import { context2d } from '../platform/dom.ts';
import {
	STABLES,
	STABLE_HALF_WIDTH,
	AISLE_HALF_WIDTH,
	halfDepth,
} from '../world/stable-layout.ts';
import { ARENA, CLUBHOUSE, PASTURE, RACE_TRACK } from '../world/layout.ts';
import { WORLD_RADIUS } from '../game/tuning.ts';
import { REGIONS, type RegionId } from '../game/regions.ts';
import type { RigPose } from '../game/trailer.ts';
import { BEACH, MOUNTAINS } from '../world/region-layout.ts';

const SIZE = 180;
/** Pixels per metre; the map scrolls with the player. */
const SCALE = 0.72;

export function createMinimap(
	canvas: HTMLCanvasElement,
	world: {
		points: readonly { x: number; z: number }[];
		obstacles: readonly Obstacle[];
	},
) {
	const map = context2d(canvas);
	function draw(
		state: Readonly<GameState>,
		horses: readonly Readonly<GameState>[] = [],
		riders: readonly Readonly<GameState>[] = [],
		region: RegionId = 'home',
		rig?: RigPose,
	) {
		// Keep the view inside the map so its edge never shows empty space.
		const area = REGIONS[region];
		const reach = area.radius + 20 - SIZE / 2 / SCALE;
		const cx = Math.max(area.x - reach, Math.min(area.x + reach, state.x)),
			cz = Math.max(area.z - reach, Math.min(area.z + reach, state.z));
		const point = (x: number, z: number): [number, number] => [
			SIZE / 2 + (x - cx) * SCALE,
			SIZE / 2 + (z - cz) * SCALE,
		];
		const rect = (x: number, z: number, w: number, d: number) =>
			map.fillRect(...point(x - w, z - d), w * 2 * SCALE, d * 2 * SCALE);
		map.clearRect(0, 0, SIZE, SIZE);
		if (region === 'beach') drawBeach(point);
		else if (region === 'mountains') drawMountains(point, rect);
		else drawHome(point, rect);
		for (const [list, fill] of [
			[horses, '#825632'],
			[riders, '#46607a'],
		] as const)
			for (const horse of list) {
				map.fillStyle = fill;
				map.strokeStyle = '#fff9e9';
				map.lineWidth = 2;
				map.beginPath();
				map.arc(...point(horse.x, horse.z), 4.5, 0, Math.PI * 2);
				map.fill();
				map.stroke();
			}
		// The car and its trailer, drawn larger than life so they stand out.
		if (rig) {
			map.save();
			map.translate(...point(rig.x, rig.z));
			map.rotate(-rig.heading);
			map.fillStyle = '#3f5f4a';
			map.strokeStyle = '#fff9e9';
			map.lineWidth = 1.5;
			map.beginPath();
			map.roundRect(-4, 1, 8, 10, 2);
			map.fill();
			map.stroke();
			map.fillStyle = '#dfe3e4';
			map.beginPath();
			map.roundRect(-4.5, -11, 9, 10, 2);
			map.fill();
			map.stroke();
			map.restore();
		}
		map.save();
		map.translate(...point(state.x, state.z));
		map.rotate(-state.heading);
		map.fillStyle = '#fff9e9';
		map.strokeStyle = '#345b4a';
		map.lineWidth = 2.5;
		map.beginPath();
		map.moveTo(0, 8);
		map.lineTo(-5, -5);
		map.lineTo(0, -2);
		map.lineTo(5, -5);
		map.closePath();
		map.fill();
		map.stroke();
		map.restore();
	}
	type Project = (x: number, z: number) => [number, number];
	/** Sand, the sea to the west, the dunes and the car park to the east. */
	function drawBeach(point: Project) {
		const [shore] = point(BEACH.x + BEACH.shore, 0);
		const [dunes] = point(BEACH.x + BEACH.dunes, 0);
		const [park, top] = point(
			BEACH.x + BEACH.parkEnd,
			BEACH.z - BEACH.gapHalfWidth,
		);
		const [, bottom] = point(0, BEACH.z + BEACH.gapHalfWidth);
		map.fillStyle = '#ead9ab';
		map.fillRect(0, 0, SIZE, SIZE);
		map.fillStyle = '#7fb6c4';
		map.fillRect(0, 0, Math.max(0, shore), SIZE);
		map.fillStyle = '#a3cfd3';
		map.fillRect(shore - 4, 0, 4, SIZE);
		map.fillStyle = '#c6c28b';
		map.fillRect(dunes, 0, SIZE, SIZE);
		map.fillStyle = '#6f8d58';
		map.fillRect(park + 12, 0, SIZE, SIZE);
		map.fillStyle = '#d8c9a0';
		map.fillRect(dunes, top, park - dunes, bottom - top);
		const [pierEnd, pierY] = point(
			BEACH.x + BEACH.pier.end,
			BEACH.z + BEACH.pier.z,
		);
		const [pierStart] = point(BEACH.x - 14, 0);
		map.strokeStyle = '#8a6c4c';
		map.lineWidth = BEACH.pier.halfWidth * 2 * SCALE;
		map.beginPath();
		map.moveTo(pierStart, pierY);
		map.lineTo(pierEnd, pierY);
		map.stroke();
	}
	/** The snowy valley, its trail, the hut and the frozen tarn. */
	function drawMountains(
		point: Project,
		rect: (x: number, z: number, w: number, d: number) => void,
	) {
		const { x, z, radius, hut, tarn } = MOUNTAINS;
		map.fillStyle = '#8f9aa6';
		map.fillRect(0, 0, SIZE, SIZE);
		map.fillStyle = '#eef2f6';
		map.beginPath();
		map.arc(...point(x, z), radius * SCALE, 0, Math.PI * 2);
		map.fill();
		map.strokeStyle = '#cdd5de';
		map.lineWidth = 3;
		map.beginPath();
		for (let i = 0; i <= 48; i++) {
			const a = (i / 48) * Math.PI * 2;
			const r = 92 + 14 * Math.sin(a * 3 + 1);
			const [px, py] = point(x + Math.sin(a) * r, z + Math.cos(a) * r);
			if (i) map.lineTo(px, py);
			else map.moveTo(px, py);
		}
		map.stroke();
		map.fillStyle = '#b9d4e3';
		map.beginPath();
		map.ellipse(
			...point(x + tarn.x, z + tarn.z),
			tarn.radiusX * SCALE,
			tarn.radiusZ * SCALE,
			0,
			0,
			Math.PI * 2,
		);
		map.fill();
		map.fillStyle = '#7a5a3e';
		rect(x + hut.x, z + hut.z, hut.halfWidth, hut.halfDepth);
	}
	/** The stable yard with its stables, arena, racecourse and pasture. */
	function drawHome(
		point: Project,
		rect: (x: number, z: number, w: number, d: number) => void,
	) {
		map.fillStyle = '#7d9460';
		map.fillRect(0, 0, SIZE, SIZE);
		map.fillStyle = '#aabc89';
		map.beginPath();
		map.arc(...point(0, 0), WORLD_RADIUS * SCALE, 0, Math.PI * 2);
		map.fill();
		// Woodland to the north.
		map.save();
		map.clip();
		map.fillStyle = '#648562';
		map.fillRect(0, 0, SIZE, point(0, -42)[1]);
		map.restore();
		map.fillStyle = '#b9ca8f';
		rect(PASTURE.x, PASTURE.z, PASTURE.halfWidth, PASTURE.halfDepth);
		map.strokeStyle = '#7a5d40';
		map.lineWidth = 1.5;
		map.strokeRect(
			...point(PASTURE.x - PASTURE.halfWidth, PASTURE.z - PASTURE.halfDepth),
			PASTURE.halfWidth * 2 * SCALE,
			PASTURE.halfDepth * 2 * SCALE,
		);
		map.strokeStyle = '#e8d7b0';
		map.lineWidth = 5;
		map.beginPath();
		world.points.forEach((p, i) => {
			const [x, y] = point(p.x, p.z);
			if (i) map.lineTo(x, y);
			else map.moveTo(x, y);
		});
		map.closePath();
		map.stroke();
		// Racecourse: a sand oval with a grass infield.
		map.strokeStyle = '#e4cda5';
		map.lineWidth = RACE_TRACK.halfWidth * 2 * SCALE;
		map.beginPath();
		const r = RACE_TRACK.radius * SCALE;
		const [wx, wy] = point(RACE_TRACK.x - RACE_TRACK.straight, RACE_TRACK.z);
		const [ex] = point(RACE_TRACK.x + RACE_TRACK.straight, RACE_TRACK.z);
		map.arc(wx, wy, r, Math.PI / 2, (Math.PI * 3) / 2);
		map.lineTo(ex, wy - r);
		map.arc(ex, wy, r, -Math.PI / 2, Math.PI / 2);
		map.closePath();
		map.stroke();
		map.fillStyle = '#e4cda5';
		rect(ARENA.x, ARENA.z, ARENA.halfWidth, ARENA.halfDepth);
		for (const spec of STABLES) {
			map.fillStyle = spec.id === 'linden' ? '#a2524a' : '#a96a4f';
			rect(spec.x, spec.z, STABLE_HALF_WIDTH, halfDepth(spec));
			map.fillStyle = '#eadcbb';
			rect(spec.x, spec.z, AISLE_HALF_WIDTH, halfDepth(spec));
		}
		map.fillStyle = '#c9aa8a';
		rect(CLUBHOUSE.x, CLUBHOUSE.z, CLUBHOUSE.halfWidth, CLUBHOUSE.halfDepth);
		map.strokeStyle = '#7b8f7d';
		map.lineWidth = 2;
		for (const o of world.obstacles) {
			const angle = o.angle ?? 0;
			const dx = Math.cos(angle) * (o.width / 2),
				dz = -Math.sin(angle) * (o.width / 2);
			map.beginPath();
			map.moveTo(...point(o.x - dx, o.z - dz));
			map.lineTo(...point(o.x + dx, o.z + dz));
			map.stroke();
		}
	}
	return { draw };
}
