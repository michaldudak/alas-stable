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
	assert.equal(await page.locator('#lead').isDisabled(), true);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__alasStable!.snapshot().riding === 'on-foot',
	);
	assert.equal((await state()).horses[0].halter, true);
	await page.keyboard.press('KeyL');
	assert.equal((await state()).leading, true);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__alasStable!.snapshot().riding === 'mounted',
	);
	assert.equal((await state()).leading, false);
	assert.equal((await state()).horses[0].halter, false);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__alasStable!.snapshot().riding === 'on-foot',
	);
	await page.keyboard.press('KeyL');
	const start = await state();
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(2400);
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(2500);
	const followed = await state();
	assert.ok(followed.horse.z < start.horse.z - 3);
	assert.ok(
		Math.hypot(followed.x - followed.horse.x, followed.z - followed.horse.z) <=
			6.1,
	);
	await page.screenshot({ path: 'artifacts/leading-horse.jpg' });
	await page.keyboard.press('Escape');
	const paused = await state();
	await page.waitForTimeout(250);
	assert.deepEqual((await state()).horse, paused.horse);
	await page.locator('#resume').click();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.waitForTimeout(2200);
	await page.keyboard.press('KeyL');
	assert.equal((await state()).leading, false);
	const parked = (await state()).horse;
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(2500);
	assert.deepEqual((await state()).horse, parked);
	await page.keyboard.press('KeyL');
	assert.equal((await state()).leading, false);
	await page.locator('#home').click();
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__alasStable!.snapshot().riding === 'on-foot',
	);
	await page.locator('#lead').click();
	assert.equal((await state()).leading, true);
	await page.locator('#home').click();
	assert.equal((await state()).leading, false);
	assert.deepEqual(errors, []);
	console.log(
		'Leading checks passed: halters, attach/release, mount cleanup, walk/run follow, rope distance, pause, waiting horse, proximity and reset.',
	);
} finally {
	await browser.close();
}
