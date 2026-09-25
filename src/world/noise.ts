/** Deterministic, tileable value noise for procedural textures and scenery placement. */

function hash(x: number, y: number, seed: number) {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth noise in [0, 1). Lattice coordinates wrap at `period`, so textures tile. */
export function valueNoise(x: number, y: number, period: number, seed = 0) {
	const x0 = Math.floor(x),
		y0 = Math.floor(y);
	const fx = fade(x - x0),
		fy = fade(y - y0);
	const wrap = (v: number) => ((v % period) + period) % period;
	const ax = wrap(x0),
		bx = wrap(x0 + 1),
		ay = wrap(y0),
		by = wrap(y0 + 1);
	const top =
		hash(ax, ay, seed) + (hash(bx, ay, seed) - hash(ax, ay, seed)) * fx;
	const bottom =
		hash(ax, by, seed) + (hash(bx, by, seed) - hash(ax, by, seed)) * fx;
	return top + (bottom - top) * fy;
}

/** Fractal noise over a unit tile (u, v in [0, 1)); `frequency` counts cells per tile. */
export function fbm(
	u: number,
	v: number,
	frequency: number,
	octaves = 4,
	seed = 0,
	gain = 0.5,
) {
	let sum = 0,
		amplitude = 1,
		total = 0;
	for (let octave = 0; octave < octaves; octave++) {
		const period = frequency << octave;
		sum +=
			valueNoise(u * period, v * period, period, seed + octave * 101) *
			amplitude;
		total += amplitude;
		amplitude *= gain;
	}
	return sum / total;
}

/** Untiled fractal noise for world coordinates in metres. */
export function worldNoise(x: number, z: number, scale: number, seed = 0) {
	const period = 1 << 20;
	let sum = 0,
		amplitude = 1,
		total = 0;
	for (let octave = 0; octave < 3; octave++) {
		const f = (1 << octave) / scale;
		sum +=
			valueNoise(x * f + 512, z * f + 512, period, seed + octave * 37) *
			amplitude;
		total += amplitude;
		amplitude *= 0.5;
	}
	return sum / total;
}

/** Seeded linear congruential generator matching the scenery's original placement sequence. */
export function random(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}
