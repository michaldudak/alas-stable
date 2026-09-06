import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { BASE_URL, launchBrowser } from './browser-support.ts';

const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		locale: 'en-GB',
		viewport: { width: 1280, height: 800 },
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(
		() => (window.__polana?.snapshot().calls ?? 0) > 0,
	);
	assert.equal(await page.locator('html').getAttribute('lang'), 'en');
	assert.equal(await page.title(), 'Horse Glade');
	await page.keyboard.press('ArrowUp');
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const before = await page.evaluate(() => window.__polana!.snapshot());
	assert.equal(before.paused, true);
	await page.getByLabel('Language', { exact: true }).selectOption('pl');
	assert.equal(await page.title(), 'Końska Polana');
	assert.equal(await page.locator('#gait').textContent(), 'Stęp');
	assert.equal(
		await page.locator('#hint strong').textContent(),
		'Świetnie! Teraz wybierz swoją drogę.',
	);
	assert.equal(
		await page.locator('#camera').getAttribute('aria-label'),
		'Zza konia',
	);
	const after = await page.evaluate(() => window.__polana!.snapshot());
	assert.equal(after.x, before.x);
	assert.equal(after.z, before.z);
	assert.deepEqual(after.horses, before.horses);
	assert.equal(after.gait, before.gait);
	await page.keyboard.press('Escape');
	assert.equal(
		await page.locator('#game').evaluate((el) => el === document.activeElement),
		true,
	);
	await page.reload();
	await page.waitForFunction(
		() => (window.__polana?.snapshot().calls ?? 0) > 0,
	);
	assert.equal(await page.locator('html').getAttribute('lang'), 'pl');
	await page.locator('#sound').click();
	await page.locator('#settings').click();
	await page.locator('#language').selectOption('en');
	assert.equal(
		await page.locator('#sound').getAttribute('aria-pressed'),
		'false',
	);
	assert.equal(await page.locator('#sound span').textContent(), 'Sound');
	await mkdir('artifacts', { recursive: true });
	await page.screenshot({ path: 'artifacts/settings-en.png' });
	await page.locator('#close-settings').click();
	await page.locator('#wardrobe').click();
	await page
		.getByRole('button', { name: 'Riding: Bareback', exact: true })
		.click();
	await page.locator('#close-dress').click();
	await page.locator('#settings').click();
	await page.locator('#language').selectOption('pl');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: 'artifacts/settings-pl-mobile.png' });
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		true,
	);
	await page.locator('#close-settings').click();
	await page.locator('#wardrobe').click();
	assert.equal(
		await page
			.getByRole('button', { name: 'Jazda: Na oklep', exact: true })
			.getAttribute('aria-pressed'),
		'true',
	);
	assert.equal(
		(await page.locator('body').textContent())!.includes('{{'),
		false,
	);
	assert.deepEqual(errors, []);
	await page.close();
	for (const [locale, expected] of [
		['pl-PL', 'pl'],
		['de-DE', 'en'],
	] as const) {
		const fresh = await browser.newPage({ locale });
		await fresh.goto(BASE_URL);
		await fresh.waitForFunction(
			() => (window.__polana?.snapshot().calls ?? 0) > 0,
		);
		assert.equal(await fresh.locator('html').getAttribute('lang'), expected);
		await fresh.close();
	}
	const restricted = await browser.newPage({ locale: 'pl-PL' });
	await restricted.addInitScript(() => {
		Object.defineProperty(window, 'localStorage', {
			get() {
				throw new Error('Storage disabled');
			},
		});
	});
	await restricted.goto(BASE_URL);
	await restricted.waitForFunction(
		() => (window.__polana?.snapshot().calls ?? 0) > 0,
	);
	await restricted.locator('#settings').click();
	await restricted.locator('#language').selectOption('en');
	assert.equal(await restricted.locator('html').getAttribute('lang'), 'en');
	await restricted.close();
	console.log('Localization browser checks passed.');
} finally {
	await browser.close();
}
