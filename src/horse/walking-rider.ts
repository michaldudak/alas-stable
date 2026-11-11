import * as THREE from 'three';
import { createFigure, type BoneName } from './figure.ts';
import type { RiderModelId } from './rider-asset.ts';
import {
	SEAT_POINT,
	STIRRUP,
	REIN_HAND,
	footDirection,
	limb,
	seatedPose,
} from './rider.ts';

const up = new THREE.Vector3(0, 1, 0);
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
	/**
	 * Mounting: 0 standing beside the horse, 1 seated in the saddle. In between
	 * she steps in, puts a foot in the stirrup, rises and swings a leg over.
	 */
	seat?: number;
	/** The side of the horse the rider mounts from (+1 its left). */
	side?: number;
	/** While mounting: how far the walker's origin is from the horse's centre line. */
	away?: number;
	/** While mounting: how high the walker's origin has been lifted. */
	lift?: number;
	/** Mounting a horse without a saddle, which sits a little lower. */
	bareback?: boolean;
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

/** The rider on foot: walks, runs, leads a horse and climbs into the saddle. */
export function createWalkingRider(model?: RiderModelId) {
	const root = new THREE.Group();
	root.name = 'walking-rider';
	const figure = createFigure(model);
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
	carrot.castShadow = true;
	// The carrot lies along the hand, its tip towards the fingers.
	carrot.quaternion.setFromUnitVectors(up, figure.directions.handR);
	treat.add(carrot);
	const leaves = new THREE.MeshStandardMaterial({
		color: '#4f8a36',
		roughness: 0.8,
	});
	for (let i = 0; i < 3; i++) {
		const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09, 5), leaves);
		leaf.position.set((i - 1) * 0.012, -0.13, 0);
		leaf.rotation.set(Math.PI, 0, (i - 1) * 0.3);
		carrot.add(leaf);
	}
	treat.position
		.copy(figure.directions.handR)
		.multiplyScalar(0.11)
		.addScaledVector(figure.thumbward.R, 0.0)
		.add(new THREE.Vector3(0.02, 0, -0.02));
	treat.visible = false;
	bones.handR.add(treat);

	// Foot geometry from the model: ankle height on a flat sole, the heel
	// behind and the ball of the foot in front of the ankle, the leg's length.
	const ankleHeight = rest.footL.y,
		ballFront = rest.toeL.z - rest.footL.z,
		heelBack = ballFront * 0.42;
	const hipRest = rest.hips.clone();
	const legLength =
		rest.thighL.distanceTo(rest.shinL) + rest.shinL.distanceTo(rest.footL);
	const hipX = rest.thighL.x,
		hipDrop0 = rest.hips.y - rest.thighL.y,
		stance = rest.footL.x;
	const armLength = rest.armL.distanceTo(rest.forearmL),
		forearmLength = rest.forearmL.distanceTo(rest.handL),
		palmLength = rest.middle1L.distanceTo(rest.handL);
	const posed = figure.snapshot();
	const armBones = [
		'armR',
		'armTwistR',
		'forearmR',
		'forearmTwistR',
		'handR',
	] as const;
	const armBefore = armBones.map(() => new THREE.Quaternion());
	const target = new THREE.Vector3(),
		direction = new THREE.Vector3(),
		lower = new THREE.Vector3(),
		hint = new THREE.Vector3(),
		pole = new THREE.Vector3(),
		shoulder = new THREE.Vector3(),
		euler = new THREE.Euler(0, 0, 0, 'YXZ'),
		inverse = new THREE.Matrix4(),
		local = new THREE.Vector3(),
		blended = new THREE.Quaternion(),
		hipsStanding = new THREE.Vector3();

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

	/** Points a hand along `along`, rolled so its thumb side faces `thumb`. */
	function hand(side: number, along: THREE.Vector3, thumb: THREE.Vector3) {
		figure.aim(
			limb('hand', side),
			along,
			thumb,
			figure.thumbward[side > 0 ? 'L' : 'R'],
		);
	}

	/** Blends the right arm from the pose saved in `armBefore` to the current one. */
	function blendArm(amount: number) {
		armBones.forEach((name, i) => {
			const bone = bones[name];
			blended.copy(bone.quaternion);
			bone.quaternion.slerpQuaternions(armBefore[i], blended, amount);
		});
	}
	const saveArm = () =>
		armBones.forEach((name, i) => armBefore[i].copy(bones[name].quaternion));

	function walk(dt: number, action: WalkerAction) {
		const speed = action.speed,
			pace = Math.abs(speed);
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
		const lift = mix(0.11, 0.36, run) * motion;
		const heelStrike = (backwards > 0 ? mix(0.32, 0.08, run) : 0) * motion;
		const push = (backwards > 0 ? mix(0.7, 0.9, run) : 0.2) * motion;
		// Runners land close under the body and push off far behind it.
		const centre = mix(-0.03, -0.2, run) * backwards * moving;

		figure.resetPose();
		// Hips: sway over the planted foot, rotate with the stride and drop on
		// the side of the swinging leg.
		const stancePhase = TAU * (phase - duty / 2);
		const hipYaw = -mix(0.08, 0.11, run) * motion * Math.cos(TAU * phase);
		const idle = 1 - motion;
		// Standing, the weight drifts slowly from one leg to the other.
		const shift = Math.sin(clock * 0.31);
		const hipRoll =
			mix(0.05, 0.05, run) * motion * Math.cos(stancePhase) +
			idle * 0.04 * shift;
		const hipTilt = mix(0.03, 0.1, run) * moving;
		const hipSway =
			mix(0.03, 0.012, run) * motion * Math.cos(stancePhase) +
			idle * 0.03 * shift;
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
			// Feet track close to the line of travel; standing, they rest apart.
			const x =
				side * mix(stance * 0.62, stance * 0.45, run) * motion +
				side * idle * stance * 1.02;
			z += idle * side * 0.05;
			return { side, x, z, y, pitch, weight };
		});
		// Highest hips that let every planted foot reach the ground with soft knees.
		const reach = legLength * mix(0.982, 0.945, run);
		// Running bounces: low over the planted foot, high in flight.
		let hip =
			hipRest.y -
			mix(0.012, 0.07, run) * motion -
			0.06 * run * Math.cos(2 * TAU * (phase - duty / 2));
		for (const foot of feet) {
			const dx = foot.x - (hipX * foot.side + hipSway),
				dz = foot.z + rest.footL.z - rest.thighL.z;
			const height =
				foot.y +
				hipDrop0 +
				Math.sqrt(Math.max(0.04, reach * reach - dx * dx - dz * dz));
			hip = mix(hip, Math.min(hip, height), foot.weight);
		}
		hipDrop += (hipRest.y - hip - hipDrop) * (1 - Math.exp(-dt * 30));
		bones.hips.position.set(hipSway, hipRest.y - hipDrop, hipRest.z);
		euler.set(hipTilt, hipYaw, hipRoll);
		bones.hips.quaternion.setFromEuler(euler);
		for (const foot of feet) {
			target.set(foot.x, foot.y, foot.z + rest.footL.z);
			figure.reach(
				limb('thigh', foot.side),
				limb('shin', foot.side),
				target,
				pole.set(foot.side * 0.06, 0.1, 1),
			);
			// Toes point a little outwards; the sole follows the roll.
			footDirection(
				figure,
				foot.side,
				foot.pitch,
				foot.side * idle * 0.1,
				direction,
			);
			figure.aim(limb('foot', foot.side), direction, up, up);
			// Rolling over the ball of the foot, the toes stay on the ground.
			bones[limb('toe', foot.side)].quaternion.setFromAxisAngle(
				pole.set(1, 0, 0),
				Math.min(0, foot.pitch) * (foot.weight > 0.5 ? 0.9 : 0.3),
			);
		}
		// The trunk counter-rotates against the hips and leans into running.
		const lean = (backwards > 0 ? mix(0.03, 0.2, run) : -0.03) * moving;
		const breath = 0.01 * Math.sin(clock * 1.35) * (0.4 + idle);
		let spinePitch = lean - hipTilt * 0.7 + breath;
		let spineYaw = -1.7 * hipYaw;
		const spineRoll = -0.85 * hipRoll;
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
				touch.amount *
				Math.max(0, Math.min(0.3, (rest.armL.y - reachTarget.y) * 0.25));
		}
		// The lower back takes a little of the turn and the ribcage the rest.
		euler.set(spinePitch * 0.45, spineYaw * 0.35, spineRoll * 0.5);
		bones.spine.quaternion.setFromEuler(euler);
		euler.set(spinePitch * 0.55, spineYaw * 0.65, spineRoll * 0.5);
		bones.chest.quaternion.setFromEuler(euler);
		// The head stays level and looks where the rider is going, at a target,
		// or about while standing.
		let wantYaw = 0,
			wantPitch = 0;
		if (action.look) {
			root.updateWorldMatrix(true, false);
			inverse.copy(root.matrixWorld).invert();
			target.copy(action.look).applyMatrix4(inverse);
			wantYaw = Math.atan2(target.x, target.z);
			wantPitch = -Math.atan2(
				target.y - figure.ends.head.y * 0.93,
				Math.hypot(target.x, target.z),
			);
		} else if (motion < 0.2) {
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
		const headPitch =
				-(hipTilt + spinePitch) * 0.75 +
				lookPitch +
				0.02 * motion * Math.sin(2 * TAU * phase),
			headYaw = -(hipYaw + spineYaw) + lookYaw,
			headRoll = -(hipRoll + spineRoll) * 0.9;
		euler.set(headPitch * 0.4, headYaw * 0.4, headRoll * 0.4);
		bones.neck.quaternion.setFromEuler(euler);
		euler.set(headPitch * 0.6, headYaw * 0.6, headRoll * 0.6);
		bones.head.quaternion.setFromEuler(euler);
		// Arms swing against the legs; elbows bend more when running.
		const torsoYaw = hipYaw + spineYaw;
		const swingAmplitude = mix(0.34, 0.6, run) * motion;
		for (const side of [1, -1]) {
			const swingPhase = Math.cos(TAU * (phase - 0.04 * motion));
			const angle = -side * swingAmplitude * swingPhase - 0.35 * run;
			const abduction = mix(0.13, 0.17, run) + idle * 0.02;
			// Runners pump their arms: the elbow closes as the hand comes forward.
			const elbow =
				mix(0.22, 1.5, run) +
				mix(0.35 * Math.max(0, angle), 0.45 * (angle + 0.95), run) * motion +
				0.1 * idle;
			turned(
				direction,
				side * abduction,
				-Math.cos(angle),
				Math.sin(angle),
				torsoYaw,
			);
			turned(
				lower,
				side * abduction * 0.3,
				-Math.cos(angle + elbow),
				Math.sin(angle + elbow),
				torsoYaw,
			);
			figure.bend(limb('arm', side), limb('forearm', side), direction, lower);
			// Hands hang in line with the forearm, palms towards the thighs.
			turned(hint, -side * 0.25, 0, 1, torsoYaw);
			hand(side, lower, hint);
			figure.grip(side, mix(0.32, 0.6, run), mix(0.2, 0.5, run));
		}
		if (action.carry)
			// Both hands grip the top rail in front of the hips.
			for (const side of [1, -1]) {
				figure.reach(
					limb('arm', side),
					limb('forearm', side),
					target.set(side * 0.3, hipRest.y - 0.28, 0.62),
					pole.set(side, -0.8, -0.6),
				);
				hand(side, direction.set(0, -0.4, 1), hint.set(-side, 0.2, 0));
				figure.grip(side, 0.75, 0.7);
			}
		if (action.lead) {
			// The left hand carries the rope in front of the hip.
			figure.figurePosition(bones.armL, shoulder);
			target.set(shoulder.x + 0.1, shoulder.y - armLength * 0.95, 0.42);
			figure.reach('armL', 'forearmL', target, pole.set(0.6, -0.5, -1));
			hand(1, direction.set(-0.1, -0.25, 1), hint.set(-0.3, 1, 0));
			figure.grip(1, 0.8, 0.6);
		}
		const offer = action.offer ?? 0;
		if (offer > 0) {
			// Hold the treat out on a flat palm, just below shoulder height.
			saveArm();
			figure.figurePosition(bones.armR, shoulder);
			target.set(
				shoulder.x + 0.06,
				shoulder.y - 0.22,
				shoulder.z + (armLength + forearmLength) * 0.86,
			);
			figure.reach('armR', 'forearmR', target, pole.set(-0.5, -1, -0.3));
			// Palm up: the thumb points out to the side.
			hand(-1, direction.set(0.04, -0.03, 1), hint.set(-1, 0.15, 0));
			figure.grip(-1, 0.06, 0.1);
			blendArm(offer);
		}
		if (touch && reachTarget && touch.amount > 0.001) {
			// Stroke along the target with the flat of the hand.
			saveArm();
			const stroke = Math.sin(clock * 5.5) * touch.stroke;
			figure.figurePosition(bones.armR, shoulder);
			direction.copy(reachTarget).sub(shoulder);
			direction.y -= direction.length() * 0.35;
			direction.normalize();
			target.copy(reachTarget).addScaledVector(direction, -palmLength * 0.9);
			target.y += 0.05 * stroke;
			target.z += 0.1 * stroke;
			figure.reach('armR', 'forearmR', target, pole.set(-1, -1.2, -0.4));
			// The flat of the hand lies along the reach, fingers tipped down.
			hand(-1, direction, hint.set(0.8, 0.5, 0.2));
			figure.grip(-1, 0.08, 0.1);
			blendArm(touch.amount);
		}
	}

	// --- Mounting ---------------------------------------------------------
	const origin = new THREE.Vector3(),
		hips = new THREE.Vector3(),
		a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		c = new THREE.Vector3(),
		yawAxis = new THREE.Vector3(0, 1, 0),
		facing = new THREE.Quaternion(),
		tilt = new THREE.Quaternion(),
		seatedAnkle = new THREE.Vector3();
	/** Where the walker stands to mount, measured from the horse's centre line. */
	const CLOSE = 0.86;

	/** A point given in the horse's seat space, in the turned figure's space. */
	const fromHorse = (out: THREE.Vector3) =>
		out.sub(origin).applyQuaternion(facing);

	/**
	 * The mount itself: step in facing the saddle, near foot into the stirrup,
	 * spring up to stand in it with the hands on the pommel and cantle, swing
	 * the far leg over the horse's back and sink into the seat. Dismounting
	 * plays it backwards.
	 */
	function mount(action: WalkerAction) {
		const m = action.seat ?? 0,
			side = action.side ?? -1,
			drop = action.bareback ? 0.08 : 0;
		const stepIn = smooth(0, 0.2, m),
			leanIn = smooth(0.1, 0.3, m),
			// She is already rising when the foot meets the stirrup: from the
			// ground it is higher than her hip.
			footUp = smooth(0.33, 0.5, m),
			rise = smooth(0.3, 0.58, m),
			over = smooth(0.52, 0.84, m),
			sit = smooth(0.78, 1, m);
		// The walker's origin in the horse's seat space.
		origin.set(side * (action.away ?? 0), action.lift ?? 0, 0);
		const yaw = -side * 1.3 * stepIn * (1 - over);
		figure.root.rotation.set(0, yaw, 0);
		facing.setFromAxisAngle(yawAxis, -yaw);
		figure.resetPose();

		// Hips: beside the horse, up over the stirrup, across, down.
		const standing = STIRRUP[1] + 0.035 + ankleHeight + legLength * 0.97;
		// She sinks on the ground leg, then springs off it.
		const crouch = 0.18 * Math.sin(Math.PI * smooth(0.16, 0.4, m) ** 1.5);
		hips.set(
			side * mix(origin.x * side, CLOSE, stepIn),
			hipRest.y - crouch,
			hipRest.z,
		);
		a.set(
			side * 0.66,
			Math.min(standing, SEAT_POINT.y + 0.42) + hipDrop0,
			-0.02,
		);
		hips.lerp(a, rise);
		a.set(side * 0.06, SEAT_POINT.y + 0.2 - drop, SEAT_POINT.z);
		hips.lerp(a, over);
		a.copy(SEAT_POINT);
		a.y -= drop;
		hips.lerp(a, sit);
		bones.hips.position.copy(fromHorse(a.copy(hips)));
		// She folds over the horse's back as she rises, then straightens.
		const fold = 0.34 * leanIn + 0.3 * rise * (1 - sit) - 0.08 * sit;
		const roll = side * 0.16 * rise * (1 - over);
		bones.hips.quaternion.setFromEuler(euler.set(fold * 0.55, 0, roll));
		bones.spine.quaternion.setFromEuler(euler.set(fold * 0.25, 0, -roll * 0.5));
		bones.chest.quaternion.setFromEuler(euler.set(fold * 0.2, 0, -roll * 0.5));
		bones.neck.quaternion.setFromEuler(euler.set(-fold * 0.3, 0, 0));
		bones.head.quaternion.setFromEuler(euler.set(-fold * 0.35, 0, 0));
		tilt.copy(bones.hips.quaternion);

		// Near leg: from the ground into the stirrup, where it carries her.
		const near = side,
			far = -side;
		// In the stirrup the foot points along the horse, not at its side, so
		// the leg turns out from the hip while she still faces the saddle.
		footDirection(figure, near, 0.1 * rise, near * 0.1, direction);
		direction.applyQuaternion(
			blended.setFromAxisAngle(yawAxis, -yaw * 0.8 * footUp),
		);
		b.set(near * STIRRUP[0], STIRRUP[1] + 0.035 - drop * 0.5, STIRRUP[2]);
		fromHorse(b).addScaledVector(direction, -ballFront * 1.02);
		a.set(near * stance, ankleHeight, rest.footL.z - 0.02);
		a.x += bones.hips.position.x;
		a.z += bones.hips.position.z - hipRest.z;
		// Leaving the ground, the foot swings up under her to the tread.
		target.lerpVectors(a, b, footUp);
		target.y += 0.1 * Math.sin(Math.PI * footUp);
		// The knee follows the toes and stays below the hip.
		pole.copy(direction).setY(0).normalize().setY(0.25);
		figure.reach(limb('thigh', near), limb('shin', near), target, pole);
		figure.aim(limb('foot', near), direction, up, up);

		// Far leg: pushes off, trails, then sweeps over the croup to its stirrup.
		footDirection(figure, far, 0.16, far * 0.14, direction);
		seatedAnkle
			.set(far * STIRRUP[0], STIRRUP[1] + 0.035, STIRRUP[2])
			.addScaledVector(direction, -ballFront);
		a.set(side * (CLOSE + 0.06), ankleHeight, -0.34);
		b.set(side * 0.78, SEAT_POINT.y - 0.95, -0.3);
		target.lerpVectors(a, b, smooth(0.34, 0.56, m));
		// Over the back: up behind the saddle, across, and down the far side.
		b.set(side * 0.3, SEAT_POINT.y + 0.34, -1.28);
		c.set(far * 0.62, SEAT_POINT.y - 0.2, -0.75);
		const sweep = smooth(0.5, 0.8, m),
			land = smooth(0.72, 0.98, m);
		target.lerp(b, smooth(0, 0.55, sweep));
		target.lerp(c, smooth(0.45, 1, sweep));
		target.lerp(seatedAnkle, land);
		fromHorse(target);
		// The knee leads the sweep, pointing up and back over the croup.
		pole
			.set(far * 0.2, 0.25, 1)
			.lerp(a.set(side * 0.5, -0.7, -0.3), Math.sin(Math.PI * sweep) * 0.9)
			.lerp(a.set(far * 0.55, 0.3, 1), land);
		pole.applyQuaternion(facing);
		figure.reach(limb('thigh', far), limb('shin', far), target, pole);
		// Pushing off, the foot points; over the back it trails; then heel down.
		const toePoint =
			-0.7 * smooth(0.28, 0.42, m) * (1 - smooth(0.6, 0.85, m)) + 0.16 * land;
		footDirection(figure, far, toePoint, far * 0.14 * land, direction);
		direction.applyQuaternion(tilt);
		figure.aim(limb('foot', far), direction, up, up);

		// Hands: the near one takes the mane in front of the saddle, the far
		// one the cantle; both come to the reins as she sits.
		const take = smooth(0.06, 0.26, m);
		for (const hold of [near, far]) {
			figure.figurePosition(bones[limb('arm', hold)], shoulder);
			// Hanging by her side until she takes hold.
			a.set(
				shoulder.x + hold * 0.12,
				shoulder.y - (armLength + forearmLength) * 0.93,
				shoulder.z + 0.12,
			);
			// The leading hand takes the mane just in front of the withers, the
			// other rests on the near side of the saddle to push up from.
			if (hold === near) b.set(side * 0.16, SEAT_POINT.y - 0.08 - drop, 0.5);
			else b.set(side * 0.26, SEAT_POINT.y - 0.1 - drop, -0.02);
			fromHorse(b);
			target.lerpVectors(a, b, take);
			// The saddle hand lets go as the leg comes over.
			c.set(
				hold * REIN_HAND[0],
				REIN_HAND[1] - drop,
				REIN_HAND[2] - palmLength * 0.8,
			);
			fromHorse(c);
			target.lerp(c, hold === near ? sit : smooth(0.5, 0.8, m));
			figure.reach(
				limb('arm', hold),
				limb('forearm', hold),
				target,
				pole.set(hold * 0.7, -0.9, -0.5),
			);
			direction.copy(target).sub(shoulder).normalize();
			direction.y -= 0.3;
			hand(hold, direction, hint.set(-hold * 0.4, 1, 0.2));
			figure.grip(hold, mix(0.3, 0.85, take), mix(0.2, 0.5, take));
		}

		// Ease out of the standing pose at the start and into the seat at the end.
		const fromStanding = 1 - smooth(0, 0.1, m),
			toSeat = smooth(0.88, 1, m);
		for (const name of Object.keys(bones) as BoneName[]) {
			const bone = bones[name];
			if (fromStanding > 0) bone.quaternion.slerp(posed[name], fromStanding);
			if (toSeat > 0) bone.quaternion.slerp(seated[name], toSeat);
		}
		bones.hips.position.lerp(hipsStanding, fromStanding);
	}

	function pose(dt: number, action: WalkerAction) {
		clock += dt;
		const seat = action.seat ?? 0;
		figure.root.rotation.set(0, 0, 0);
		walk(dt, seat > 0 ? { speed: 0 } : action);
		if (seat > 0) {
			for (const name of Object.keys(bones) as BoneName[])
				posed[name].copy(bones[name].quaternion);
			hipsStanding.copy(bones.hips.position);
			mount(action);
		}
		figure.swingHair(dt);
	}
	pose(0, { speed: 0 });
	root.visible = false;
	return { root, pose, leadHand, treat, figure };
}
