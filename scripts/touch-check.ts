import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { BASE_URL, launchBrowser } from './browser-support.ts';

const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		hasTouch: true,
		viewport: { width: 1024, height: 768 },
		locale: 'en-US',
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(() => !!window.__alasStable);
	await expect(page.locator('#touch-controls')).toBeVisible();
	await expect(page.locator('#touch-camera')).toHaveCount(0);
	await expect(page.locator('#hint p')).toContainText('movement stick');
	const cdp = await page.context().newCDPSession(page);
	const frames = () =>
		page.evaluate(async () => {
			for (let i = 0; i < 4; i++)
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
		});
	const snapshot = () => page.evaluate(() => window.__alasStable!.snapshot());
	const bounds = await page.locator('#touch-move').boundingBox();
	assert.ok(bounds);
	let points = [
		{ id: 1, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
	];
	const touch = (
		type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
	) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
	await touch('touchStart');
	points[0].x -= 25;
	points[0].y -= 30;
	await touch('touchMove');
	await frames();
	const moving = await snapshot();
	assert.ok(moving.speed > 0 && moving.speed <= 1.2);
	assert.ok(moving.heading > Math.PI, 'Touch stick steers');
	points.push({ id: 2, x: 500, y: 360 });
	await touch('touchStart');
	points[1].x += 80;
	await touch('touchMove');
	await frames();
	assert.ok(
		(await snapshot()).cameraLook < -0.2,
		'Scene dragging turns the camera while steering',
	);
	assert.ok(
		(await snapshot()).speed > 0,
		'Scene dragging does not release the movement stick',
	);
	const jump = await page.locator('[data-touch-action="jump"]').boundingBox();
	assert.ok(jump);
	points.push({
		id: 3,
		x: jump.x + jump.width / 2,
		y: jump.y + jump.height / 2,
	});
	await touch('touchStart');
	await frames();
	assert.ok(
		(await snapshot()).jump >= 0,
		'A third finger can jump while moving and dragging the scene',
	);
	points = points.slice(0, 2);
	await touch('touchMove');
	points = [points[0]];
	await touch('touchMove');
	await frames();
	assert.ok(
		(await snapshot()).speed > 0,
		'Releasing camera drag does not release movement',
	);
	points = [];
	await touch('touchEnd');
	await frames();
	assert.equal(
		(await snapshot()).speed,
		0,
		'Releasing the stick stops fine movement',
	);
	await page.waitForFunction(() => window.__alasStable!.snapshot().jump < 0);
	const faster = page.locator('[data-touch-action="faster"]');
	await faster.tap();
	assert.equal((await snapshot()).gait, 1, 'Touch action fires only once');
	await page.locator('[data-touch-action="slower"]').tap();
	assert.equal((await snapshot()).gait, 0);
	points = [{ id: 4, x: bounds.x + bounds.width / 2, y: bounds.y + 20 }];
	await touch('touchStart');
	await frames();
	points = [];
	await touch('touchCancel');
	await frames();
	assert.equal(
		(await snapshot()).speed,
		0,
		'Cancelled touch cannot leave movement held',
	);
	await page.locator('#touch-menu').tap();
	await expect(page.locator('#pause-dialog')).toBeVisible();
	await page.locator('#pause-settings').tap();
	await page.locator('#touch-mode').selectOption('off');
	await expect(page.locator('#touch-controls')).toBeHidden();
	await page.reload();
	await page.waitForFunction(() => !!window.__alasStable);
	await expect(page.locator('#touch-controls')).toBeHidden();
	await page.locator('#settings').tap();
	await page.locator('#touch-mode').selectOption('auto');
	await page.locator('#close-settings').tap();
	await expect(page.locator('#touch-controls')).toBeVisible();
	await page.evaluate(() =>
		Object.defineProperty(navigator, 'getGamepads', {
			configurable: true,
			value: () => [
				{
					id: 'Touch test gamepad',
					index: 0,
					connected: true,
					mapping: 'standard',
					axes: [0.5, 0, 0, 0],
					buttons: Array.from({ length: 17 }, () => ({
						pressed: false,
						value: 0,
						touched: false,
					})),
				},
			],
		}),
	);
	await expect(page.locator('#touch-controls')).toBeHidden();
	await page.evaluate(() =>
		Object.defineProperty(navigator, 'getGamepads', {
			configurable: true,
			value: () => [],
		}),
	);
	await frames();
	await page.locator('#resume').tap();
	await expect(page.locator('#touch-controls')).toBeVisible();
	await page.locator('#touch-menu').tap();
	await page.locator('#pause-settings').tap();
	await page.locator('#language').selectOption('pl');
	await expect(page.locator('label[for="touch-mode"]')).toHaveText(
		'Sterowanie dotykowe',
	);
	await page.locator('#close-settings').tap();
	await mkdir('artifacts', { recursive: true });
	for (const [width, height] of [
		[1024, 768],
		[768, 1024],
		[390, 844],
		[320, 568],
		[844, 390],
	]) {
		await page.setViewportSize({ width, height });
		await frames();
		const boxes = await page
			.locator('#touch-move, #touch-menu, [data-touch-action]')
			.evaluateAll((elements) =>
				elements.map((element) => {
					const box = element.getBoundingClientRect();
					return {
						id: element.id || element.getAttribute('data-touch-action'),
						x: box.x,
						y: box.y,
						width: box.width,
						height: box.height,
					};
				}),
			);
		for (const box of boxes) {
			assert.ok(box.width >= 48 && box.height >= 48, JSON.stringify(box));
			assert.ok(
				box.x >= 0 &&
					box.y >= 0 &&
					box.x + box.width <= width &&
					box.y + box.height <= height,
				JSON.stringify(box),
			);
		}
		assert.equal(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
			true,
		);
		await page.screenshot({
			path: 'artifacts/touch-' + width + 'x' + height + '.png',
		});
	}
	const desktop = await browser.newPage({
		viewport: { width: 1440, height: 900 },
	});
	await desktop.goto(BASE_URL);
	await expect(desktop.locator('#touch-controls')).toBeHidden();
	await desktop.close();
	assert.deepEqual(errors, []);
	console.log(
		'Touch checks passed: automatic detection, multi-touch movement/camera/jump, cancellation, single-action taps, saved preference, gamepad switching, localization, five screen sizes and desktop fallback.',
	);
} finally {
	await browser.close();
}
