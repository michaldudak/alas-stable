import assert from 'node:assert/strict';
import { BASE_URL, launchBrowser } from './browser-support.ts';
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
	const riders = () =>
		page.evaluate(() => window.__alasStable!.snapshot().riders);
	const forward = (seconds: number) =>
		page.evaluate((s) => window.__alasStable!.debug!.fastForward!(s), seconds);
	// The ways the other riders use keep clear of fences, trees and walls.
	assert.deepEqual(
		await page.evaluate(() => window.__alasStable!.debug!.navCheck!(0.8)),
		[],
	);
	// Through the day they choose different things to do.
	const activities = new Set<string>();
	for (let i = 0; i < 40; i++) {
		await forward(10);
		for (const rider of await riders()) activities.add(rider.activity);
	}
	assert.ok(activities.size >= 4, [...activities].join());
	// At dusk they ride home, stable their horses and go to the clubhouse.
	await page.evaluate(() => window.__alasStable!.debug!.setTime!(18.5));
	let home = false;
	for (let i = 0; i < 60 && !home; i++) {
		await forward(10);
		home = (await riders()).every(
			(r) => r.where === 'inside' && r.horseMode === 'stabled',
		);
	}
	assert.ok(home, JSON.stringify(await riders()));
	// In the morning they fetch their horses and ride out again.
	await page.evaluate(() => window.__alasStable!.debug!.setTime!(6.9));
	let out = false;
	for (let i = 0; i < 60 && !out; i++) {
		await forward(10);
		out = (await riders()).every((r) => r.where === 'riding');
	}
	assert.ok(out, JSON.stringify(await riders()));
	// A game that begins at night finds everyone at home already.
	await page.evaluate(() =>
		localStorage.setItem('alas-stable.daytime', 'night'),
	);
	await page.reload();
	await page.waitForFunction(() => window.__alasStable?.snapshot().calls);
	for (const rider of await riders()) {
		assert.equal(rider.where, 'inside');
		assert.equal(rider.horseMode, 'stabled');
	}
	assert.deepEqual(errors, []);
	console.log(
		'Rider checks passed: clear ways, varied days, evening stabling, morning ride-out, night start.',
	);
} finally {
	await browser.close();
}
