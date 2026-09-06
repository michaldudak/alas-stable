import assert from 'node:assert/strict';
import { BASE_URL, launchBrowser } from './browser-support.ts';
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		locale: 'pl-PL',
		viewport: { width: 1200, height: 800 },
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(() => window.__polana?.snapshot().calls);
	const state = () => page.evaluate(() => window.__polana!.snapshot());
	async function stop() {
		const gait = (await state()).gait;
		for (let i = 0; i < gait; i++) await page.keyboard.press('ArrowDown');
		await page.waitForFunction(
			() => Math.abs(window.__polana!.snapshot().speed) < 0.01,
		);
	}
	async function turn(angle: number) {
		const s = await state(),
			delta = Math.atan2(
				Math.sin(angle - s.heading),
				Math.cos(angle - s.heading),
			);
		if (Math.abs(delta) < 0.02) return;
		const key = delta > 0 ? 'ArrowLeft' : 'ArrowRight';
		await page.keyboard.down(key);
		await page.waitForFunction(
			({ angle }) => {
				const h = window.__polana!.snapshot().heading;
				return (
					Math.abs(Math.atan2(Math.sin(angle - h), Math.cos(angle - h))) < 0.035
				);
			},
			{ angle },
		);
		await page.keyboard.up(key);
	}
	async function go(x: number, z: number, gait = 1) {
		const s = await state();
		await turn(Math.atan2(x - s.x, z - s.z));
		for (let i = 0; i < gait; i++) await page.keyboard.press('ArrowUp');
		try {
			await page.waitForFunction(
				({ x, z, dx, dz, braking }) => {
					const current = window.__polana!.snapshot();
					return (
						((x - current.x) * dx + (z - current.z) * dz) / Math.hypot(dx, dz) <
						braking
					);
				},
				{
					x,
					z,
					dx: x - s.x,
					dz: z - s.z,
					braking:
						s.riding === 'mounted'
							? [0, 0.7, 1.45, 2.3][gait]
							: [0, 0.27, 0.53][gait],
				},
				{ timeout: 30000 },
			);
		} catch (e) {
			console.log('Navigation stopped', x, z, await state());
			throw e;
		}
		await stop();
	}
	await go(-38, 24, 3);
	await go(-38, 6, 2);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'on-foot',
	);
	const parked = (await state()).horses.find((h) => h.name === 'Raven')!;
	await go(-38, 2, 2);
	await go(-38, -3.15, 1);
	await go(-43, -3.15, 1);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'mounted',
	);
	assert.equal((await state()).activeHorse, 'FUKS');
	assert.deepEqual(
		(await state()).horses.find((h) => h.name === 'Raven'),
		parked,
	);
	await page.locator('#wardrobe').click();
	assert.equal(await page.locator('#dress-dialog h2').textContent(), 'FUKS');
	await page.getByRole('button', { name: 'Maść: Siwa', exact: true }).click();
	await page.screenshot({ path: 'artifacts/fuks-appearance.jpg' });
	await page.locator('#close-dress').click();
	assert.equal(
		(await state()).horses.find((h) => h.name === 'FUKS')!.appearance.coat,
		'#e6e0d2',
	);
	assert.deepEqual(
		(await state()).horses.find((h) => h.name === 'Raven'),
		parked,
	);
	await go(-38, -2, 1);
	await page.screenshot({ path: 'artifacts/fuks-riding.jpg' });
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'on-foot',
	);
	const fuks = (await state()).horses.find((h) => h.name === 'FUKS')!;
	// Approach the other side of Raven without passing through either horse.
	await go(-35.7, 1, 1);
	await go(parked.x + 1.65, parked.z, 1);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'mounted',
	);
	assert.equal((await state()).activeHorse, 'Raven');
	assert.deepEqual(
		(await state()).horses.find((h) => h.name === 'FUKS'),
		fuks,
	);
	await page.reload();
	await page.waitForFunction(() => window.__polana?.snapshot().calls);
	assert.equal(
		(await state()).horses.find((h) => h.name === 'FUKS')!.appearance.coat,
		'#e6e0d2',
	);
	assert.equal(
		(await state()).horses.find((h) => h.name === 'Raven')!.appearance.coat,
		parked.appearance.coat,
	);
	assert.deepEqual(errors, []);
	console.log(
		'Herd browser checks passed: switch horses, ride out of a stall, independent decoration, return to Raven, persistence.',
	);
} finally {
	await browser.close();
}
