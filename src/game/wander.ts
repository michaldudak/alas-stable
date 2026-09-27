import type { GameState, Solid } from './types.ts';
import { HORSE_COLLISION_RADIUS, WORLD_RADIUS } from './tuning.ts';

/** A rectangle a waiting horse never leaves by itself, such as its stall. */
export interface Enclosure {
	x: number;
	z: number;
	halfWidth: number;
	halfDepth: number;
}

export type WanderMode =
	'idle' | 'graze' | 'walk' | 'attend' | 'treat' | 'follow';

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
	/** Seconds the horse keeps following the person who gave it a treat. */
	affection: number;
}

/** How long a horse munches a treat, and then how long it follows its friend. */
export const TREAT_TIME = 3.2;
export const FOLLOW_TIME = 25;

/** The horse takes a treat from the person's hand, then follows them for a while. */
export function feed(wander: Wander) {
	wander.mode = 'treat';
	wander.timer = TREAT_TIME;
	wander.affection = FOLLOW_TIME;
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
		affection: 0,
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
	wander.affection = 0;
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

/**
 * Grass within reach of the muzzle: not through a stall front or a fence,
 * where a lowered head would pass through boards and rails.
 */
function canGraze(wander: Wander, horse: GameState, solids: readonly Solid[]) {
	if (!wander.grassy) return false;
	const x = horse.x + Math.sin(horse.heading) * 2.3,
		z = horse.z + Math.cos(horse.heading) * 2.3;
	const enclosure = wander.enclosure;
	if (
		enclosure &&
		(Math.abs(x - enclosure.x) > enclosure.halfWidth - 0.3 ||
			Math.abs(z - enclosure.z) > enclosure.halfDepth - 0.3)
	)
		return false;
	return !solids.some(
		(s) =>
			Math.abs(x - s.x) < s.w / 2 + 0.3 && Math.abs(z - s.z) < s.d / 2 + 0.3,
	);
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
	const bearing = person
		? angleTo(horse.heading, Math.atan2(person.x - horse.x, person.z - horse.z))
		: 0;
	const friendly = wander.mode === 'treat' || wander.mode === 'follow';
	if (near && wander.mode !== 'attend' && !friendly) {
		wander.mode = 'attend';
		wander.timer = 0;
	}
	if (wander.mode === 'treat') {
		// Munching from the person's hand, head turned towards it.
		wander.look = Math.max(-1.1, Math.min(1.1, bearing));
		if (wander.timer <= 0) wander.mode = person ? 'follow' : 'idle';
	} else if (wander.mode === 'follow') {
		wander.affection -= dt;
		if (!person || wander.affection <= 0) {
			// Settle down wherever the walk together ended.
			wander.anchor = { x: horse.x, z: horse.z };
			wander.mode = 'idle';
			wander.timer = 2 + random() * 3;
		} else {
			const distance = Math.hypot(person.x - horse.x, person.z - horse.z);
			wander.look = Math.max(-1.1, Math.min(1.1, bearing)) * 0.6;
			if (distance > 3.4) {
				turn = Math.max(-1, Math.min(1, bearing * 1.6));
				targetSpeed =
					Math.abs(bearing) < 1.2 ? (distance > 7 ? 2.6 : 1.5) : 0.35;
			} else if (Math.abs(bearing) > 1.2) turn = Math.sign(bearing) * 0.5;
		}
	} else if (wander.mode === 'attend') {
		// Stop and watch the person, turning the head and, if needed, the body.
		if (!near) {
			wander.mode = 'idle';
			wander.timer = 1.5 + random() * 2;
		} else {
			wander.look = Math.max(-1.1, Math.min(1.1, bearing));
			if (Math.abs(bearing) > 1.5) turn = Math.sign(bearing) * 0.45;
		}
	} else if (wander.mode === 'walk') {
		const dx = wander.target.x - horse.x,
			dz = wander.target.z - horse.z;
		const distance = Math.hypot(dx, dz);
		const error = angleTo(horse.heading, Math.atan2(dx, dz));
		wander.look = error * 0.3;
		if (distance < 0.5 || wander.timer <= 0) {
			wander.mode =
				canGraze(wander, horse, solids) && random() < 0.7 ? 'graze' : 'idle';
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
			if (roll < 0.45 && canGraze(wander, horse, solids)) {
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
		if (wander.mode !== 'follow') {
			wander.mode = 'idle';
			wander.timer = 1 + random() * 2;
		}
	} else {
		horse.x = x;
		horse.z = z;
	}
	horse.gait = horse.speed > 0.05 ? 1 : 0;
	return {
		turn,
		// Taking a treat lowers the head to the person's hand.
		graze: wander.mode === 'graze' ? 1 : wander.mode === 'treat' ? 0.5 : 0,
		look: wander.look,
		chew: wander.mode === 'graze' || wander.mode === 'treat',
	};
}
