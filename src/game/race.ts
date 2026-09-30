/** Rules of a one-lap race: progress round the course, checkpoints, places. */

export type Point = { x: number; z: number };

/** How far round the course a point is, 0–1, from the nearest sample. */
export function courseProgress(
	samples: readonly Point[],
	x: number,
	z: number,
) {
	let best = 0,
		distance = Infinity;
	samples.forEach((p, i) => {
		const d = (p.x - x) ** 2 + (p.z - z) ** 2;
		if (d < distance) {
			distance = d;
			best = i;
		}
	});
	return best / samples.length;
}

/** A runner's lap: where it is and which quarters it has passed. */
export interface Lap {
	/** Progress round the course, 0–1. */
	at: number;
	/** Quarter posts passed in order: 0 to 3. */
	posts: number;
	finished: boolean;
}

export const startLap = (): Lap => ({ at: 0, posts: 0, finished: false });

/**
 * Moves a runner on to `at`. The quarter posts must be passed in order, so
 * cutting across the infield or turning back does not count; crossing the
 * line after all three finishes the lap. Returns true on finishing.
 */
export function advanceLap(lap: Lap, at: number) {
	if (lap.finished) return false;
	const before = lap.at;
	lap.at = at;
	const post = (lap.posts + 1) / 4;
	if (lap.posts < 3 && at >= post && at < post + 0.12) lap.posts++;
	if (lap.posts === 3 && before > 0.85 && at < 0.15) {
		lap.finished = true;
		return true;
	}
	return false;
}

/** Distance covered, in laps, for ranking runners still going. */
export const lapDistance = (lap: Lap) =>
	lap.finished ? 1 : lap.posts === 0 && lap.at > 0.5 ? 0 : lap.at;

/** 1-based place of `runner` among `everyone` (which includes it). */
export function place(
	runner: Lap,
	everyone: readonly Lap[],
	order: readonly Lap[],
) {
	if (runner.finished) return order.indexOf(runner) + 1;
	const ahead = everyone.filter(
		(other) => other !== runner && lapDistance(other) > lapDistance(runner),
	).length;
	return ahead + 1;
}

/** Formats seconds as m:ss.s. */
export function formatTime(seconds: number) {
	const minutes = Math.floor(seconds / 60);
	const rest = seconds - minutes * 60;
	return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
