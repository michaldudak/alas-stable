import assert from 'node:assert/strict';
import type { SkinnedMesh, Vector3 } from 'three';
import type * as HorseModule from '../src/horse/model.ts';
import type * as TrailerModule from '../src/game/trailer.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';

/**
 * The clubhouse bed, the horse trailer, the travel map and every place the
 * car drives to, including a race at the hippodrome.
 */
const browser = await launchBrowser();
try {
	const context = await browser.newContext({
		locale: 'pl-PL',
		viewport: { width: 1200, height: 800 },
	});
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(() => window.__alasStable?.snapshot().calls);
	const snapshot = () => page.evaluate(() => window.__alasStable!.snapshot());
	const teleport = (x: number, z: number, heading: number) =>
		page.evaluate(
			([x, z, heading]) => window.__alasStable!.debug!.teleport(x, z, heading),
			[x, z, heading],
		);
	const until = (test: () => Promise<boolean>, seconds: number) =>
		(async () => {
			for (let i = 0; i < seconds * 10; i++) {
				if (await test()) return true;
				await page.waitForTimeout(100);
			}
			return false;
		})();

	// Sleeping in the clubhouse bed skips to seven in the morning.
	await page.evaluate(() => window.__alasStable!.debug!.setTime!(22));
	await teleport(-57, 25, -Math.PI / 2);
	await page.waitForTimeout(300);
	await page.keyboard.press('e');
	assert.ok(
		await until(async () => (await snapshot()).riding === 'on-foot', 5),
	);
	await teleport(-67, 34.4, -2.6);
	await page.waitForTimeout(400);
	await page.waitForSelector('#prompt-use:not([hidden])');
	await page.keyboard.press('e');
	assert.ok(
		await until(
			async () => (await page.textContent('#clock'))?.startsWith('7:') ?? false,
			5,
		),
	);
	assert.equal(await page.textContent('#location'), 'Domek klubowy');

	// A led horse brought up behind the ramp walks into the trailer.
	await page.evaluate(() => window.__alasStable!.debug!.setTime!(15));
	const waiting = (await snapshot()).horses.find((h) => h.id === 'Raven')!;
	await teleport(waiting.x - 1.8, waiting.z, -Math.PI / 2);
	await page.waitForTimeout(300);
	await page.keyboard.press('l');
	assert.ok(await until(async () => (await snapshot()).leading, 3));
	await teleport(-63.5, 26.4, -Math.PI / 2);
	assert.ok(await until(async () => (await snapshot()).aboard === 'Raven', 15));

	// The horse's ears, on the trailer floor, stay well under the roof.
	const clearance = await page.evaluate(async () => {
		const model = '/src/horse/model.ts',
			trailer = '/src/game/trailer.ts';
		const { createHorse } = (await import(
			/* @vite-ignore */ model
		)) as typeof HorseModule;
		const { RIG } = (await import(
			/* @vite-ignore */ trailer
		)) as typeof TrailerModule;
		const horse = createHorse();
		horse.rider.visible = false;
		horse.tack.visible = false;
		horse.root.updateMatrixWorld(true);
		let top = -Infinity;
		horse.root.traverseVisible((object) => {
			const mesh = object as SkinnedMesh;
			const position = mesh.geometry?.attributes?.position;
			if (!position) return;
			const point = new (
				horse.root.position.constructor as new () => Vector3
			)();
			for (let i = 0; i < position.count; i += 3) {
				point.fromBufferAttribute(position, i);
				if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, point);
				top = Math.max(top, point.applyMatrix4(mesh.matrixWorld).y);
			}
		});
		horse.dispose();
		return RIG.trailer.roof - RIG.trailer.floor - top;
	});
	assert.ok(clearance > 0.3, `${clearance} m under the trailer roof`);

	// E at the driver's door opens the map; the horse rides along.
	await teleport(-76.3, 27.4, 0);
	await page.waitForTimeout(400);
	await page.keyboard.press('e');
	await page.waitForSelector('#travel-dialog[open]');
	assert.equal(await page.textContent('#travel-cargo'), 'W przyczepie: Raven');
	assert.ok(await page.isDisabled('[data-region="home"]'));
	await page.click('[data-region="beach"]');
	assert.ok(await until(async () => (await snapshot()).region === 'beach', 20));
	await page.waitForTimeout(2600);
	let state = await snapshot();
	assert.equal(state.aboard, 'Raven');
	assert.equal(await page.textContent('#location'), 'Parking');

	// Behind the ramp, L leads the horse back out on the lead rope.
	const rig = state.rig;
	await teleport(rig.x - 10.5, rig.z + 2, Math.PI / 2);
	await page.keyboard.press('l');
	assert.ok(
		await until(async () => {
			const s = await snapshot();
			return s.leading && !s.aboard && !s.boarding;
		}, 15),
	);
	state = await snapshot();
	const raven = state.horses.find((h) => h.id === 'Raven')!;
	assert.ok(raven.x < rig.x - 8, 'the horse stands clear of the ramp');

	// Every other place builds and draws without errors.
	for (const region of ['mountains', 'hippodrome', 'home'] as const) {
		await page.keyboard.press('l');
		await page.evaluate((r) => window.__alasStable!.debug!.travel!(r), region);
		assert.ok(
			await until(async () => (await snapshot()).region === region, 20),
			region,
		);
		await page.waitForTimeout(2600);
		state = await snapshot();
		assert.ok(state.calls > 0);
		assert.equal(state.riding, 'on-foot');
		if (region === 'mountains') {
			// The mountain stable can be walked into through its south door.
			await teleport(-40, -2960 + 13 + 5, Math.PI);
			await page.keyboard.press('ArrowUp');
			assert.ok(
				await until(
					async () =>
						(await page.textContent('#location')) === 'Górska stajnia',
					10,
				),
			);
			await page.keyboard.press('ArrowDown');
			assert.ok(
				await until(async () => Math.abs((await snapshot()).speed) < 0.1, 5),
			);
			// Its horses can be ridden, and the tarn's fence can be jumped.
			await teleport(-37, -2960 - 8, -Math.PI / 2);
			await page.waitForTimeout(400);
			await page.keyboard.press('e');
			assert.ok(
				await until(async () => (await snapshot()).riding === 'mounted', 15),
			);
			assert.ok(['HALNY', 'TURNIA'].includes((await snapshot()).activeHorse));
			const fence = -3000 - 38 + 17 + 2.5;
			await teleport(48, fence + 16, Math.PI);
			for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
			assert.ok(await until(async () => (await snapshot()).z < fence + 6, 8));
			await page.keyboard.press('Space');
			assert.ok(await until(async () => (await snapshot()).z < fence - 2, 4));
			for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
			assert.ok(await until(async () => (await snapshot()).speed < 0.05, 5));
			await page.keyboard.press('e');
			assert.ok(
				await until(async () => (await snapshot()).riding === 'on-foot', 8),
			);
		}
		if (region === 'hippodrome') {
			// The racing stables can be walked into through their south door.
			await teleport(-3092, -68, Math.PI);
			await page.keyboard.press('ArrowUp');
			assert.ok(
				await until(
					async () =>
						(await page.textContent('#location')) === 'Stajnia wyścigowa',
					10,
				),
			);
			await page.keyboard.press('ArrowDown');
		}
	}
	assert.deepEqual(
		await page.evaluate(() => window.__alasStable!.debug!.navCheck!(0.8)),
		[],
	);
	assert.deepEqual(errors, []);
	console.log(
		'Travel checks passed: sleep, trailer loading, travel map, unloading, every place.',
	);
} finally {
	await browser.close();
}
