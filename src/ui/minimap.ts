import type { GameState, Obstacle } from '../game/types.ts';
import { context2d } from '../platform/dom.ts';
import { STABLE } from '../world/stable-layout.ts';

export function createMinimap(
	canvas: HTMLCanvasElement,
	world: {
		points: readonly { x: number; z: number }[];
		obstacles: readonly Obstacle[];
	},
) {
	const map = context2d(canvas);
	function draw(state: Readonly<GameState>) {
		map.clearRect(0, 0, 180, 180);
		map.fillStyle = '#aabc89';
		map.fillRect(0, 0, 180, 180);
		const point = (x: number, z: number): [number, number] => [
			90 + x * 0.7,
			90 + z * 0.7,
		];
		map.fillStyle = '#648562';
		map.beginPath();
		map.ellipse(88, 39, 70, 28, 0, 0, 7);
		map.fill();
		map.strokeStyle = '#e8d7b0';
		map.lineWidth = 5;
		map.beginPath();
		world.points.forEach((p, i) => {
			const [x, y] = point(p.x, p.z);
			if (i) map.lineTo(x, y);
			else map.moveTo(x, y);
		});
		map.stroke();
		map.fillStyle = '#e4cda5';
		map.fillRect(...point(-16, -38), 22.4, 40.6);
		map.fillStyle = '#a96a4f';
		map.fillRect(...point(STABLE.x - 12, STABLE.z - 13), 16.8, 18.2);
		map.fillStyle = '#eadcbb';
		map.fillRect(...point(STABLE.x - 3.7, STABLE.z - 13), 5.18, 18.2);
		map.strokeStyle = '#7b8f7d';
		map.lineWidth = 2;
		for (const o of world.obstacles) {
			map.beginPath();
			map.moveTo(...point(-4, o.z));
			map.lineTo(...point(4, o.z));
			map.stroke();
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
	return { draw };
}
