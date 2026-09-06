import * as THREE from 'three';
import { limb, oval, surface } from './geometry.ts';
/** Shares face and clothing with the mounted rider; walking limbs have independent joints. */
export function createWalkingRider(source: THREE.Group) {
	const root = new THREE.Group();
	root.name = 'walking-rider';
	const upper = source.clone(true);
	for (const child of [...upper.children])
		if (child.name === 'seated-limb') upper.remove(child);
	upper.position.y = -1.4;
	const body = new THREE.Group();
	root.add(body);
	body.add(upper);
	const pants = surface('#d9ceb5'),
		boots = surface('#303a37', 0.52),
		shirt = surface('#bd7759'),
		glove = surface('#50453a', 0.67);
	const legs: THREE.Group[] = [],
		knees: THREE.Group[] = [],
		feet: THREE.Group[] = [],
		arms: THREE.Group[] = [],
		elbows: THREE.Group[] = [];
	for (const side of [-1, 1]) {
		const leg = new THREE.Group();
		leg.position.set(side * 0.19, 1.3, -0.12);
		body.add(leg);
		legs.push(leg);
		limb(leg, pants, [0, 0, 0], [0, -0.6, 0], 0.135, 0.09);
		oval(leg, pants, [0.09, 0.1, 0.095], [0, -0.6, 0]);
		const knee = new THREE.Group();
		knee.position.y = -0.6;
		leg.add(knee);
		knees.push(knee);
		limb(knee, boots, [0, 0, 0], [0, -0.58, 0], 0.09, 0.07);
		const foot = new THREE.Group();
		foot.position.y = -0.58;
		knee.add(foot);
		feet.push(foot);
		oval(foot, boots, [0.095, 0.065, 0.17], [0, -0.045, 0.065]);
		const arm = new THREE.Group();
		arm.position.set(side * 0.265, 1.77, -0.09);
		body.add(arm);
		arms.push(arm);
		limb(arm, shirt, [0, 0, 0], [0, -0.33, 0], 0.103, 0.075);
		oval(arm, shirt, [0.103, 0.115, 0.1], [0, 0, 0]);
		const elbow = new THREE.Group();
		elbow.position.y = -0.33;
		arm.add(elbow);
		elbows.push(elbow);
		limb(elbow, shirt, [0, 0, 0], [0, -0.3, 0], 0.073, 0.053);
		oval(elbow, glove, [0.055, 0.065, 0.07], [0, -0.34, 0]);
	}
	let phase = 0;
	function pose(dt: number, speed: number, seated = 0, swing = 0, side = -1) {
		phase +=
			dt * (speed > 2.5 ? 2.3 : 1.35) * Math.PI * 2 * Math.min(1, speed / 1.8);
		const amount = Math.min(1, speed / 1.8) * (1 - seated);
		const compression = (speed > 2.5 ? 0.11 : 0.06) * amount;
		body.position.y = -compression;
		upper.position.y = -1.4 + Math.abs(Math.sin(phase)) * 0.018 * amount;
		legs.forEach((leg, i) => {
			const wave = phase + i * Math.PI;
			const x = (i ? 1 : -1) * 0.45 * seated;
			const z =
				Math.sin(wave) * (speed > 2.5 ? 0.46 : 0.32) * amount + 0.32 * seated;
			const lift =
				Math.max(0, Math.cos(wave)) * (speed > 2.5 ? 0.23 : 0.1) * amount +
				0.12 * seated +
				(i === (side < 0 ? 1 : 0) ? swing * 1.3 : 0);
			const y = -1.18 + lift + compression;
			const planarY = -Math.hypot(x, y),
				length = Math.min(1.179, Math.hypot(planarY, z));
			const bend = -Math.acos(
				THREE.MathUtils.clamp(
					(length * length - 0.6 ** 2 - 0.58 ** 2) / (2 * 0.6 * 0.58),
					-1,
					1,
				),
			);
			const angle =
				Math.atan2(z, -planarY) -
				Math.atan2(0.58 * Math.sin(bend), 0.6 + 0.58 * Math.cos(bend));
			leg.rotation.order = 'ZXY';
			leg.rotation.set(-angle, 0, Math.atan2(x, -y), 'ZXY');
			knees[i].rotation.x = -bend;
			feet[i].quaternion
				.copy(leg.quaternion)
				.multiply(knees[i].quaternion)
				.invert();
			arms[i].rotation.x =
				-Math.sin(wave) * 0.38 * amount - 0.75 * seated - 0.25 * swing;
			elbows[i].rotation.x =
				-0.18 - 0.65 * seated - (speed > 2.5 ? 0.65 : 0.12) * amount;
		});
	}
	pose(0, 0);
	root.visible = false;
	return { root, pose };
}
