import type { GameState, Solid } from './types.ts';
import { HORSE_COLLISION_RADIUS, WORLD_RADIUS } from './tuning.ts';

/** A rectangle a waiting horse never leaves by itself, such as its stall. */
export interface Enclosure {
	x: number;
	z: number;
	halfWidth: number;
	halfDepth: number;
}

export type WanderMode = 'idle' | 'graze' | 'walk' | 'attend';

export interface Wander {
	/** Where the horse was left; it strolls around this point. */
	anchor: { x: number; z: number };
	/** How far from the anchor it may stroll. */
	range: number;
	enclosure?: Enclosure;
	mode: WanderMode;
	timer: number;
	target: { x: number; z: number };
	/** Head turn while idling or watching someone. */
	look: number;
	/** Whether the ground here has grass worth nibbling. */
	grassy: boolean;
}

/** Leisurely walking speed while wandering, in metres per second. */
export const STROLL_SPEED = 1.1;
/** A person this close makes a waiting horse stop and look at them. */
export const ATTEND_DISTANCE = 4.5;

export function createWander(
	anchor: { x: number; z: number },
	options: { range?: number; enclosure?: Enclosure; grassy?: boolean } = {},
	random: () => number = Math.random,
): Wander {
	return {
		anchor: { ...anchor },
		range: options.range ?? 5,
		enclosure: options.enclosure,
		mode: 'idle',
		timer: 1 + random() * 4,
		target: { ...anchor },
		look: 0,
		grassy: options.grassy ?? true,
	};
}

/** Leaves a horse to wait here, for example after dismounting or leading. */
export function settle(
	wander: Wander,
	horse: GameState,
	options: { range?: number; enclosure?: Enclosure; grassy?: boolean } = {},
) {
	wander.anchor = { x: horse.x, z: horse.z };
	wander.range = options.range ?? 5;
	wander.enclosure = options.enclosure;
	wander.grassy = options.grassy ?? true;
	wander.mode = 'idle';
	wander.timer = 2 + Math.random() * 3;
	horse.gait = 0;
	horse.speed = 0;
}

const angleTo = (from: number, to: number) =>
	Math.atan2(Math.sin(to - from), Math.cos(to - from));

function inside(enclosure: Enclosure | undefined, x: number, z: number) {
	// The horse's body stays within the walls, not just its centre.
	const margin = HORSE_COLLISION_RADIUS + 0.35;
	return (
		!enclosure ||
		(Math.abs(x - enclosure.x) < enclosure.halfWidth - margin &&
			Math.abs(z - enclosure.z) < enclosure.halfDepth - margin)
	);
}

function blocked(x: number, z: number, solids: readonly Solid[]) {
	if (Math.hypot(x, z) > WORLD_RADIUS - 1) return true;
	for (const s of solids)
		if (
			Math.abs(x - s.x) < s.w / 2 + HORSE_COLLISION_RADIUS &&
			Math.abs(z - s.z) < s.d / 2 + HORSE_COLLISION_RADIUS
		)
			return true;
	return false;
}

function pickTarget(wander: Wander, horse: GameState, random: () => number) {
	for (let attempt = 0; attempt < 8; attempt++) {
		const angle = random() * Math.PI * 2,
			distance = (0.35 + random() * 0.65) * wander.range;
		let x = wander.anchor.x + Math.cos(angle) * distance,
			z = wander.anchor.z + Math.sin(angle) * distance;
		const enclosure = wander.enclosure;
		if (enclosure) {
			const margin = HORSE_COLLISION_RADIUS + 0.6;
			x = Math.min(
				enclosure.x + enclosure.halfWidth - margin,
				Math.max(enclosure.x - enclosure.halfWidth + margin, x),
			);
			z = Math.min(
				enclosure.z + enclosure.halfDepth - margin,
				Math.max(enclosure.z - enclosure.halfDepth + margin, z),
			);
		}
		if (Math.hypot(x - horse.x, z - horse.z) > 1.2) return { x, z };
	}
	return { x: wander.anchor.x, z: wander.anchor.z };
}

