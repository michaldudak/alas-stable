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
	await page.waitForFunction(() => window.__alasStable?.snapshot().calls);
	const state = () => page.evaluate(() => window.__alasStable!.snapshot());
	async function stop() {
		const gait = (await state()).gait;
		for (let i = 0; i < gait; i++) await page.keyboard.press('ArrowDown');
		await page.waitForFunction(
			() => Math.abs(window.__alasStable!.snapshot().speed) < 0.01,
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
				const h = window.__alasStable!.snapshot().heading;
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
					const current = window.__alasStable!.snapshot();
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
		() => window.__alasStable!.snapshot().riding === 'on-foot',
	);
	const parked = (await state()).horses.find((h) => h.id === 'Raven')!;
	// Waiting horses potter about, but only a few steps from where they were left.
	const near = async (name: string, spot: { x: number; z: number }) => {
		const h = (await state()).horses.find((entry) => entry.id === name)!;
		assert.ok(Math.hypot(h.x - spot.x, h.z - spot.z) < 4, name);
	};
	await go(-38, 2, 2);
	await go(-38, -2, 1);
	await go(-40.3, -2, 1);
	// From the aisle, the rider walks into the stall and up to Fuks's side.
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__alasStable!.snapshot().riding === 'mounted',
		undefined,
		{ timeout: 10000 },
	);
	assert.equal((await state()).activeHorse, 'FUKS');
	await near('Raven', parked);
	await page.locator('#wardrobe').click();
	assert.equal(await page.locator('#dress-dialog h2').textContent(), 'Fuks');
	// Renaming shows at once and ignores unsafe characters.
	await page.locator('#horse-name').fill('  <Pierniczek>  ');
	await page.locator('#horse-name').press('Enter');
	assert.equal(
		await page.locator('#dress-dialog h2').textContent(),
		'Pierniczek',
	);
	assert.equal(await page.locator('#horse-name').inputValue(), 'Pierniczek');
	await page.getByRole('button', { name: 'Maść: Siwa', exact: true }).click();
	await page.screenshot({ path: 'artifacts/fuks-appearance.jpg' });
	await page.locator('#close-dress').click();
	assert.equal(
		(await state()).horses.find((h) => h.id === 'FUKS')!.appearance.coat,
		'#e6e0d2',
	);
	await near('Raven', parked);
	await go(-44.5, -2, 1);
	await go(-38, -2, 1);
	await page.screenshot({ path: 'artifacts/fuks-riding.jpg' });
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__alasStable!.snapshot().riding === 'on-foot',
	);
	const fuks = (await state()).horses.find((h) => h.id === 'FUKS')!;
	// Walk towards Raven; mounting walks the last steps round to its side.
	const raven = (await state()).horses.find((h) => h.id === 'Raven')!;
	await go(-36, raven.z - 1.5, 1);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__alasStable!.snapshot().riding === 'mounted',
		undefined,
		{ timeout: 10000 },
	);
	assert.equal((await state()).activeHorse, 'Raven');
	await near('FUKS', fuks);
	await page.reload();
	await page.waitForFunction(() => window.__alasStable?.snapshot().calls);
	assert.equal(
		(await state()).horses.find((h) => h.id === 'FUKS')!.appearance.coat,
		'#e6e0d2',
	);
	assert.equal(
		(await state()).horses.find((h) => h.id === 'Raven')!.appearance.coat,
		parked.appearance.coat,
	);
	assert.equal(
		(await state()).horses.find((h) => h.id === 'FUKS')!.name,
		'Pierniczek',
	);
	assert.deepEqual(errors, []);
	console.log(
		'Herd browser checks passed: switch horses, ride out of a stall, independent decoration, renaming, return to Raven, persistence.',
	);
} finally {
	await browser.close();
}
