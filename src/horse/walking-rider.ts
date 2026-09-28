import * as THREE from 'three';
import { createFigure, type BoneName } from './figure.ts';
import { RIDER_SEAT, limb, seatedPose } from './rider.ts';

const up = new THREE.Vector3(0, 1, 0),
	forward = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;
const wrap = (value: number) => ((value % 1) + 1) % 1;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (edge0: number, edge1: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
};

/** What the rider does on foot; everything except `speed` is optional. */
export interface WalkerAction {
	/** Ground speed along the heading, negative when walking backwards. */
	speed: number;
	/** Turning rate in radians per second; on the spot the feet step round. */
	turn?: number;
	/** 0 standing, 1 seated in the saddle, while mounting or dismounting. */
	seat?: number;
	/** 0–1: the right leg sweeping over the horse's back. */
	swing?: number;
	/** The side of the horse the rider mounts from. */
	side?: number;
	/** The left hand holds a lead rope out in front. */
	lead?: boolean;
	/** Both hands hold the top rail of a jump. */
	carry?: boolean;
	/** 0–1: the right hand holds out a treat on a flat palm. */
	offer?: number;
	/** The right hand reaches a point in the world, for example to stroke a horse. */
	touch?: { target: THREE.Vector3; amount: number; stroke: number };
	/** A point in the world to look at. */
	look?: THREE.Vector3;
}

/**
 * Cadence and duty factor (share of the stride a foot is planted) for a ground
 * speed: a heel-to-toe walk that blends into a run with a flight phase.
 * Speeds are game metres per second; the world is about 1.6 times life size.
 */
export function stepTiming(pace: number) {
	const run = smooth(2.3, 3, pace);
	return {
		run,
		frequency: mix(0.62 + 0.21 * pace, 1.1 + 0.08 * pace, run),
		duty: mix(0.62, 0.38, run),
	};
}