/**
 * One step of a waiting horse's life: standing, looking about, grazing and
 * strolling a few metres at a time. Returns the steering used, for animation.
 */
export function stepWander(
	horse: GameState,
	wander: Wander,
	dt: number,
	solids: readonly Solid[],
	person: { x: number; z: number } | undefined,
	random: () => number = Math.random,
) {
	wander.timer -= dt;
	let turn = 0,
		targetSpeed = 0;
	const near =
		person &&
		Math.hypot(person.x - horse.x, person.z - horse.z) < ATTEND_DISTANCE;
	if (near && wander.mode !== 'attend') {
		wander.mode = 'attend';
		wander.timer = 0;
	}
	if (wander.mode === 'attend') {
		// Stop and watch the person, turning only the head.
		if (!near) {
			wander.mode = 'idle';
			wander.timer = 1.5 + random() * 2;
		} else {
			const bearing = Math.atan2(person.x - horse.x, person.z - horse.z);
			wander.look = Math.max(
				-1.1,
				Math.min(1.1, angleTo(horse.heading, bearing)),
			);
		}
	} else if (wander.mode === 'walk') {
		const dx = wander.target.x - horse.x,
			dz = wander.target.z - horse.z;
		const distance = Math.hypot(dx, dz);
		const error = angleTo(horse.heading, Math.atan2(dx, dz));
		wander.look = error * 0.3;
		if (distance < 0.5 || wander.timer <= 0) {
			wander.mode = wander.grassy && random() < 0.7 ? 'graze' : 'idle';
			wander.timer =
				wander.mode === 'graze' ? 7 + random() * 10 : 3 + random() * 5;
		} else {
			turn = Math.max(-1, Math.min(1, error * 1.6));
			// Turn on the spot first when the target lies behind.
			targetSpeed = Math.abs(error) < 1.2 ? STROLL_SPEED : 0.35;
		}
	} else if (wander.mode === 'graze') {
		wander.look *= 1 - Math.min(1, dt * 2);
		// Now and then a grazing horse takes a step to fresh grass.
		if (wander.timer <= 0) {
			wander.mode = 'idle';
			wander.timer = 2 + random() * 4;
		} else if (random() < dt * 0.12) {
			wander.mode = 'walk';
			const ahead = 1.3 + random();
			const x = horse.x + Math.sin(horse.heading) * ahead,
				z = horse.z + Math.cos(horse.heading) * ahead;
			const nearAnchor =
				Math.hypot(x - wander.anchor.x, z - wander.anchor.z) < wander.range;
			wander.target =
				nearAnchor && inside(wander.enclosure, x, z)
					? { x, z }
					: pickTarget(wander, horse, random);
			wander.timer = 4;
		}
	} else {
		if (random() < dt * 0.35) wander.look = (random() - 0.5) * 1.6;
		if (wander.timer <= 0) {
			const roll = random();
			if (roll < 0.45 && wander.grassy) {
				wander.mode = 'graze';
				wander.timer = 8 + random() * 12;
			} else if (roll < 0.85) {
				wander.mode = 'walk';
				wander.target = pickTarget(wander, horse, random);
				wander.timer = 12;
			} else wander.timer = 3 + random() * 4;
		}
	}
	horse.speed += (targetSpeed - horse.speed) * Math.min(1, dt * 3);
	if (Math.abs(horse.speed) < 0.02 && targetSpeed === 0) horse.speed = 0;
	horse.heading += turn * dt * 1.1;
	const x = horse.x + Math.sin(horse.heading) * horse.speed * dt,
		z = horse.z + Math.cos(horse.heading) * horse.speed * dt;
	if (
		horse.speed > 0 &&
		(!inside(wander.enclosure, x, z) || blocked(x, z, solids))
	) {
		horse.speed = 0;
		wander.mode = 'idle';
		wander.timer = 1 + random() * 2;
	} else {
		horse.x = x;
		horse.z = z;
	}
	horse.gait = horse.speed > 0.05 ? 1 : 0;
	return {
		turn,
		graze: wander.mode === 'graze' ? 1 : 0,
		look: wander.look,
	};
}
