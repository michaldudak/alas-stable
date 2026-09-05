import type * as ThreeModule from 'three';
import type * as HorseModule from '../src/horse/model.ts';
import type * as AnimationModule from '../src/horse/animation.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 990 },
	});
	await page.route('**/gait-inspection', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<html><body style="margin:0;background:#f1eddf;font:16px sans-serif"><main style="display:grid;grid-template-columns:repeat(4,1fr)"></main></body></html>',
		}),
	);
	await page.goto(`${BASE_URL}/gait-inspection`);
	await page.evaluate(async () => {
		const THREE = (await import(
			String('/node_modules/.vite/deps/three.js')
		)) as typeof ThreeModule;
		const { createHorse } = (await import(
			String('/src/horse/model.ts')
		)) as typeof HorseModule;
		const { createHorseAnimation } = (await import(
			String('/src/horse/animation.ts')
		)) as typeof AnimationModule;
		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			preserveDrawingBuffer: true,
		});
		renderer.setSize(360, 290);
		renderer.setPixelRatio(1);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color('#eeeada');
		scene.add(new THREE.HemisphereLight('#fff5df', '#83927b', 2.5));
		const light = new THREE.DirectionalLight('#fff8e8', 2.4);
		light.position.set(5, 8, 5);
		scene.add(light);
		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry(30, 30),
			new THREE.MeshStandardMaterial({ color: '#d3d3be' }),
		);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = -0.01;
		scene.add(floor);
		const camera = new THREE.PerspectiveCamera(38, 360 / 290, 0.1, 50);
		camera.position.set(7, 2.9, 1.4);
		camera.lookAt(0, 1.85, 0.1);
		for (const [gait, speed, label, freq] of [
			[1, 2.5, 'Walk', 1.35],
			[2, 5.5, 'Trot', 1.7],
			[3, 9, 'Canter', 1.8],
		] as const) {
			const horse = createHorse();
			scene.add(horse.root);
			const anim = createHorseAnimation(horse);
			const state = { gait, speed, jump: -1 };
			for (let i = 0; i < 360; i++) anim.update(1 / 120, state, i / 120);
			for (let frame = 0; frame < 4; frame++) {
				for (let i = 0; i < 30; i++)
					anim.update(
						1 / (120 * freq),
						state,
						3 + frame / (4 * freq) + i / (120 * freq),
					);
				renderer.render(scene, camera);
				const cell = document.createElement('div');
				cell.style.cssText = 'height:330px;text-align:center';
				const title = document.createElement('p');
				title.textContent = label + ' - ' + (frame + 1);
				title.style.cssText = 'margin:8px';
				const image = document.createElement('img');
				image.src = renderer.domElement.toDataURL();
				image.width = 360;
				cell.append(title, image);
				document.querySelector('main')!.append(cell);
			}
			scene.remove(horse.root);
		}
	});
	await page.screenshot({
		path: 'artifacts/gait-phases.png',
		fullPage: true,
	});
	console.log('Saved side-view phase sheet for all three gait animations.');
} finally {
	await browser.close();
}
