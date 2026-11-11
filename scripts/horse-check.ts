import type * as ThreeModule from 'three';
import type * as ModelModule from '../src/horse/model.ts';
import type * as RiderAssetModule from '../src/horse/rider-asset.ts';
import type * as HorseAssetModule from '../src/horse/asset.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';
import { mkdir } from 'node:fs/promises';

// Renders the horse without tack from every side, with close-ups of the head
// and legs, for checking a rebuilt asset against photographs.
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1680, height: 900 },
	});
	await page.route('**/horse-inspection', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<html><body style="margin:0;background:#d9d6c8;font:13px sans-serif"><main style="display:flex;flex-wrap:wrap"></main></body></html>',
		}),
	);
	await page.goto(`${BASE_URL}/horse-inspection`);
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
		sun.shadow.bias = -0.0005;
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
			width = 560,
			size = 440,
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
		horse.setAppearance({ ...horse.getAppearance(), equipment: 'bareback' });
		horse.rider.visible = false;
		horse.bridle.visible = false;
		scene.add(horse.root);
		horse.root.updateMatrixWorld(true);
		shot('side', [1, 0.03, 0.05], [0, 2.0, 0.3], 4.6);
		shot('three-quarter front', [0.75, 0.15, 1], [0, 2.0, 0.3], 4.6);
		shot('front', [0.02, 0.05, 1], [0, 2.0, 0], 4.6);
		shot('three-quarter rear', [0.7, 0.2, -1], [0, 2.0, 0], 4.6);
		shot('rear', [0.02, 0.08, -1], [0, 2.0, 0], 4.6);
		shot('from above', [0.3, 1, 0.2], [0, 2.0, 0.3], 5.2);
		shot('head, side', [1, 0.05, 0.15], [0, 2.95, 2.2], 1.25, 560, 560);
		shot('head, three-quarter', [0.7, 0.1, 1], [0, 2.95, 2.2], 1.25, 560, 560);
		shot('head, front', [0.05, 0, 1], [0, 2.95, 2.0], 1.4, 560, 560);
		shot('forelegs', [1, 0.1, 0.5], [0.2, 0.75, 0.7], 1.8, 560, 560);
		shot('hind legs', [1, 0.1, -0.4], [0.2, 0.95, -1.2], 2.2, 560, 560);
		shot('chest and shoulder', [0.8, 0.1, 1], [0, 2.1, 0.9], 2.2, 560, 560);
	});
	await page.screenshot({ path: 'artifacts/horse-model.png', fullPage: true });
	console.log('Saved the horse model sheet.');
} finally {
	await browser.close();
}
