import type * as ThreeModule from 'three';
import type * as ModelModule from '../src/horse/model.ts';
import type * as AnimationModule from '../src/horse/animation.ts';
import type * as RiderAssetModule from '../src/horse/rider-asset.ts';
import type * as HorseAssetModule from '../src/horse/asset.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';
import { mkdir } from 'node:fs/promises';

// One stride of each gait in twelve frames, seen exactly from the side. The
// horse travels over stripes one metre apart, so a sliding hoof shows.
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 2400, height: 900 },
	});
	await page.route('**/gait-inspection', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<html><body style="margin:0;background:#e9e6d8;font:14px sans-serif"><main style="display:flex;flex-wrap:wrap"></main></body></html>',
		}),
	);
	await page.goto(`${BASE_URL}/gait-inspection`);
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
		const { createHorseAnimation } = (await import(
			String('/src/horse/animation.ts')
		)) as typeof AnimationModule;
		const width = 400,
			height = 330;
		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			preserveDrawingBuffer: true,
		});
		renderer.setSize(width, height);
		renderer.setPixelRatio(1);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color('#e9e6d8');
		scene.add(new THREE.HemisphereLight('#f4f7ff', '#8a8672', 2.3));
		const sun = new THREE.DirectionalLight('#fff3dc', 2.8);
		sun.position.set(5, 9, 4);
		scene.add(sun);
		// Stripes across the track every metre, darker every fifth.
		for (let i = -5; i <= 60; i++) {
			const stripe = new THREE.Mesh(
				new THREE.PlaneGeometry(6, 0.04),
				new THREE.MeshBasicMaterial({ color: i % 5 ? '#c4c1ad' : '#8f8c78' }),
			);
			stripe.rotation.x = -Math.PI / 2;
			stripe.position.set(0, 0.002, i);
			scene.add(stripe);
		}
		const camera = new THREE.PerspectiveCamera(11.5, width / height, 1, 200);
		const main = document.querySelector('main')!;
		const FRAMES = 12;
		for (const [gait, speed, label, frequency] of [
			[1, 2.5, 'Walk', 1.35],
			[2, 5.5, 'Trot', 1.7],
			[3, 9, 'Canter', 1.8],
		] as const) {
			const horse = createHorse();
			scene.add(horse.root);
			const animation = createHorseAnimation(horse);
			const state = { gait, speed, jump: -1 };
			const step = 1 / 240;
			let time = 0,
				z = 0;
			const advance = (until: number) => {
				for (; time < until; time += step) {
					animation.update(step, state, time);
					z += speed * step;
				}
			};
			advance(3);
			for (let frame = 0; frame < FRAMES; frame++) {
				advance(3 + frame / (FRAMES * frequency));
				horse.root.position.z = z;
				camera.position.set(22, 2.1, z + 0.3);
				camera.lookAt(0, 2.1, z + 0.3);
				renderer.render(scene, camera);
				const cell = document.createElement('figure');
				cell.style.cssText = 'margin:0;text-align:center';
				const image = document.createElement('img');
				image.src = renderer.domElement.toDataURL();
				const caption = document.createElement('figcaption');
				caption.textContent = `${label} ${frame + 1}/${FRAMES}`;
				cell.append(image, caption);
				main.append(cell);
			}
			scene.remove(horse.root);
		}
	});
	await page.screenshot({ path: 'artifacts/gait-strips.png', fullPage: true });
	console.log('Saved one stride of each gait from the side.');
} finally {
	await browser.close();
}
