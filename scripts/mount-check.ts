import type * as ThreeModule from 'three';
import type * as ModelModule from '../src/horse/model.ts';
import type * as WalkerModule from '../src/horse/walking-rider.ts';
import type * as RiderAssetModule from '../src/horse/rider-asset.ts';
import type * as HorseAssetModule from '../src/horse/asset.ts';
import type * as RidingModule from '../src/game/riding.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';
import { mkdir } from 'node:fs/promises';

// Renders the seated rider from four sides and the mount in twelve frames,
// from the side and from behind, for checking the choreography by eye.
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1680, height: 900 },
	});
	await page.route('**/mount-inspection', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<html><body style="margin:0;background:#d9d6c8;font:13px sans-serif"><main style="display:flex;flex-wrap:wrap"></main></body></html>',
		}),
	);
	await page.goto(`${BASE_URL}/mount-inspection`);
	await page.evaluate(async () => {
		const THREE = (await import(
			String('/node_modules/.vite/deps/three.js')
		)) as typeof ThreeModule;
		const { loadHorseAsset } = (await import(
			String('/src/horse/asset.ts')
		)) as typeof HorseAssetModule;
		const { loadRiderAsset, riderFiles, DEFAULT_RIDER_MODEL } = (await import(
			String('/src/horse/rider-asset.ts')
		)) as typeof RiderAssetModule;
		await loadHorseAsset('/src/assets/horse.glb');
		await loadRiderAsset(
			DEFAULT_RIDER_MODEL,
			riderFiles('/src/assets/riders', DEFAULT_RIDER_MODEL),
		);
		const { createHorse } = (await import(
			String('/src/horse/model.ts')
		)) as typeof ModelModule;
		const { createWalkingRider } = (await import(
			String('/src/horse/walking-rider.ts')
		)) as typeof WalkerModule;
		const { transferFrame, MOUNT_DISTANCE } = (await import(
			String('/src/game/riding.ts')
		)) as typeof RidingModule;
		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			preserveDrawingBuffer: true,
		});
		renderer.setPixelRatio(1);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.shadowMap.enabled = true;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color('#d9d6c8');
		scene.add(new THREE.HemisphereLight('#f4f7ff', '#8a8672', 2.2));
		const sun = new THREE.DirectionalLight('#fff3dc', 3);
		sun.position.set(4, 9, 5);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
		sun.shadow.camera.right = sun.shadow.camera.top = 6;
		scene.add(sun);
		const ground = new THREE.Mesh(
			new THREE.CircleGeometry(12, 48),
			new THREE.MeshStandardMaterial({ color: '#b9b5a2', roughness: 1 }),
		);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		scene.add(ground);
		const main = document.querySelector('main')!;
		function shot(
			label: string,
			eye: [number, number, number],
			target: [number, number, number],
			height: number,
			width = 280,
			size = 300,
		) {
			const camera = new THREE.PerspectiveCamera(20, width / size, 0.1, 80);
			const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(10)));
			camera.position
				.set(...target)
				.addScaledVector(new THREE.Vector3(...eye).normalize(), distance);
			camera.lookAt(...target);
			renderer.setSize(width, size);
			renderer.render(scene, camera);
			const box = document.createElement('figure');
			box.style.cssText = 'margin:0;text-align:center';
			const image = document.createElement('img');
			image.src = renderer.domElement.toDataURL();
			const caption = document.createElement('figcaption');
			caption.textContent = label;
			box.append(image, caption);
			main.append(box);
		}
		const horse = createHorse();
		scene.add(horse.root);
		horse.root.updateMatrixWorld(true);
		shot('seat, side', [1, 0.08, 0.1], [0, 2.3, 0.2], 4.6, 420, 420);
		shot('seat, front', [0.15, 0.1, 1], [0, 2.3, 0], 4.6, 420, 420);
		shot('seat, behind', [-0.3, 0.2, -1], [0, 2.3, 0], 4.6, 420, 420);
		shot('seat, close', [1, 0.15, 0.6], [0.2, 2.9, 0.1], 2.4, 420, 420);
		horse.gesture(1, 0.5, -1);
		shot('pat', [-1, 0.2, 0.7], [0, 2.9, 0.3], 2.6, 420, 420);
		horse.gesture(0, 0, -1);
		horse.rider.visible = false;
		const walker = createWalkingRider();
		walker.root.visible = true;
		scene.add(walker.root);
		const state = { x: 0, z: 0, heading: 0 } as Parameters<
			typeof transferFrame
		>[0];
		const side = { x: MOUNT_DISTANCE, z: 0 };
		for (const [name, eye] of [
			['side', [1, 0.12, 0.25]],
			['behind', [0.25, 0.2, -1]],
		] as const)
			for (let i = 0; i <= 11; i++) {
				const frame = transferFrame(state, side, 1 - i / 11);
				walker.root.position.set(frame.x, frame.height, frame.z);
				for (let k = 0; k < 20; k++)
					walker.pose(1 / 60, {
						speed: 0,
						seat: frame.seat,
						side: 1,
						away: frame.away,
						lift: frame.height,
					});
				shot(`mount ${name} ${i}`, [...eye], [0.5, 2.1, 0], 4.6);
			}
	});
	await page.screenshot({ path: 'artifacts/rider-mount.png', fullPage: true });
	console.log('Saved the seat and mount sheet.');
} finally {
	await browser.close();
}