/** The rider on foot: walks, runs, leads a horse and blends into the seat when mounting. */
export function createWalkingRider() {
	const root = new THREE.Group();
	root.name = 'walking-rider';
	const figure = createFigure();
	root.add(figure.root);
	seatedPose(figure);
	const seated = figure.snapshot();
	figure.resetPose();
	const { bones, rest } = figure;
	const leadHand = new THREE.Group();
	leadHand.position.copy(figure.directions.handL).multiplyScalar(0.12);
	bones.handL.add(leadHand);
	// A carrot the rider holds out on a flat hand.
	const treat = new THREE.Group();
	treat.name = 'treat';
	const carrot = new THREE.Mesh(
		new THREE.ConeGeometry(0.028, 0.2, 10),
		new THREE.MeshStandardMaterial({ color: '#e0772b', roughness: 0.7 }),
	);
	carrot.rotation.x = Math.PI / 2;
	carrot.castShadow = true;
	treat.add(carrot);
	const leaves = new THREE.MeshStandardMaterial({
		color: '#4f8a36',
		roughness: 0.8,
	});
	for (let i = 0; i < 3; i++) {
		const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09, 5), leaves);
		leaf.position.set((i - 1) * 0.012, 0.01, -0.13);
		leaf.rotation.x = -Math.PI / 2 + (i - 1) * 0.3;
		treat.add(leaf);
	}
	treat.position.copy(figure.directions.handR).multiplyScalar(0.09);
	treat.position.y += 0.03;
	treat.visible = false;
	bones.handR.add(treat);

	// Foot geometry from the sculpt: ankle height, heel behind and ball of the
	// foot in front of the ankle, and the length of the leg.
	const ankleHeight = rest.footL.y,
		heelBack = 0.08,
		ballFront = 0.19;
	const hipRest = rest.pelvis.clone();
	const legLength =
		rest.thighL.distanceTo(rest.shinL) + rest.shinL.distanceTo(rest.footL);
	const hipX = rest.thighL.x;
	const posed = figure.snapshot();
	const armBones = ['armR', 'forearmR', 'handR'] as const;
	const armBefore = armBones.map(() => new THREE.Quaternion());
	const target = new THREE.Vector3(),
		direction = new THREE.Vector3(),
		hint = new THREE.Vector3(),
		pole = new THREE.Vector3(),
		euler = new THREE.Euler(0, 0, 0, 'YXZ'),
		inverse = new THREE.Matrix4(),
		local = new THREE.Vector3();

	let phase = 0,
		motion = 0,
		clock = 0,
		hipDrop = 0,
		lookYaw = 0,
		lookPitch = 0,
		glance = 0,
		glanceTimer = 2.5;

	/** Ankle (z, y) of a foot whose sole touches the ground at `anchor`, tipped by `pitch`. */
	function ankle(anchor: number, pitch: number): [number, number] {
		const cos = Math.cos(pitch),
			sin = Math.sin(pitch);
		// Toe up rolls over the heel; heel up rolls over the ball of the foot.
		if (pitch >= 0)
			return [
				anchor - heelBack + heelBack * cos - ankleHeight * sin,
				heelBack * sin + ankleHeight * cos,
			];
		return [
			anchor + ballFront - ballFront * cos - ankleHeight * sin,
			-ballFront * sin + ankleHeight * cos,
		];
	}

	/** Writes a figure-space direction turned about the vertical by `yaw` into `out`. */
	function turned(
		out: THREE.Vector3,
		x: number,
		y: number,
		z: number,
		yaw: number,
	) {
		const cos = Math.cos(yaw),
			sin = Math.sin(yaw);
		return out.set(x * cos + z * sin, y, z * cos - x * sin);
	}

	function pose(dt: number, action: WalkerAction) {
		clock += dt;
		const speed = action.speed,
			pace = Math.abs(speed);
		const seat = action.seat ?? 0;
		const turning = Math.abs(action.turn ?? 0);
		const moving = smooth(0.04, 0.5, pace);
		// Turning on the spot shuffles the feet round in small steps.
		const shuffle = (1 - moving) * smooth(0.25, 0.8, turning);
		motion +=
			(Math.max(moving, shuffle * 0.4) - motion) * (1 - Math.exp(-dt * 7));
		const timing = stepTiming(pace);
		const run = timing.run * moving;
		const duty = moving > 0.02 ? timing.duty : 0.6;
		const frequency = moving > 0.02 ? timing.frequency : 0.9;
		if (motion > 0.002) phase = wrap(phase + dt * frequency);
		const backwards = speed < -0.01 ? -1 : 1;
		// A planted foot moves back under the hips exactly as far as the body travels.
		const stride = (pace * duty) / frequency + shuffle * 0.14;
		const lift = mix(0.1, 0.34, run) * motion;
		const heelStrike = (backwards > 0 ? mix(0.34, 0.08, run) : 0) * motion;
		const push = (backwards > 0 ? mix(0.75, 0.9, run) : 0.2) * motion;
		// Runners land close under the body and push off far behind it.
		const centre = mix(-0.03, -0.2, run) * backwards * moving;

		figure.resetPose();
		// Pelvis: sways over the planted foot, rotates with the stride and drops
		// on the side of the swinging leg.
		const stance = TAU * (phase - duty / 2);
		const pelvisYaw = -mix(0.07, 0.1, run) * motion * Math.cos(TAU * phase);
		const idle = 1 - motion;
		// Standing, the weight drifts slowly from one leg to the other.
		const shift = Math.sin(clock * 0.31);
		const pelvisRoll =
			mix(0.045, 0.05, run) * motion * Math.cos(stance) + idle * 0.035 * shift;
		const pelvisTilt = mix(0.04, 0.12, run) * moving;
		const pelvisX =
			mix(0.028, 0.012, run) * motion * Math.cos(stance) + idle * 0.025 * shift;
		// Feet: stance slides back under the body, swing arcs forward.
		const feet = [1, -1].map((side, i) => {
			const localPhase = wrap(phase + i * 0.5);
			let z: number, y: number, pitch: number, weight: number;
			if (localPhase < duty) {
				const s = localPhase / duty;
				const anchor = centre + backwards * stride * (0.5 - s);
				pitch =
					heelStrike * (1 - smooth(0, 0.14, s)) -
					push * smooth(mix(0.58, 0.42, run), 1, s);
				[z, y] = ankle(anchor, pitch);
				weight = 1;
			} else {
				const u = (localPhase - duty) / (1 - duty);
				const [z0, y0] = ankle(centre - (backwards * stride) / 2, -push);
				const [z1, y1] = ankle(centre + (backwards * stride) / 2, heelStrike);
				// Hermite curve leaving and landing at the speed of a planted foot.
				// Lifting off, the foot eases forward; landing, it swings back to
				// meet the ground at the ground's own speed, so it does not skid.
				const matched = (-backwards * stride * (1 - duty)) / duty;
				const u2 = u * u,
					u3 = u2 * u;
				z =
					(2 * u3 - 3 * u2 + 1) * z0 +
					(u3 - 2 * u2 + u) * matched * 0.3 +
					(-2 * u3 + 3 * u2) * z1 +
					(u3 - u2) * matched * 0.9;
				const bump = Math.sin(Math.PI * u ** mix(0.85, 0.62, run)) ** 2;
				y = mix(y0, y1, smooth(0, 1, u)) + lift * bump;
				pitch =
					mix(-push, heelStrike, smooth(0.1, 0.95, u)) +
					0.12 * motion * (1 - run) * Math.sin(Math.PI * u);
				// A foot about to land already carries weight.
				weight = smooth(0.7, 1, u);
			}
			// A relaxed stance: one foot a little ahead, toes turned out.
			const x = side * mix(0.1, 0.07, run) + side * idle * 0.02;
			z += idle * side * 0.05;
			return { side, x, z, y, pitch, weight };
		});
		// Highest hips that let every planted foot reach the ground with soft knees.
		const reach = legLength * mix(0.985, 0.94, run);
		// Running bounces: low over the planted foot, high in flight.
		let hip =
			hipRest.y -
			mix(0.015, 0.06, run) * motion -
			0.06 * run * Math.cos(2 * TAU * (phase - duty / 2));
		for (const foot of feet) {
			const dx = foot.x - (hipX * foot.side + pelvisX),
				dz = foot.z;
			const height =
				foot.y + Math.sqrt(Math.max(0.04, reach * reach - dx * dx - dz * dz));
			hip = mix(hip, Math.min(hip, height), foot.weight);
		}
		hipDrop += (hipRest.y - hip - hipDrop) * (1 - Math.exp(-dt * 30));
		bones.pelvis.position.set(pelvisX, hipRest.y - hipDrop, 0);
		euler.set(pelvisTilt, pelvisYaw, pelvisRoll);
		bones.pelvis.quaternion.setFromEuler(euler);
		for (const foot of feet) {
			target.set(foot.x, foot.y, foot.z);
			figure.reach(
				limb('thigh', foot.side),
				limb('shin', foot.side),
				target,
				pole.set(foot.side * 0.08, 0.1, 1),
			);
			// Toes point a little outwards; the sole follows the roll.
			const toeOut = foot.side * (0.1 + idle * 0.12);
			const cos = Math.cos(foot.pitch),
				sin = Math.sin(foot.pitch);
			const flatZ = 0.96,
				flatY = -0.27;
			figure.aim(
				limb('foot', foot.side),
				turned(
					direction,
					0,
					flatY * cos + flatZ * sin,
					flatZ * cos - flatY * sin,
					toeOut,
				),
				up,
				up,
			);
		}
		// Torso counter-rotates against the hips and leans into running.
		const lean = (backwards > 0 ? mix(0.03, 0.22, run) : -0.03) * moving;
		const breath = 0.012 * Math.sin(clock * 1.35) * (0.4 + idle);
		let spinePitch = lean - pelvisTilt * 0.7 + breath;
		let spineYaw = -1.6 * pelvisYaw;
		const spineRoll = -0.8 * pelvisRoll;
		// Stroking or reaching turns the shoulders towards the hand's target.
		const touch = action.touch;
		let reachTarget: THREE.Vector3 | undefined;
		if (touch && touch.amount > 0.001) {
			root.updateWorldMatrix(true, false);
			inverse.copy(root.matrixWorld).invert();
			reachTarget = local
				.copy(touch.target)
				.applyMatrix4(inverse)
				.sub(figure.root.position);
			const bearing = Math.atan2(reachTarget.x, reachTarget.z);
			spineYaw += touch.amount * Math.max(-0.5, Math.min(0.5, bearing * 0.4));
			spinePitch +=
				touch.amount * Math.max(0, Math.min(0.3, (1.9 - reachTarget.y) * 0.25));
		}
		euler.set(spinePitch, spineYaw, spineRoll);
		bones.spine.quaternion.setFromEuler(euler);
		// The head stays level and looks where the rider is going, at a target,
		// or about while standing.
		let wantYaw = 0,
			wantPitch = 0;
		if (action.look) {
			root.updateWorldMatrix(true, false);
			inverse.copy(root.matrixWorld).invert();
			target.copy(action.look).applyMatrix4(inverse);
			wantYaw = Math.atan2(target.x, target.z);
			wantPitch = -Math.atan2(target.y - 2.35, Math.hypot(target.x, target.z));
		} else if (motion < 0.2 && seat < 0.01) {
			glanceTimer -= dt;
			if (glanceTimer <= 0) {
				glance = glance ? 0 : (Math.random() - 0.5) * 1.3;
				glanceTimer = 2 + Math.random() * 4;
			}
			wantYaw = glance;
		} else glance = 0;
		const ease = 1 - Math.exp(-dt * 4);
		lookYaw += (Math.max(-1.1, Math.min(1.1, wantYaw)) - lookYaw) * ease;
		lookPitch += (Math.max(-0.5, Math.min(0.6, wantPitch)) - lookPitch) * ease;
		euler.set(
			-(pelvisTilt + spinePitch) * 0.75 +
				lookPitch +
				0.02 * motion * Math.sin(2 * TAU * phase),
			-(pelvisYaw + spineYaw) + lookYaw,
			-(pelvisRoll + spineRoll) * 0.9,
		);
		bones.head.quaternion.setFromEuler(euler);
		// Arms swing against the legs; elbows bend more when running.
		const torsoYaw = pelvisYaw + spineYaw;
		const swingAmplitude = mix(0.3, 0.55, run) * motion;
		for (const side of [1, -1]) {
			const swingPhase = Math.cos(TAU * (phase - 0.04 * motion));
			const angle = -side * swingAmplitude * swingPhase - 0.4 * run;
			const abduction = mix(0.16, 0.2, run) - idle * 0.05;
			// Runners pump their arms: the elbow closes as the hand comes forward.
			const elbow =
				mix(0.18, 1.6, run) +
				mix(0.3 * Math.max(0, angle), 0.45 * (angle + 0.95), run) * motion +
				0.12 * idle;
			turned(hint, 0, 0, 1, torsoYaw);
			figure.aim(
				limb('arm', side),
				turned(
					direction,
					side * abduction,
					-Math.cos(angle),
					Math.sin(angle),
					torsoYaw,
				),
				hint,
			);
			figure.aim(
				limb('forearm', side),
				turned(
					direction,
					side * abduction * 0.4,
					-Math.cos(angle + elbow),
					Math.sin(angle + elbow),
					torsoYaw,
				),
				hint,
			);
			figure.aim(
				limb('hand', side),
				turned(
					direction,
					side * 0.06,
					-Math.cos(angle + elbow + 0.12),
					Math.sin(angle + elbow + 0.12),
					torsoYaw,
				),
				hint,
			);
		}
		if (action.carry)
			// Both hands grip the top rail in front of the hips.
			for (const side of [1, -1]) {
				figure.reach(
					limb('arm', side),
					limb('forearm', side),
					target.set(side * 0.3, 1.1, 0.7),
					pole.set(side, -0.8, -0.6),
				);
				figure.aim(limb('hand', side), direction.set(0, -0.45, 1), up);
			}
		if (action.lead) {
			figure.aim('armL', direction.set(0.35, -0.75, 0.45), forward);
			figure.aim('forearmL', direction.set(0.15, -0.35, 1), forward);
			figure.aim('handL', direction.set(0.1, -0.3, 1), up);
		}
		const offer = action.offer ?? 0;
		if (offer > 0) {
			// Hold the treat out on a flat palm, just below shoulder height.
			armBones.forEach((name, i) => armBefore[i].copy(bones[name].quaternion));
			figure.aim('armR', direction.set(-0.1, -0.8, 0.62), forward);
			figure.aim('forearmR', direction.set(-0.03, -0.12, 1), forward);
			figure.aim('handR', direction.set(0, -0.03, 1), up);
			armBones.forEach((name, i) => {
				const bone = bones[name];
				bone.quaternion.slerpQuaternions(
					armBefore[i],
					bone.quaternion.clone(),
					offer,
				);
			});
		}
		if (touch && reachTarget && touch.amount > 0.001) {
			// Stroke along the target with the flat of the hand.
			armBones.forEach((name, i) => armBefore[i].copy(bones[name].quaternion));
			const stroke = Math.sin(clock * 5.5) * touch.stroke;
			target.copy(reachTarget);
			target.y += 0.05 * stroke;
			target.z += 0.1 * stroke;
			figure.reach('armR', 'forearmR', target, pole.set(-1, -1.2, -0.4));
			// The flat of the hand lies along the reach, fingers tipped down.
			figure.figurePosition(bones.armR, hint);
			direction.copy(target).sub(hint);
			direction.y -= direction.length() * 0.35;
			figure.aim('handR', direction, up);
			armBones.forEach((name, i) => {
				const bone = bones[name];
				bone.quaternion.slerpQuaternions(
					armBefore[i],
					bone.quaternion.clone(),
					touch.amount,
				);
			});
		}
		// Mounting blends towards the seat; one leg sweeps over the horse's back.
		for (const [name, quaternion] of Object.entries(figure.snapshot()))
			posed[name as BoneName].copy(quaternion);
		if (seat > 0) {
			for (const [name, bone] of Object.entries(bones))
				bone.quaternion.slerpQuaternions(
					posed[name as BoneName],
					seated[name as BoneName],
					seat,
				);
			bones.pelvis.position.lerp(hipRest, seat);
		}
		const swing = action.swing ?? 0;
		if (swing) {
			const side = action.side ?? -1;
			const thigh = bones[side < 0 ? 'thighL' : 'thighR'];
			thigh.quaternion.multiply(
				new THREE.Quaternion().setFromEuler(
					new THREE.Euler(-0.5 * swing, 0, (side < 0 ? 1 : -1) * 1.1 * swing),
				),
			);
		}
		figure.root.position.set(0, 0, RIDER_SEAT.z * seat);
	}
	pose(0, { speed: 0 });
	root.visible = false;
	return { root, pose, leadHand, treat, figure };
}
