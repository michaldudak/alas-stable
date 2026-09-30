import { context2d } from '../platform/dom.ts';
import type { RegionId } from '../game/regions.ts';

/** Where each place sits on the travel map, as fractions of its width and height. */
export const MAP_PINS: Readonly<Record<RegionId, [number, number]>> = {
	home: [0.5, 0.6],
	beach: [0.16, 0.5],
	mountains: [0.52, 0.2],
	hippodrome: [0.83, 0.58],
};

/**
 * Paints an illustrated map of the country around the stable: the sea to
 * the west, snowy peaks to the north, the racecourse to the east, and roads
 * between them, with the car where it is parked.
 */
export function drawTravelMap(canvas: HTMLCanvasElement, current: RegionId) {
	const c = context2d(canvas);
	const w = canvas.width,
		h = canvas.height;
	const at = (id: RegionId): [number, number] => [
		MAP_PINS[id][0] * w,
		MAP_PINS[id][1] * h,
	];
	// Parchment meadows.
	const land = c.createLinearGradient(0, 0, w, h);
	land.addColorStop(0, '#e9e0bf');
	land.addColorStop(1, '#dcd3ad');
	c.fillStyle = land;
	c.fillRect(0, 0, w, h);
	c.fillStyle = '#c9d6a2';
	for (let i = 0; i < 40; i++) {
		const x = ((i * 97) % 100) / 100,
			y = ((i * 61) % 100) / 100;
		c.beginPath();
		c.ellipse(
			x * w,
			y * h,
			30 + (i % 5) * 9,
			16 + (i % 3) * 7,
			i,
			0,
			Math.PI * 2,
		);
		c.fill();
	}
	// The sea along the west coast, with a sandy shore and wave marks.
	c.fillStyle = '#e8d6a6';
	c.beginPath();
	c.moveTo(0, 0);
	for (let y = 0; y <= h; y += h / 12)
		c.lineTo(w * (0.11 + 0.025 * Math.sin(y * 0.05)), y);
	c.lineTo(0, h);
	c.fill();
	c.fillStyle = '#7fb6c4';
	c.beginPath();
	c.moveTo(0, 0);
	for (let y = 0; y <= h; y += h / 12)
		c.lineTo(w * (0.085 + 0.025 * Math.sin(y * 0.05)), y);
	c.lineTo(0, h);
	c.fill();
	c.strokeStyle = '#e8f3f2';
	c.lineWidth = 2;
	for (let i = 0; i < 9; i++) {
		const x = w * 0.03 + (i % 2) * 14,
			y = h * (0.08 + i * 0.1);
		c.beginPath();
		c.arc(x, y, 6, Math.PI * 1.1, Math.PI * 1.9);
		c.arc(x + 12, y, 6, Math.PI * 1.1, Math.PI * 1.9);
		c.stroke();
	}
	// Forests as clusters of little trees.
	const tree = (x: number, y: number, s = 1) => {
		c.fillStyle = '#6f8d58';
		c.beginPath();
		c.moveTo(x, y - 14 * s);
		c.lineTo(x + 7 * s, y);
		c.lineTo(x - 7 * s, y);
		c.fill();
		c.fillStyle = '#6b5139';
		c.fillRect(x - 1.2 * s, y, 2.4 * s, 4 * s);
	};
	for (let i = 0; i < 70; i++) {
		const x = ((i * 53) % 97) / 97,
			y = ((i * 29) % 89) / 89;
		const px = x * w,
			py = y * h;
		const clear = (Object.keys(MAP_PINS) as RegionId[]).every((id) => {
			const [pinX, pinY] = at(id);
			return Math.hypot(px - pinX, py - pinY) > 70;
		});
		if (clear && x > 0.16 && y > 0.3) tree(px, py, 0.8 + (i % 3) * 0.2);
	}
	// Snowy peaks along the north.
	for (let i = 0; i < 9; i++) {
		const x = w * (0.26 + i * 0.07),
			y = h * (0.2 + (i % 2) * 0.05),
			s = 38 + (i % 3) * 12;
		c.fillStyle = '#8a8f96';
		c.beginPath();
		c.moveTo(x - s, y + s * 0.5);
		c.lineTo(x, y - s * 0.7);
		c.lineTo(x + s, y + s * 0.5);
		c.fill();
		c.fillStyle = '#f7f9fc';
		c.beginPath();
		c.moveTo(x - s * 0.36, y - s * 0.19);
		c.lineTo(x, y - s * 0.7);
		c.lineTo(x + s * 0.36, y - s * 0.19);
		c.lineTo(x + s * 0.12, y - s * 0.28);
		c.lineTo(x - s * 0.1, y - s * 0.16);
		c.fill();
	}
	// Roads from the stable to every other place.
	const [hx, hy] = at('home');
	c.strokeStyle = '#a8865e';
	c.lineWidth = 9;
	c.lineCap = 'round';
	for (const id of ['beach', 'mountains', 'hippodrome'] as const) {
		const [x, y] = at(id);
		c.beginPath();
		c.moveTo(hx, hy);
		c.bezierCurveTo((hx + x) / 2, hy + 30, (hx + x) / 2, y - 20, x, y);
		c.stroke();
	}
	c.strokeStyle = '#f3ead0';
	c.lineWidth = 2;
	c.setLineDash([10, 9]);
	for (const id of ['beach', 'mountains', 'hippodrome'] as const) {
		const [x, y] = at(id);
		c.beginPath();
		c.moveTo(hx, hy);
		c.bezierCurveTo((hx + x) / 2, hy + 30, (hx + x) / 2, y - 20, x, y);
		c.stroke();
	}
	c.setLineDash([]);
	// Little pictures of each place.
	const [bx, by] = at('beach');
	c.fillStyle = '#c8453c';
	c.beginPath();
	c.moveTo(bx - 16, by - 34);
	c.lineTo(bx + 16, by - 34);
	c.lineTo(bx, by - 46);
	c.fill();
	c.fillRect(bx - 1, by - 34, 2, 22);
	const [rx, ry] = at('hippodrome');
	c.strokeStyle = '#f7f4ec';
	c.lineWidth = 7;
	c.beginPath();
	c.ellipse(rx, ry - 38, 42, 18, 0, 0, Math.PI * 2);
	c.stroke();
	c.strokeStyle = '#9a7c55';
	c.lineWidth = 2;
	c.stroke();
	c.fillStyle = '#b8453c';
	c.fillRect(rx - 3, ry - 64, 2, 12);
	c.beginPath();
	c.moveTo(rx - 1, ry - 64);
	c.lineTo(rx + 10, ry - 60);
	c.lineTo(rx - 1, ry - 56);
	c.fill();
	// The stable: two red barns.
	for (const [dx, dy] of [
		[-22, -38],
		[8, -44],
	] as const) {
		c.fillStyle = '#a2524a';
		c.fillRect(hx + dx, hy + dy, 22, 13);
		c.fillStyle = '#4c5c57';
		c.beginPath();
		c.moveTo(hx + dx - 3, hy + dy);
		c.lineTo(hx + dx + 11, hy + dy - 9);
		c.lineTo(hx + dx + 25, hy + dy);
		c.fill();
	}
	// The car, parked where the rider is now, beside the place's picture.
	const [px, py] = at(current);
	const cx = px - 62,
		cy = py - 52;
	c.fillStyle = '#3f5f4a';
	c.beginPath();
	c.roundRect(cx - 16, cy + 18, 32, 12, 4);
	c.fill();
	c.fillRect(cx - 9, cy + 11, 18, 9);
	c.fillStyle = '#1f2123';
	for (const dx of [-9, 9]) {
		c.beginPath();
		c.arc(cx + dx, cy + 31, 4, 0, Math.PI * 2);
		c.fill();
	}
	// A compass rose.
	c.save();
	c.translate(w - 34, 34);
	c.fillStyle = '#6b5139';
	c.beginPath();
	c.moveTo(0, -20);
	c.lineTo(6, 0);
	c.lineTo(0, 20);
	c.lineTo(-6, 0);
	c.fill();
	c.fillStyle = '#e9e0bf';
	c.beginPath();
	c.moveTo(0, -20);
	c.lineTo(6, 0);
	c.lineTo(-6, 0);
	c.fill();
	c.font = '600 12px sans-serif';
	c.fillStyle = '#6b5139';
	c.textAlign = 'center';
	c.fillText('N', 0, -24);
	c.restore();
	// A frame.
	c.strokeStyle = '#9a7c55';
	c.lineWidth = 6;
	c.strokeRect(3, 3, w - 6, h - 6);
}
