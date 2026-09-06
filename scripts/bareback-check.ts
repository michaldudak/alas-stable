import assert from 'node:assert/strict';
import { BASE_URL, launchBrowser } from './browser-support.ts';
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 800 },
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(() => window.__polana?.snapshot().calls);
	const snapshot = () => page.evaluate(() => window.__polana!.snapshot());
	await page.locator('#wardrobe').click();
	await page.locator('#preview-rider').click();
	const before = await page.locator('#horse-preview').screenshot();
	await page
		.getByRole('button', { name: 'Jazda: Na oklep', exact: true })
		.click();
	await page.waitForTimeout(150);
	assert.equal(
		before.equals(await page.locator('#horse-preview').screenshot()),
		false,
	);
	assert.equal((await snapshot()).horses[0].appearance.equipment, 'bareback');
	assert.ok(
		(await snapshot()).horses
			.slice(1)
			.every((h) => h.appearance.equipment === 'saddled'),
	);
	await page.screenshot({ path: 'artifacts/bareback-preview.jpg' });
	await page.locator('#close-dress').click();
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(800);
	await page.keyboard.press('Space');
	await page.waitForTimeout(350);
	assert.ok((await snapshot()).height > 0);
	await page.keyboard.press('ArrowDown');
	await page.waitForFunction(
		() =>
			window.__polana!.snapshot().jump < 0 &&
			window.__polana!.snapshot().speed < 0.01,
	);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'on-foot',
	);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'mounted',
	);
	assert.equal((await snapshot()).horses[0].appearance.equipment, 'bareback');
	await page.screenshot({ path: 'artifacts/bareback-riding.jpg' });
	await page.reload();
	await page.waitForFunction(() => window.__polana?.snapshot().calls);
	assert.equal((await snapshot()).horses[0].appearance.equipment, 'bareback');
	await page.locator('#wardrobe').click();
	assert.equal(
		await page
			.getByRole('button', { name: 'Jazda: Na oklep', exact: true })
			.getAttribute('aria-pressed'),
		'true',
	);
	await page
		.getByRole('button', { name: 'Jazda: W siodle', exact: true })
		.click();
	assert.equal((await snapshot()).horses[0].appearance.equipment, 'saddled');
	assert.deepEqual(errors, []);
	console.log(
		'Bareback checks passed: visible preview change, independent equipment, riding and jumping, dismount/remount, persistence and resaddling.',
	);
} finally {
	await browser.close();
}
