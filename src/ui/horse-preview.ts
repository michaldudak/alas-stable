import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { HorseModel } from '../horse/types.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createHorsePreview(
	canvas: HTMLCanvasElement,
	horse: HorseModel,
) {
	const events = new AbortController();
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
	});
	renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	const scene = new THREE.Scene();
	scene.add(new THREE.HemisphereLight('#fff6e6', '#8c9b86', 2.1));
	const light = new THREE.DirectionalLight('#fff0db', 2.6);
	light.position.set(4, 7, 5);
	light.castShadow = true;
	light.shadow.mapSize.set(1024, 1024);
	Object.assign(light.shadow.camera, {
		left: -4,
		right: 4,
		top: 5,
		bottom: -4,
		near: 0.1,
		far: 20,
	});
	light.shadow.normalBias = 0.025;
	scene.add(light);
	const fill = new THREE.DirectionalLight('#d5e9ee', 1.3);
	fill.position.set(-4, 4, -3);
	scene.add(fill);
	const model = clone(horse.root);
	model.position.set(0, 0, 0);
	model.rotation.set(0, 0, 0);
	const body = model.getObjectByName(horse.body.name)!;
	body.position.set(0, 0, 0);
	body.rotation.set(0, 0, 0);
	// Build the preview once at startup, before locomotion changes the pose.
	scene.add(model);
	const rider = model.getObjectByName(horse.rider.name)!;
	rider.visible = false;
	const variantPairs: [THREE.Object3D, THREE.Object3D][] = [];
	horse.root.traverse((object) => {
		if (object.name.startsWith('choice:'))
			variantPairs.push([object, model.getObjectByName(object.name)!]);
	});
	const floor = new THREE.Mesh(
		new THREE.CircleGeometry(200, 64),
		new THREE.ShadowMaterial({ opacity: 0.14 }),
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = 0.008;
	floor.receiveShadow = true;
	scene.add(floor);
	const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 250);
	const controls = new OrbitControls(camera, canvas);
	controls.target.set(0, 1.95, 0.25);
	controls.enablePan = false;
	controls.enableDamping = true;
	controls.minDistance = 4;
	controls.maxDistance = 12;
	controls.minPolarAngle = 0.5;
	controls.maxPolarAngle = Math.PI / 2 - 0.04;
	const offset = new THREE.Vector3(),
		spherical = new THREE.Spherical();
	function reset() {
		camera.position.set(5.1, 3.2, 5.1);
		controls.target.set(0, 1.95, 0.25);
		controls.update();
	}
	reset();
	function rotate(direction: number) {
		offset.copy(camera.position).sub(controls.target);
		spherical.setFromVector3(offset);
		spherical.theta += (direction * Math.PI) / 8;
		camera.position
			.copy(offset.setFromSpherical(spherical))
			.add(controls.target);
		controls.update();
	}
	function zoom(direction: number) {
		offset.copy(camera.position).sub(controls.target);
		offset.setLength(
			THREE.MathUtils.clamp(
				offset.length() * (direction > 0 ? 0.83 : 1.2),
				controls.minDistance,
				controls.maxDistance,
			),
		);
		camera.position.copy(controls.target).add(offset);
		controls.update();
	}
	canvas.addEventListener(
		'keydown',
		(event) => {
			if (
				['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)
			) {
				event.preventDefault();
				if (event.code === 'ArrowLeft') rotate(-1);
				if (event.code === 'ArrowRight') rotate(1);
				if (event.code === 'ArrowUp') zoom(1);
				if (event.code === 'ArrowDown') zoom(-1);
			}
		},
		{ signal: events.signal },
	);
	let lastWidth = 0,
		lastHeight = 0;
	return {
		dispose() {
			events.abort();
			controls.dispose();
			model.traverse((object) => {
				if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
			});
			// The cloned horse shares geometry/materials with the live horse, whose scene owns them.
			floor.geometry.dispose();
			floor.material.dispose();
			light.shadow.dispose();
			scene.clear();
			renderer.dispose();
		},
		rotate,
		zoom,
		reset,
		toggleRider() {
			rider.visible = !rider.visible;
			return rider.visible;
		},
		render() {
			const width = canvas.clientWidth,
				height = canvas.clientHeight;
			if (!width || !height) return;
			if (width !== lastWidth || height !== lastHeight) {
				renderer.setSize(width, height, false);
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
				lastWidth = width;
				lastHeight = height;
			}
			model.getObjectByName('rider-seat')!.position.y =
				horse.getAppearance().equipment === 'bareback' ? -0.08 : 0;
			for (const [original, copy] of variantPairs)
				copy.visible = original.visible;
			controls.update();
			renderer.render(scene, camera);
		},
	};
}
