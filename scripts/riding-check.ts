import assert from 'node:assert/strict';
import { BASE_URL, launchBrowser } from './browser-support.ts';
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
	});
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(() => window.__polana?.snapshot().calls);
	const horse = (await page.evaluate(() => window.__polana!.snapshot())).horse;
	await page.keyboard.press('KeyE');
	await page.waitForTimeout(650);
	assert.equal(
		(await page.evaluate(() => window.__polana!.snapshot())).riding,
		'dismounting',
	);
	await page.screenshot({ path: 'artifacts/dismount.png' });
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'on-foot',
	);
	await page.screenshot({ path: 'artifacts/on-foot.png' });
	assert.equal(await page.locator('#jump').isDisabled(), true);
	await page.keyboard.press('Space');
	assert.equal(
		(await page.evaluate(() => window.__polana!.snapshot())).jump,
		-1,
	);
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(800);
	assert.equal(await page.locator('#gait').textContent(), 'Chód');
	await page.keyboard.press('ArrowUp');
	await page.waitForTimeout(1000);
	assert.equal(await page.locator('#gait').textContent(), 'Bieg');
	assert.deepEqual(
		(await page.evaluate(() => window.__polana!.snapshot())).horse,
		horse,
	);
	await page.keyboard.press('KeyE');
	assert.equal(
		(await page.evaluate(() => window.__polana!.snapshot())).riding,
		'on-foot',
	);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.waitForFunction(() => window.__polana!.snapshot().speed < 0.01);
	await page.keyboard.down('ArrowLeft');
	await page.waitForFunction(() => {
		const h = window.__polana!.snapshot().heading;
		return Math.abs(Math.atan2(Math.sin(h), Math.cos(h))) < 0.055;
	});
	await page.keyboard.up('ArrowLeft');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.waitForFunction(() => window.__polana!.snapshot().z > 22.7);
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('KeyE');
	await page.waitForTimeout(850);
	await page.screenshot({ path: 'artifacts/mount.png' });
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'mounted',
	);
	assert.equal(await page.locator('#jump').isDisabled(), false);
	await page.keyboard.press('KeyE');
	await page.waitForTimeout(250);
	await page.keyboard.press('Escape');
	const frozen = await page.evaluate(() => window.__polana!.snapshot());
	await page.waitForTimeout(250);
	assert.equal(
		(await page.evaluate(() => window.__polana!.snapshot())).height,
		frozen.height,
	);
	await page
		.getByRole('button', { name: 'Wracamy do jazdy', exact: true })
		.click();
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'on-foot',
	);
	await page.keyboard.press('KeyC');
	assert.equal(
		(await page.evaluate(() => window.__polana!.snapshot())).firstPerson,
		true,
	);
	await page.getByRole('button', { name: 'Do stajni', exact: true }).click();
	assert.equal(
		(await page.evaluate(() => window.__polana!.snapshot())).riding,
		'mounted',
	);
	await page.keyboard.press('KeyE');
	await page.waitForFunction(
		() => window.__polana!.snapshot().riding === 'on-foot',
	);
	const beforeReverse = await page.evaluate(() => window.__polana!.snapshot());
	await page.keyboard.press('KeyS');
	await page.waitForTimeout(1300);
	const reversed = await page.evaluate(() => window.__polana!.snapshot());
	assert.equal(reversed.gait, -1);
	assert.equal(await page.locator('#gait').textContent(), 'Cofanie');
	assert.equal(await page.locator('#slower').isDisabled(), true);
	assert.ok(reversed.z > beforeReverse.z + 0.8);
	assert.equal(reversed.heading, beforeReverse.heading);
	assert.deepEqual(reversed.horse, beforeReverse.horse);
	await page.screenshot({ path: 'artifacts/walking-backward.png' });
	await page.keyboard.press('KeyW');
	await page.waitForFunction(
		() => Math.abs(window.__polana!.snapshot().speed) < 0.01,
	);
	assert.equal(await page.locator('#gait').textContent(), 'Postój');
	await page.keyboard.press('ArrowUp');
	await page.waitForFunction(() => window.__polana!.snapshot().speed > 1.5);
	assert.equal(await page.locator('#gait').textContent(), 'Chód');
	assert.deepEqual(errors, []);
	console.log(
		'Riding checks passed: dismount/mount, walk/run/reverse, waiting horse, proximity, no foot jump, pause, first person and reset.',
	);
} finally {
	await browser.close();
}
