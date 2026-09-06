/** Normalized airborne poses: forelegs fold first, hind legs trail and recover later. */
const frames = [
	[0, 0, 0, 0, 0, 0, 0, 0],
	[0.12, -0.16, 0.72, 0.18, 0.02, -0.3, 0.12, 0.03],
	[0.3, -0.12, 1.03, 0.16, 0.38, -0.38, 0.25, 0.08],
	[0.5, 0.015, 0.98, 0.12, 0.72, -0.14, 0.28, 0.09],
	[0.7, 0.12, 0.48, 0.38, 0.76, 0.02, 0.2, 0.06],
	[0.88, 0.09, 0.08, 0.22, 0.36, 0.08, 0.1, 0.02],
	[1, 0, 0, 0.02, 0.08, 0.02, 0.03, 0],
] as const;
export function sampleJump(progress: number) {
	const p = Math.max(0, Math.min(1, progress));
	const end = frames.findIndex((frame) => frame[0] >= p);
	const a = frames[Math.max(0, end - 1)],
		b = frames[Math.max(0, end)];
	const t = a === b ? 0 : (p - a[0]) / (b[0] - a[0]);
	const smooth = t * t * (3 - 2 * t);
	const value = (i: number) => a[i] + (b[i] - a[i]) * smooth;
	return {
		pitch: value(1),
		frontLift: value(2),
		frontZ: value(3),
		hindLift: value(4),
		hindZ: value(5),
		riderPitch: value(6),
		riderY: value(7),
	};
}
