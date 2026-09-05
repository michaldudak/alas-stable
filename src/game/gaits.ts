import { JUMP_DURATION } from './tuning.ts';
import type { MotionState } from './types.ts';
// Rig order: left hind, left fore, right hind, right fore.
// Galop means three-beat canter, not four-beat cwal.
export const GAIT_CYCLES = [
	null,
	{
		offsets: [0, 0.25, 0.5, 0.75],
		stance: 0.7,
		frequency: 1.35,
		reach: 0.51,
		lift: 0.15,
	},
	{
		offsets: [0, 0.5, 0.5, 0],
		stance: 0.4,
		frequency: 1.7,
		reach: 0.62,
		lift: 0.34,
	},
	{
		offsets: [0, 0.28, 0.28, 0.55],
		stance: 0.3,
		frequency: 1.8,
		reach: 0.7,
		lift: 0.48,
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
			z: contact
				? cycle.reach * (1 - (2 * local) / cycle.stance)
				: -cycle.reach * Math.cos(Math.PI * swing),
			lift: contact ? 0 : cycle.lift * Math.sin(Math.PI * swing) ** 1.3,
			contact,
		};
	});
	if (gait === 1)
		return {
			feet,
			y: -0.13 + 0.015 * Math.cos(tau * p * 2),
			pitch: 0.018 * Math.sin(tau * p * 2),
			roll: 0.016 * Math.sin(tau * p),
			riderY: 0,
			riderPitch: 0.015 * Math.sin(tau * p),
		};
	if (gait === 2) {
		const bounce = Math.sin(tau * (p - 0.2)) ** 2;
		return {
			feet,
			y: -0.18 + 0.12 * bounce,
			pitch: 0.012 * Math.sin(tau * p * 2),
			roll: 0,
			riderY: 0.035 * bounce,
			riderPitch: 0.035,
		};
	}
	const flight = p > 0.85 ? Math.sin((Math.PI * (p - 0.85)) / 0.15) : 0;
	return {
		feet,
		y: -0.2 + 0.05 * Math.sin(tau * p) + 0.14 * flight,
		pitch: 0.075 * Math.sin(tau * (p - 0.1)),
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
		weights = [1, 0, 0, 0],
		oldContacts = [true, true, true, true];
	let jumping = false;
	return {
		update(dt: number, state: MotionState) {
			const target = state.speed < 0.08 ? 0 : state.gait || 1;
			const blend = 1 - Math.exp(-dt * 8);
			weights = weights.map(
				(weight, i) => weight + (Number(i === target) - weight) * blend,
			);
			const motion = clamp(state.speed / 1.5, 0, 1);
			const frequency = weights.reduce(
				(sum, weight, i) =>
					sum + weight * (GAIT_CYCLES[i]?.frequency || 0),
				0,
			);
			phase = wrap(phase + dt * frequency * motion);
			const pose = sampleGait(0, phase);
			for (let gait = 1; gait < 4; gait++) {
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
			const contacts = sampleGait(target, phase).feet.map(
				(foot) => foot.contact,
			);
			let footfalls = 0;
			if (state.jump >= 0) {
				const progress = clamp(state.jump / JUMP_DURATION, 0, 1),
					tuck = Math.sin(Math.PI * progress);
				pose.pitch = Math.cos(Math.PI * progress) * 0.12;
				pose.y *= 1 - tuck;
				pose.roll *= 1 - tuck;
				pose.riderPitch = 0.22 * tuck;
				pose.riderY = 0.025 * tuck;
				pose.feet.forEach((foot, i) => {
					const front = i % 2 === 1;
					foot.z = foot.z * (1 - tuck) + (front ? 0.22 : -0.2) * tuck;
					foot.lift =
						foot.lift * (1 - tuck) + (front ? 0.85 : 0.42) * tuck;
				});
				oldContacts.fill(false);
				jumping = true;
			} else {
				if (jumping) footfalls = 2;
				else if (motion > 0.1)
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
