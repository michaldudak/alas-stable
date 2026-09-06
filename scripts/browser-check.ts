import { BASE_URL, launchBrowser } from './browser-support.ts';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		locale: 'pl-PL',
		viewport: { width: 1440, height: 900 },
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(
		() => (window.__alasStable?.snapshot().calls ?? 0) > 0,
	);
	await page.screenshot({ path: 'artifacts/start.png' });
	await page.keyboard.press('KeyS');
	await page.waitForFunction(() => window.__alasStable!.snapshot().z > 24.5);
	assert.equal(await page.locator('#gait').textContent(), 'Cofanie');
	assert.equal(await page.locator('#slower').isDisabled(), true);
	await page.keyboard.press('KeyW');
	await page.waitForFunction(
		() => Math.abs(window.__alasStable!.snapshot().speed) < 0.01,
	);
	assert.equal(await page.locator('#gait').textContent(), 'Postój');
	await page.getByRole('button', { name: 'Do stajni', exact: true }).click();
	const before = await page.evaluate(() => window.__alasStable!.snapshot());
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(1100);
	const moving = await page.evaluate(() => window.__alasStable!.snapshot());
	assert.equal(moving.gait, 1);
	assert.ok(moving.z < before.z - 1);
	await page.keyboard.down('ArrowUp');
	await page.waitForTimeout(350);
	await page.keyboard.up('ArrowUp');
	assert.equal(
		(await page.evaluate(() => window.__alasStable!.snapshot())).gait,
		2,
	);
	await page.keyboard.press('Space');
	await page.waitForTimeout(300);
	assert.ok(
		(await page.evaluate(() => window.__alasStable!.snapshot())).height > 0.5,
	);
	await page.keyboard.press('KeyC');
	assert.equal(
		(await page.evaluate(() => window.__alasStable!.snapshot())).firstPerson,
		true,
	);
	await page.screenshot({ path: 'artifacts/first-person.png' });
	await page.keyboard.press('Escape');
	const paused = await page.evaluate(() => window.__alasStable!.snapshot());
	assert.equal(paused.paused, true);
	await page.waitForTimeout(250);
	assert.equal(
		(await page.evaluate(() => window.__alasStable!.snapshot())).z,
		paused.z,
	);
	await page
		.getByRole('button', { name: 'Wracamy do jazdy', exact: true })
		.click();
	await page.getByRole('button', { name: 'Do stajni', exact: true }).click();
	await page.keyboard.press('KeyC');
	await page.getByRole('button', { name: 'Wygląd konia', exact: true }).click();
	const previewPosition = await page.evaluate(() =>
		window.__alasStable!.snapshot(),
	);
	const previewCanvas = page.locator('#horse-preview');
	const originalPreview = await previewCanvas.screenshot();
	await page
		.getByRole('button', { name: 'Obróć w prawo', exact: true })
		.click();
	await page
		.getByRole('button', { name: 'Obróć w prawo', exact: true })
		.click();
	await page.getByRole('button', { name: 'Przybliż', exact: true }).click();
	await page.waitForTimeout(200);
	assert.equal(originalPreview.equals(await previewCanvas.screenshot()), false);
	await page
		.getByRole('button', { name: 'Pokaż jeźdźca', exact: true })
		.click();
	assert.equal(
		await page
			.getByRole('button', { name: 'Pokaż jeźdźca', exact: true })
			.getAttribute('aria-pressed'),
		'true',
	);
	await page.screenshot({ path: 'artifacts/model-rider.png' });
	await page
		.getByRole('button', { name: 'Pokaż jeźdźca', exact: true })
		.click();
	await page.getByRole('button', { name: 'Cały koń', exact: true }).click();
	await page.getByRole('button', { name: 'Maść: Siwa', exact: true }).click();
	await page.getByRole('button', { name: 'Ozdoby', exact: true }).click();
	await page
		.getByRole('button', { name: 'Ozdoba: Kwiaty', exact: true })
		.click();
	await page.screenshot({ path: 'artifacts/wardrobe.png' });
	assert.equal(
		(await page.evaluate(() => window.__alasStable!.snapshot())).z,
		previewPosition.z,
	);
	await page
		.getByRole('button', { name: 'Wracamy na polanę', exact: true })
		.click();
	await page.reload();
	await page.waitForFunction(
		() => (window.__alasStable?.snapshot().calls ?? 0) > 0,
	);
	await page.getByRole('button', { name: 'Wygląd konia', exact: true }).click();
	await page.getByRole('button', { name: 'Kolory', exact: true }).click();
	assert.equal(
		await page
			.getByRole('button', { name: 'Maść: Siwa', exact: true })
			.getAttribute('aria-pressed'),
		'true',
	);
	await page
		.getByRole('button', { name: 'Wracamy na polanę', exact: true })
		.click();
	await page.getByRole('button', { name: 'Do stajni', exact: true }).click();
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.waitForFunction(() => window.__alasStable!.snapshot().z < 12);
	await page.keyboard.press('Space');
	await page.waitForFunction(() => window.__alasStable!.snapshot().z < 6);
	assert.equal(
		(await page.evaluate(() => window.__alasStable!.snapshot())).obstacles[0]
			.down,
		0,
	);
	await page.waitForFunction(() => window.__alasStable!.snapshot().z < -9);
	assert.ok(
		(await page.evaluate(() => window.__alasStable!.snapshot())).obstacles[1]
			.down > 0,
	);
	// Continue straight to the actual enclosure boundary, then jump out.
	await page.waitForFunction(() => window.__alasStable!.snapshot().z < -34);
	await page.keyboard.press('Space');
	await page.waitForFunction(() => window.__alasStable!.snapshot().z < -41);
	assert.equal(
		(await page.evaluate(() => window.__alasStable!.snapshot())).gait,
		3,
	);
	await page.screenshot({ path: 'artifacts/fence-jump.png' });
	await page.getByRole('button', { name: 'Do stajni', exact: true }).click();
	await page.setViewportSize({ width: 640, height: 720 });
	await page.screenshot({ path: 'artifacts/compact.png' });
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		true,
	);
	assert.deepEqual(errors, []);
	await page.setViewportSize({ width: 320, height: 640 });
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		true,
	);
	await page.getByRole('button', { name: 'Wygląd konia', exact: true }).click();
	await page.screenshot({ path: 'artifacts/preview-compact.png' });
	assert.equal(
		await page
			.locator('#dress-dialog')
			.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
		true,
	);
	await page.keyboard.press('Escape');
	assert.equal(
		(await page.evaluate(() => window.__alasStable!.snapshot())).paused,
		false,
	);
	console.log(
		'Browser checks passed: rendering, persistent gait, jump, cameras, pause, reset, appearance persistence, successful rail clearance, missed rail, 640px and 320px layouts; no page errors.',
	);
} finally {
	await browser.close();
}
