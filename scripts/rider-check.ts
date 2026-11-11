import type * as ThreeModule from 'three';
import type * as FigureModule from '../src/horse/figure.ts';
import type * as RiderAssetModule from '../src/horse/rider-asset.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';
import { mkdir } from 'node:fs/promises';

// Renders every rider model from all sides, with close-ups of the head,
// hands and boots, for checking a rebuilt asset by eye.
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1600, height: 900 },
	});
	await page.route('**/rider-inspection', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<html><body style="margin:0;background:#d9d6c8;font:14px sans-serif"><main style="display:flex;flex-wrap:wrap"></main></body></html>',
		}),
	);
	await page.goto(`${BASE_URL}/rider-inspection`);
	await page.evaluate(async () => {
		const THREE = (await import(
			String('/node_modules/.vite/deps/three.js')
		)) as typeof ThreeModule;
		const { loadRiderAsset, riderFiles, RIDER_MODEL_IDS } = (await import(
			String('/src/horse/rider-asset.ts')
		)) as typeof RiderAssetModule;
		const { createFigure } = (await import(
			String('/src/horse/figure.ts')
		)) as typeof FigureModule;
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
		sun.position.set(3, 7, 5);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.left = sun.shadow.camera.bottom = -3;
		sun.shadow.camera.right = sun.shadow.camera.top = 3;
		sun.shadow.bias = -0.0005;
		scene.add(sun);
		const ground = new THREE.Mesh(
			new THREE.CircleGeometry(4, 48),
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
			width = 360,
			size = 520,
		) {
			const camera = new THREE.PerspectiveCamera(20, width / size, 0.1, 80);
			const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(10)));
			const direction = new THREE.Vector3(...eye).normalize();
			camera.position.set(...target).addScaledVector(direction, distance);
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
		for (const id of RIDER_MODEL_IDS) {
			await loadRiderAsset(id, riderFiles('/src/assets/riders', id));
			const figure = createFigure(id);
			scene.add(figure.root);
			const top = figure.ends.head.y,
				middle = top / 2;
			shot(`${id} front`, [0, 0.1, 1], [0, middle, 0], top * 1.12);
			shot(`${id} three-quarter`, [0.7, 0.15, 1], [0, middle, 0], top * 1.12);
			shot(`${id} side`, [1, 0.1, 0], [0, middle, 0], top * 1.12);
			shot(`${id} back`, [-0.4, 0.15, -1], [0, middle, 0], top * 1.12);
			const head = top - 0.22;
			shot('face', [0.25, 0.05, 1], [0, head, 0.05], 0.62, 400, 400);
			shot('profile', [1, 0.05, 0.1], [0, head, 0], 0.62, 400, 400);
			shot(
				'eyes',
				[0.1, 0, 1],
				[0, figure.ends.head.y - 0.19, 0.1],
				0.3,
				400,
				400,
			);
			shot('ponytail', [1, 0.1, -0.5], [0, head - 0.12, -0.08], 0.7, 400, 400);
			shot(
				'head from behind',
				[-0.5, 0.15, -1],
				[0, head - 0.12, 0],
				0.9,
				400,
				400,
			);
			shot('torso', [0.3, 0.1, 1], [0, top * 0.68, 0], 1.3, 400, 400);
			const hand = figure.rest.handL;
			shot(
				'hand',
				[0.8, 0.3, 1],
				[hand.x + 0.03, hand.y - 0.1, hand.z + 0.08],
				0.5,
				400,
				400,
			);
			shot('boots', [0.7, 0.2, 1], [0.1, 0.42, 0.05], 1.05, 400, 400);
			shot(
				'seat of the breeches',
				[-0.8, 0.1, -1],
				[0, top * 0.42, 0],
				1.3,
				400,
				400,
			);
			scene.remove(figure.root);
		}
	});
	await page.screenshot({ path: 'artifacts/rider-model.png', fullPage: true });
	console.log('Saved the rider model sheet.');
} finally {
	await browser.close();
}
