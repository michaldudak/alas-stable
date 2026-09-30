import type { GameState, Solid } from './types.ts';

/** Where the car and its horse trailer stand, facing along `heading`. */
export interface RigPose {
	x: number;
	z: number;
	heading: number;
}

/**
 * Car and trailer in the rig's own frame: +Z points ahead, the origin is the
 * tow hitch, and +X is the driver's (left) side.
 */
export const RIG = {
	car: { halfWidth: 1.02, front: 5.55, back: 0.7 },
	trailer: { halfWidth: 1.08, front: -1.3, back: -5.4, floor: 0.42 },
	/** The rear ramp is down, reaching the ground this far behind the hitch. */
	ramp: { halfWidth: 0.85, end: -7.3 },
	/** The middle of the horse's stall, where it travels facing ahead. */
	stall: -3.45,
	driverDoor: { x: 1.55, z: 3.35 },
};

/** A point given in the rig's frame, in world coordinates. */
export function rigPoint(pose: RigPose, x: number, z: number) {
	const cos = Math.cos(pose.heading),
		sin = Math.sin(pose.heading);
	return { x: pose.x + x * cos + z * sin, z: pose.z - x * sin + z * cos };
}

/** A point in world coordinates, in the rig's frame. */
export function rigLocal(pose: RigPose, x: number, z: number) {
	const dx = x - pose.x,
		dz = z - pose.z;
	const cos = Math.cos(pose.heading),
		sin = Math.sin(pose.heading);
	return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/** Axis-aligned bounds of a box in the rig's frame; rigs park square to the axes. */
function box(
	pose: RigPose,
	halfWidth: number,
	front: number,
	back: number,
): Solid {
	const corners = [
		rigPoint(pose, -halfWidth, back),
		rigPoint(pose, halfWidth, front),
	];
	const x0 = Math.min(corners[0].x, corners[1].x),
		x1 = Math.max(corners[0].x, corners[1].x),
		z0 = Math.min(corners[0].z, corners[1].z),
		z1 = Math.max(corners[0].z, corners[1].z);
	return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

/** The car, the trailer and its lowered ramp, as solids. */
export function rigSolids(pose: RigPose): Solid[] {
	const { car, trailer, ramp } = RIG;
	return [
		box(pose, car.halfWidth, car.front, car.back),
		box(pose, trailer.halfWidth, trailer.front, trailer.back),
		box(pose, 0.2, car.back, trailer.front),
		box(pose, ramp.halfWidth, trailer.back, ramp.end),
	];
}

/** Height of the trailer floor or the ramp under a point, 0 elsewhere. */
export function floorHeight(pose: RigPose, x: number, z: number) {
	const local = rigLocal(pose, x, z);
	const { trailer, ramp } = RIG;
	if (Math.abs(local.x) > trailer.halfWidth) return 0;
	if (local.z >= trailer.back && local.z <= trailer.front) return trailer.floor;
	if (local.z < trailer.back && local.z > ramp.end)
		return (trailer.floor * (local.z - ramp.end)) / (trailer.back - ramp.end);
	return 0;
}

/** Where a led horse lines up behind the ramp before walking in. */
export function rampApproach(pose: RigPose) {
	return rigPoint(pose, 0, RIG.ramp.end - 1.6);
}

/**
 * Whether a led horse is close enough behind the trailer to walk in by
 * itself: within `reach` of the ramp and not beside the car.
 */
export function readyToBoard(pose: RigPose, horse: GameState, reach = 4.2) {
	const approach = rampApproach(pose);
	const local = rigLocal(pose, horse.x, horse.z);
	return (
		Math.hypot(horse.x - approach.x, horse.z - approach.z) < reach &&
		local.z < RIG.trailer.back
	);
}

/** From behind the ramp, up it and into the stall. */
export function boardingPath(pose: RigPose) {
	return [
		rampApproach(pose),
		rigPoint(pose, 0, RIG.ramp.end - 0.2),
		rigPoint(pose, 0, RIG.trailer.back - 0.2),
		rigPoint(pose, 0, RIG.stall),
	];
}

/** Backwards out of the stall, down the ramp and clear of it. */
export function unloadingPath(pose: RigPose) {
	return [
		rigPoint(pose, 0, RIG.trailer.back + 0.6),
		rigPoint(pose, 0, RIG.ramp.end - 0.4),
		rigPoint(pose, 0, RIG.ramp.end - 2.6),
	];
}

/** The horse standing in its stall, facing the car. */
export function stallPose(pose: RigPose) {
	return {
		...rigPoint(pose, 0, RIG.stall),
		heading: pose.heading,
		height: RIG.trailer.floor,
	};
}

/**
 * Walks a horse along a path at a steady pace, forwards (turning to face each
 * point) or backwards (keeping its heading). Returns true once it arrives.
 */
export function stepAlong(
	state: GameState,
	path: { x: number; z: number }[],
	dt: number,
	pose: RigPose,
	backwards = false,
) {
	const pace = backwards ? 0.9 : 1.4;
	let budget = pace * dt;
	while (budget > 0 && path.length) {
		const next = path[0];
		const dx = next.x - state.x,
			dz = next.z - state.z,
			distance = Math.hypot(dx, dz);
		if (distance < 0.02) {
			path.shift();
			continue;
		}
		if (!backwards) {
			const want = Math.atan2(dx, dz);
			const error = Math.atan2(
				Math.sin(want - state.heading),
				Math.cos(want - state.heading),
			);
			state.heading += error * Math.min(1, dt * 5);
		}
		const move = Math.min(distance, budget);
		state.x += (dx / distance) * move;
		state.z += (dz / distance) * move;
		budget -= move;
	}
	state.height = floorHeight(pose, state.x, state.z);
	const moving = path.length > 0;
	state.speed = moving ? (backwards ? -pace : pace) : 0;
	state.gait = moving ? (backwards ? -1 : 1) : 0;
	return !moving;
}
