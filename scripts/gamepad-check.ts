import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { BASE_URL, launchBrowser } from './browser-support.ts';

declare global {
	interface Window {
		__gamepadTest: {
			buttons: number[];
			axes: number[];
			connected: boolean;
			mapping: string;
			actuator: boolean;
			reject: boolean;
			effects: { strength: number; duration: number }[];
			resets: number;
		};
	}
}

const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1280, height: 800 },
		locale: 'en-US',
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const state = (window.__gamepadTest = {
			buttons: [] as number[],
			axes: [0, 0, 0, 0],
			connected: true,
			mapping: 'standard',
			actuator: true,
			reject: false,
			effects: [] as { strength: number; duration: number }[],
			resets: 0,
		});
		Object.defineProperty(navigator, 'getGamepads', {
			value: () =>
				state.connected
					? [
							{
								id: 'Virtual test controller',
								index: 0,
								connected: true,
								mapping: state.mapping,
								axes: [...state.axes],
								buttons: Array.from({ length: 17 }, (_, index) => ({
									pressed: state.buttons.includes(index),
									value: Number(state.buttons.includes(index)),
									touched: false,
								})),
								vibrationActuator: state.actuator
									? {
											playEffect: (
												_type: string,
												options: { strongMagnitude: number; duration: number },
											) => {
												if (state.reject)
													return Promise.reject(
														new Error('Unsupported actuator'),
													);
												state.effects.push({
													strength: options.strongMagnitude,
													duration: options.duration,
												});
												return Promise.resolve('complete');
											},
											reset: () => {
												state.resets++;
												return Promise.resolve('complete');
											},
										}
									: undefined,
							},
						]
					: [],
		});
	});
	await page.goto(BASE_URL);
	await page.waitForFunction(() => !!window.__polana);
	await page.locator('#game').click();
	const frames = () =>
		page.evaluate(async () => {
			for (let i = 0; i < 3; i++)
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
		});
	const press = async (button: number) => {
		await page.evaluate((button) => {
			window.__gamepadTest.buttons = [button];
		}, button);
		await frames();
		await page.evaluate(() => {
			window.__gamepadTest.buttons = [];
		});
		await frames();
	};
	const snapshot = () => page.evaluate(() => window.__polana!.snapshot());
	const start = await snapshot();
	await page.evaluate(() => {
		window.__gamepadTest.axes[1] = -0.6;
	});
	await page.waitForTimeout(200);
	assert.ok(
		(await snapshot()).z < start.z,
		'Left stick moves forward momentarily',
	);
	assert.equal((await snapshot()).gait, 0);
	await page.evaluate(() => {
		window.__gamepadTest.axes[1] = 0;
	});
	await frames();
	const released = await snapshot();
	await frames();
	assert.equal(
		(await snapshot()).z,
		released.z,
		'Release stops fine movement immediately',
	);
	await page.evaluate(() => {
		window.__gamepadTest.axes[1] = 0.6;
	});
	await page.waitForTimeout(200);
	assert.ok(
		(await snapshot()).z > released.z,
		'Left stick moves backward momentarily',
	);
	await page.evaluate(() => {
		window.__gamepadTest.axes[1] = 0;
		window.__gamepadTest.axes[3] = -1;
	});
	await page.waitForTimeout(200);
	const closeZoom = (await snapshot()).cameraDistanceScale;
	assert.ok(closeZoom < 1);
	await page.evaluate(() => {
		window.__gamepadTest.axes[3] = 1;
	});
	await page.waitForTimeout(200);
	assert.ok((await snapshot()).cameraDistanceScale > closeZoom);
	await page.evaluate(() => {
		window.__gamepadTest.axes[3] = 0;
	});
	await frames();
	const retainedZoom = (await snapshot()).cameraDistanceScale;
	await frames();
	assert.equal((await snapshot()).cameraDistanceScale, retainedZoom);
	await press(5);
	assert.equal((await snapshot()).gait, 1);
	await page.evaluate(() => {
		window.__gamepadTest.axes[1] = -1;
	});
	await frames();
	await page.waitForFunction(() => window.__polana!.snapshot().speed > 2.5);
	const boostedSpeed = (await snapshot()).speed;
	assert.equal((await snapshot()).gait, 1);
	await page.evaluate(() => {
		window.__gamepadTest.axes[1] = 0;
	});
	await frames();
	assert.ok(
		(await snapshot()).speed < boostedSpeed,
		'Release resumes the selected gait',
	);
	await page.evaluate(() => {
		window.__gamepadTest.buttons = [5];
	});
	await frames();
	await page.waitForTimeout(450);
	assert.equal((await snapshot()).gait, 2, 'Held bumper changes gait once');
	await page.evaluate(() => {
		window.__gamepadTest.buttons = [];
	});
	await frames();
	await press(4);
	await press(4);
	const heading = (await snapshot()).heading;
	await page.evaluate(() => {
		window.__gamepadTest.axes[0] = 0.1;
	});
	await page.waitForTimeout(180);
	assert.equal(
		(await snapshot()).heading,
		heading,
		'Stick drift stays inside dead zone',
	);
	await page.evaluate(() => {
		window.__gamepadTest.axes[0] = 0.6;
	});
	await page.waitForTimeout(180);
	assert.ok(
		(await snapshot()).heading < heading,
		'Right stick deflection steers right',
	);
	await page.evaluate(() => {
		window.__gamepadTest.axes[0] = 0;
	});
	await press(3);
	assert.equal((await snapshot()).firstPerson, true);
	await press(0);
	assert.ok((await snapshot()).jump >= 0);
	await page.waitForFunction(() =>
		window.__gamepadTest.effects.some((effect) => effect.duration === 120),
	);
	await press(9);
	assert.equal((await snapshot()).paused, true);
	const frozen = await snapshot();
	await page.evaluate(() => {
		window.__gamepadTest.axes[0] = 1;
	});
	await page.waitForTimeout(180);
	assert.equal(
		(await snapshot()).heading,
		frozen.heading,
		'Menu input cannot steer the horse',
	);
	await page.evaluate(() => {
		window.__gamepadTest.axes[0] = 0;
	});
	await frames();
	await press(1);
	assert.equal((await snapshot()).paused, false);
	assert.equal(
		(await snapshot()).riding,
		'mounted',
		'Back from menu must not dismount',
	);
	await press(15);
	await expect(page.locator('#settings-dialog')).toBeVisible();
	await press(13);
	await expect(page.locator('#language')).toBeFocused();
	await press(15);
	await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
	await press(14);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await press(13);
	await expect(page.locator('#controller-vibration')).toBeFocused();
	await press(0);
	await expect(page.locator('#controller-vibration')).toHaveAttribute(
		'aria-pressed',
		'false',
	);
	await press(13);
	await expect(page.locator('#controller-test')).toBeFocused();
	const count = await page.evaluate(() => window.__gamepadTest.effects.length);
	await press(0);
	assert.equal(
		await page.evaluate(() => window.__gamepadTest.effects.length),
		count,
	);
	await press(12);
	await press(0);
	await press(13);
	await press(0);
	assert.ok(
		await page.evaluate(() =>
			window.__gamepadTest.effects.some((effect) => effect.duration === 250),
		),
	);
	await page.evaluate(() => {
		window.__gamepadTest.reject = true;
	});
	await page.waitForTimeout(300);
	await press(0);
	await expect(page.locator('#controller-status')).toContainText(
		'does not provide working vibration',
	);
	await press(1);
	await press(5);
	await page.evaluate(() => {
		window.__gamepadTest.connected = false;
	});
	await page.waitForFunction(() => window.__polana!.snapshot().paused);
	const disconnected = await snapshot();
	await page.waitForTimeout(150);
	assert.equal(
		(await snapshot()).z,
		disconnected.z,
		'Disconnect pauses persistent movement',
	);
	await page.evaluate(() => {
		window.__gamepadTest.connected = true;
		window.__gamepadTest.actuator = false;
	});
	await frames();
	await press(9);
	assert.equal(
		(await snapshot()).paused,
		false,
		'Controller works without vibration',
	);
	await press(14);
	await expect(page.locator('#dress-dialog')).toBeVisible();
	await press(13);
	await expect(page.locator('#preview-left')).toBeFocused();
	await press(0);
	await press(1);
	assert.equal((await snapshot()).paused, false);
	await press(8);
	await expect(page.locator('#help-dialog')).toBeVisible();
	await page.screenshot({ path: 'artifacts/gamepad-help.png' });
	await press(1);
	await page.evaluate(() => {
		window.__gamepadTest.connected = false;
	});
	await frames();
	await page.keyboard.press('Escape');
	await page.keyboard.press('ArrowUp');
	assert.ok(
		(await snapshot()).gait > 0,
		'Keyboard still works after controller disconnect',
	);
	assert.deepEqual(errors, []);
	console.log(
		'Gamepad checks passed: gait edges, analog steering, dead zone, jump/landing rumble, pause, menu navigation, localization, vibration toggle/failure, disconnect and keyboard fallback.',
	);
} finally {
	await browser.close();
}
