import * as THREE from 'three';
import { createFigure, type BoneName } from './figure.ts';
import { RIDER_SEAT, limb, seatedPose } from './rider.ts';

const up = new THREE.Vector3(0, 1, 0),
	forward = new THREE.Vector3(0, 0, 1);

/** The rider on foot: walks, runs, leads a horse and blends into the seat when mounting. */
export function createWalkingRider() {
	const root = new THREE.Group();
	root.name = 'walking-rider';
	const figure = createFigure();
	root.add(figure.root);
	seatedPose(figure);
	const seated = figure.snapshot();
	figure.resetPose();
	const ankleHeight = figure.rest.footL.y;
	const hips = [1, -1].map((side) => figure.rest[limb('thigh', side)]);
	const leadHand = new THREE.Group();
	leadHand.position.copy(figure.directions.handL).multiplyScalar(0.12);
	figure.bones.handL.add(leadHand);
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
	figure.bones.handR.add(treat);
	const walking = figure.snapshot(),
		target = new THREE.Vector3(),
		direction = new THREE.Vector3();
	const offerArm = ['armR', 'forearmR', 'handR'] as const,
		armRest = offerArm.map(() => new THREE.Quaternion());
	let phase = 0;
	function pose(
		dt: number,
		speed: number,
		seat = 0,
		swing = 0,
		side = -1,
		leading = false,
		/** 0–1: how far the right hand is held out with a treat. */
		offer = 0,
	) {
		const pace = Math.abs(speed),
			running = pace > 2.5;
		phase +=
			dt *
			(running ? 2.3 : 1.35) *
			Math.PI *
			2 *
			Math.min(1, pace / 1.8) *
			Math.sign(speed);
		const amount = Math.min(1, pace / 1.8) * (1 - seat);
		const compression = (running ? 0.09 : 0.04) * amount;
		figure.resetPose();
		figure.bones.spine.quaternion.setFromEuler(
			new THREE.Euler((running ? 0.12 : 0.04) * amount, 0, 0),
		);
		[1, -1].forEach((legSide, i) => {
			const wave = phase + i * Math.PI;
			const stride = Math.sin(wave) * (running ? 0.42 : 0.3) * amount;
			const lift =
				Math.max(0, Math.cos(wave)) * (running ? 0.2 : 0.08) * amount;
			target.set(hips[i].x, ankleHeight + lift + compression, stride);
			figure.reach(
				limb('thigh', legSide),
				limb('shin', legSide),
				target,
				new THREE.Vector3(legSide * 0.1, 0, 1),
			);
			figure.aim(
				limb('foot', legSide),
				figure.directions.footL.clone().setX(0),
				up,
				up,
			);
			// Arms swing against the legs; elbows bend more when running.
			const armSwing = -Math.sin(wave) * 0.38 * amount;
			const bend = 0.15 + (running ? 0.9 : 0.2) * amount;
			figure.aim(
				limb('arm', legSide),
				direction.set(legSide * 0.16, -Math.cos(armSwing), Math.sin(armSwing)),
				forward,
			);
			const elbow = armSwing + bend;
			figure.aim(
				limb('forearm', legSide),
				direction.set(legSide * 0.1, -Math.cos(elbow), Math.sin(elbow)),
				forward,
			);
			figure.aim(limb('hand', legSide), direction.clone(), forward);
		});
		if (leading) {
			figure.aim('armL', new THREE.Vector3(0.35, -0.75, 0.45), forward);
			figure.aim('forearmL', new THREE.Vector3(0.15, -0.35, 1), forward);
			figure.aim('handL', new THREE.Vector3(0.1, -0.3, 1), up);
		}
		if (offer > 0) {
			// Hold the treat out on a flat palm, just below shoulder height.
			offerArm.forEach((name, i) =>
				armRest[i].copy(figure.bones[name].quaternion),
			);
			figure.aim('armR', direction.set(0.12, -0.42, 1), forward);
			figure.aim('forearmR', direction.set(0.06, -0.08, 1), forward);
			figure.aim('handR', direction.set(0.02, -0.05, 1), up);
			offerArm.forEach((name, i) => {
				const bone = figure.bones[name];
				bone.quaternion.slerpQuaternions(
					armRest[i],
					bone.quaternion.clone(),
					offer,
				);
			});
		}
		for (const [name, quaternion] of Object.entries(figure.snapshot()))
			walking[name as BoneName].copy(quaternion);
		// Mounting blends towards the seat; one leg sweeps over the horse's back.
		for (const [name, bone] of Object.entries(figure.bones))
			bone.quaternion.slerpQuaternions(
				walking[name as BoneName],
				seated[name as BoneName],
				seat,
			);
		if (swing) {
			const thigh = figure.bones[side < 0 ? 'thighL' : 'thighR'];
			thigh.quaternion.multiply(
				new THREE.Quaternion().setFromEuler(
					new THREE.Euler(-0.5 * swing, 0, (side < 0 ? 1 : -1) * 1.1 * swing),
				),
			);
		}
		figure.root.position.set(0, -compression, RIDER_SEAT.z * seat);
	}
	pose(0, 0);
	root.visible = false;
	return { root, pose, leadHand, treat };
}
