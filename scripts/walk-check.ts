import type * as ThreeModule from 'three';
import type * as WalkerModule from '../src/horse/walking-rider.ts';
import type * as RiderAssetModule from '../src/horse/rider-asset.ts';
import type * as HorseAssetModule from '../src/horse/asset.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		locale: 'pl-PL',
		viewport: { width: 1440, height: 900 },
	});
	await page.route('**/walk-inspection', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<html><body style="margin:0;background:#f1eddf;font:14px sans-serif"><main style="display:grid;grid-template-columns:repeat(8,1fr)"></main></body></html>',
		}),
	);
	await page.goto(`${BASE_URL}/walk-inspection`);
	await page.evaluate(async () => {
		const THREE = (await import(
			String('/node_modules/.vite/deps/three.js')
		)) as typeof ThreeModule;
		const { loadHorseAsset } = (await import(
			String('/src/horse/asset.ts')
		)) as typeof HorseAssetModule;
		const { loadRiderAsset } = (await import(
			String('/src/horse/rider-asset.ts')
		)) as typeof RiderAssetModule;
		await loadHorseAsset('/src/assets/horse.glb');
		await loadRiderAsset('/src/assets/rider.glb');
		const { createWalkingRider, stepTiming } = (await import(
			String('/src/horse/walking-rider.ts')
		)) as typeof WalkerModule;
		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			preserveDrawingBuffer: true,
		});
		renderer.setSize(180, 260);
		renderer.setPixelRatio(1);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color('#eeeada');
		scene.add(new THREE.HemisphereLight('#fff5df', '#83927b', 2.4));
		const light = new THREE.DirectionalLight('#fff8e8', 2.4);
		light.position.set(4, 8, 5);
		scene.add(light);
		// Stripes every half metre make foot sliding easy to spot.
		for (let i = -20; i <= 20; i++) {
			const stripe = new THREE.Mesh(
				new THREE.PlaneGeometry(4, 0.03),
				new THREE.MeshBasicMaterial({ color: i % 2 ? '#c9c7b3' : '#b8b59d' }),
			);
			stripe.rotation.x = -Math.PI / 2;
			stripe.position.set(0, 0.001, i * 0.5);
			scene.add(stripe);
		}
		const camera = new THREE.PerspectiveCamera(32, 180 / 260, 0.1, 50);
		const main = document.querySelector('main')!;
		function cell(label: string) {
			renderer.render(scene, camera);
			const box = document.createElement('div');
			box.style.cssText = 'text-align:center';
			const title = document.createElement('p');
			title.textContent = label;
			title.style.margin = '6px';
			const image = document.createElement('img');
			image.src = renderer.domElement.toDataURL();
			image.width = 180;
			box.append(title, image);
			main.append(box);
		}
		function view(side: boolean, z: number) {
			if (side) camera.position.set(6.4, 1.5, z);
			else camera.position.set(0, 1.6, z + 6.8);
			camera.lookAt(0, 1.2, z);
		}
		type Action = Parameters<ReturnType<typeof createWalkingRider>['pose']>[1];
		function sequence(
			label: string,
			action: (t: number) => Action,
			frames: number,
			span: number,
			side = true,
			settle = 2,
		) {
			const walker = createWalkingRider();
			walker.root.visible = true;
			scene.add(walker.root);
			let z = 0,
				t = 0;
			const step = 1 / 120;
			for (; t < settle; t += step) {
				const a = action(t);
				walker.pose(step, a);
				z += a.speed * step;
			}
			for (let frame = 0; frame < frames; frame++) {
				const until = settle + ((frame + 1) * span) / frames;
				for (; t < until; t += step) {
					const a = action(t);
					walker.pose(step, a);
					z += a.speed * step;
				}
				walker.root.position.z = z;
				view(side, z);
				cell(`${label} ${frame + 1}`);
			}
			scene.remove(walker.root);
		}
		const walk = 1 / stepTiming(1.8).frequency,
			run = 1 / stepTiming(3.8).frequency,
			back = 1 / stepTiming(0.9).frequency;
		sequence('Walk', () => ({ speed: 1.8 }), 8, walk);
		sequence('Run', () => ({ speed: 3.8 }), 8, run);
		sequence('Walk front', () => ({ speed: 1.8 }), 4, walk / 2, false);
		sequence('Back', () => ({ speed: -0.9 }), 4, back);
		sequence('Start', (t) => ({ speed: t < 2 ? 0 : 1.8 }), 4, 1.2, true, 2);
		sequence('Stop', (t) => ({ speed: t < 2.2 ? 1.8 : 0 }), 4, 1.2);
		sequence('Idle', () => ({ speed: 0 }), 4, 6, false);
		sequence('Turn', () => ({ speed: 0, turn: 2 }), 4, 1.1, false);
		sequence('Lead', () => ({ speed: 1.8, lead: true }), 2, walk / 2);
		sequence('Carry', () => ({ speed: 0.9, carry: true }), 2, back / 2);
		sequence('Offer', () => ({ speed: 0, offer: 1 }), 2, 1);
		sequence(
			'Stroke',
			() => ({
				speed: 0,
				touch: {
					target: new THREE.Vector3(0.1, 2.6, 0.9),
					amount: 1,
					stroke: 1,
				},
				look: new THREE.Vector3(0.1, 2.6, 0.9),
			}),
			2,
			0.3,
		);
	});
	await page.screenshot({ path: 'artifacts/walk-phases.png', fullPage: true });
	console.log('Saved the walking, running and gesture sheet.');
} finally {
	await browser.close();
}
