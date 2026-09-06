import { sampleJump } from './jump-pose.ts';
import { JUMP_DURATION } from './tuning.ts';
import type { MotionState } from './types.ts';
// Rig order: left hind, left fore, right hind, right fore.
// The fastest gait is three-beat canter, not four-beat gallop.
export const GAIT_CYCLES = [
	null,
	{
		offsets: [0, 0.25, 0.5, 0.75],
		stance: 0.7,
		frequency: 1.35,
		reach: 0.43,
		lift: 0.15,
	},
	{
		offsets: [0, 0.5, 0.5, 0],
		stance: 0.4,
		frequency: 1.7,
		reach: 0.52,
		lift: 0.25,
	},
	{
		offsets: [0, 0.28, 0.28, 0.55],
		stance: 0.3,
		frequency: 1.8,
		reach: 0.6,
		lift: 0.35,
	},
	{
		offsets: [0, 0.5, 0.5, 0],
		stance: 0.72,
		frequency: 0.9,
		reach: 0.36,
		lift: 0.12,
	},
];
const tau = Math.PI * 2;
const wrap = (value: number) => ((value % 1) + 1) % 1;
const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));
export function sampleGait(gait: number, phase: number) {
	const cycle = GAIT_CYCLES[gait];
	if (!cycle)
		return {
			feet: Array.from({ length: 4 }, () => ({
				x: 0,
				z: 0,
				lift: 0,
				contact: true,
			})),
			y: 0,
			pitch: 0,
			roll: 0,
			riderY: 0,
			riderPitch: 0,
		};
	const p = wrap(phase);
	const feet = cycle.offsets.map((offset) => {
		const local = wrap(p - offset),
			contact = local < cycle.stance;
		const swing = clamp((local - cycle.stance) / (1 - cycle.stance), 0, 1);
		return {
			x: 0,
			z: contact
				? cycle.reach * (1 - (2 * local) / cycle.stance)
				: cycle.reach * (-1 + 6 * swing ** 2 - 4 * swing ** 3) -
					((2 * cycle.reach * (1 - cycle.stance)) / cycle.stance) *
						(2 * swing ** 3 - 3 * swing ** 2 + swing),
			lift: contact ? 0 : cycle.lift * Math.sin(Math.PI * swing) ** 2,
			contact,
		};
	});
	if (gait === 4) for (const foot of feet) foot.z *= -1;
	if (gait === 1 || gait === 4)
		return {
			feet,
			y: -0.17 + 0.006 * Math.cos(tau * p * 2),
			pitch: 0.006 * Math.sin(tau * p * 2),
			roll: 0.005 * Math.sin(tau * p),
			riderY: 0,
			riderPitch: 0.015 * Math.sin(tau * p),
		};
	if (gait === 2) {
		const bounce = Math.sin(tau * (p - 0.2)) ** 2;
		return {
			feet,
			y: -0.23 + 0.04 * bounce,
			pitch: 0,
			roll: 0,
			riderY: 0.035 * bounce,
			riderPitch: 0.035,
		};
	}
	const flight = p > 0.85 ? Math.sin((Math.PI * (p - 0.85)) / 0.15) : 0;
	return {
		feet,
		y: -0.29 + 0.02 * Math.sin(tau * p) + 0.045 * flight,
		pitch: 0.035 * Math.sin(tau * (p - 0.1)),
		roll: 0.01 * Math.sin(tau * p),
		riderY: 0.025 + 0.025 * Math.sin(tau * p),
		riderPitch: 0.1 - 0.045 * Math.sin(tau * p),
	};
}
// Two-segment IK keeps stance feet level rather than swinging through soil.
export function solveLeg(y: number, z: number, front: boolean) {
	const kneeZ = front ? -0.01 : 0.13;
	const upper = Math.hypot(0.82, kneeZ),
		lower = Math.hypot(0.87, 0.035);
	const distance = clamp(Math.hypot(y, z), 0.15, upper + lower - 0.00001);
	const bend =
		(front ? -1 : 1) *
		Math.acos(
			clamp(
				(distance ** 2 - upper ** 2 - lower ** 2) / (2 * upper * lower),
				-1,
				1,
			),
		);
	const angle =
		Math.atan2(z, -y) -
		Math.atan2(lower * Math.sin(bend), upper + lower * Math.cos(bend));
	const baseUpper = Math.atan2(kneeZ, 0.82),
		baseLower = Math.atan2(0.035, 0.87);
	return { hip: baseUpper - angle, knee: baseLower - baseUpper - bend };
}
export function createGaitController() {
	let phase = 0,
		weights = [1, 0, 0, 0, 0],
		oldContacts = [true, true, true, true];
	let jumping = false;
	let landing = 1;
	let turnPhase = 0,
		turnAmount = 0;
	return {
		update(dt: number, state: MotionState, turn = 0, paceScale = 1) {
			const target =
				Math.abs(state.speed) < 0.08
					? 0
					: state.speed < 0
						? 4
						: Math.max(1, state.gait);
			const blend = 1 - Math.exp(-dt * 8);
			weights = weights.map(
				(weight, i) => weight + (Number(i === target) - weight) * blend,
			);
			const motion = clamp(
				Math.abs(state.speed) / (state.speed < 0 ? 0.9 : 1.5),
				0,
				1,
			);
			const frequency = weights.reduce(
				(sum, weight, i) => sum + weight * (GAIT_CYCLES[i]?.frequency || 0),
				0,
			);
			phase = wrap(phase + dt * frequency * motion * paceScale);
			const pose = sampleGait(0, phase);
			for (let gait = 1; gait < 5; gait++) {
				const sample = sampleGait(gait, phase),
					weight = weights[gait] * motion;
				for (const key of [
					'y',
					'pitch',
					'roll',
					'riderY',
					'riderPitch',
				] as const)
					pose[key] += sample[key] * weight;
				for (let i = 0; i < 4; i++) {
					pose.feet[i].z += sample.feet[i].z * weight;
					pose.feet[i].lift += sample.feet[i].lift * weight;
				}
			}

			// Counter-rotate planted hooves, then lift and replace them one at a time.
			// Fade this shuffle out as forward locomotion takes over.
			const desiredTurn =
				state.jump < 0 ? clamp(turn, -1, 1) * (1 - motion) : 0;
			turnAmount += (desiredTurn - turnAmount) * (1 - Math.exp(-dt * 10));
			if (Math.abs(turnAmount) < 0.0001) turnAmount = 0;
			const turnWeight = Math.abs(turnAmount);
			turnPhase = wrap(turnPhase + dt * 1.25 * Math.min(1, turnWeight * 4));
			const turningContacts: boolean[] = [];
			for (let i = 0; i < 4; i++) {
				const local = wrap(turnPhase - i * 0.25),
					stance = 0.78;
				const contact = local < stance;
				const swing = clamp((local - stance) / (1 - stance), 0, 1);
				const angle =
					(contact
						? -0.43 + (0.86 * local) / stance
						: 0.43 * Math.cos(Math.PI * swing)) * turnAmount;
				const restX = i < 2 ? -0.41 : 0.41;
				const restZ = i % 2 ? 0.745 : -0.655;
				pose.feet[i].x +=
					restX * (Math.cos(angle) - 1) - restZ * Math.sin(angle);
				pose.feet[i].z +=
					restX * Math.sin(angle) + restZ * (Math.cos(angle) - 1);
				pose.feet[i].lift += contact
					? 0
					: 0.18 * Math.sin(Math.PI * swing) ** 1.3 * turnWeight;
				turningContacts.push(contact);
			}
			pose.y -= 0.075 * turnWeight;
			pose.roll += 0.012 * Math.sin(tau * turnPhase) * turnAmount;
			const contacts =
				turnWeight > 0.1 && motion < 0.5
					? turningContacts
					: sampleGait(target, phase).feet.map((foot) => foot.contact);
			let footfalls = 0;
			if (state.jump >= 0) {
				const progress = clamp(state.jump / JUMP_DURATION, 0, 1);
				const jump = sampleJump(progress);
				const entry = clamp(progress / 0.1, 0, 1);
				const blend = entry * entry * (3 - 2 * entry);
				pose.pitch += (jump.pitch - pose.pitch) * blend;
				pose.y *= 1 - blend;
				pose.roll *= 1 - blend;
				pose.riderPitch += (jump.riderPitch - pose.riderPitch) * blend;
				pose.riderY += (jump.riderY - pose.riderY) * blend;
				pose.feet.forEach((foot, i) => {
					const front = i % 2 === 1;
					foot.x *= 1 - blend;
					foot.z += ((front ? jump.frontZ : jump.hindZ) - foot.z) * blend;
					foot.lift +=
						((front ? jump.frontLift : jump.hindLift) - foot.lift) * blend;
				});
				landing = 1;
				oldContacts.fill(false);
				jumping = true;
			} else {
				if (jumping) {
					landing = 0;
					footfalls = 2;
				}
				const previousLanding = landing;
				landing = Math.min(1, landing + dt / 0.3);
				if (landing < 1) {
					const recovery = landing * landing * (3 - 2 * landing);
					const compression = Math.sin(Math.PI * landing);
					pose.y = pose.y * recovery - 0.11 * compression;
					pose.pitch = pose.pitch * recovery + 0.055 * compression;
					pose.riderY = pose.riderY * recovery - 0.025 * compression;
					pose.riderPitch = pose.riderPitch * recovery + 0.03 * (1 - recovery);
					pose.feet.forEach((foot, i) => {
						foot.x *= recovery;
						foot.z = 0.02 * (1 - recovery) + foot.z * recovery;
						foot.lift =
							(i % 2 ? 0 : 0.08) * (1 - recovery) + foot.lift * recovery;
					});
					if (previousLanding < 0.4 && landing >= 0.4) footfalls += 2;
				} else if (!jumping && (motion > 0.1 || turnWeight > 0.1))
					footfalls = contacts.filter(
						(contact, i) => contact && !oldContacts[i],
					).length;
				oldContacts = contacts;
				jumping = false;
			}
			return { ...pose, footfalls, phase, weights: [...weights] };
		},
	};
}
