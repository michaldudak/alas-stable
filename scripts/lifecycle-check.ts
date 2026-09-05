import assert from 'node:assert/strict';
import type * as GameModule from '../src/app/game.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';

const browser = await launchBrowser();
try {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/lifecycle-inspection', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!doctype html><html><body><div id="app"></div></body></html>',
		}),
	);
	await page.goto(`${BASE_URL}/lifecycle-inspection`);
	const results = await page.evaluate(async () => {
		const { startGame } = (await import(
			String('/src/app/game.ts')
		)) as typeof GameModule;
		const results: {
			activeGait: number;
			disposedGait: number;
			snapshotRemoved: boolean;
			canvasRemoved: boolean;
		}[] = [];
		for (let i = 0; i < 3; i++) {
			const game = startGame();
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
			const snapshot = window.__polana!.snapshot;
			window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
			window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
			const activeGait = snapshot().gait;
			game.dispose();
			game.dispose();
			window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
			window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
			results.push({
				activeGait,
				disposedGait: snapshot().gait,
				snapshotRemoved: !window.__polana,
				canvasRemoved: !document.querySelector('#game'),
			});
		}
		return results;
	});
	assert.deepEqual(
		results,
		Array.from({ length: 3 }, () => ({
			activeGait: 1,
			disposedGait: 1,
			snapshotRemoved: true,
			canvasRemoved: true,
		})),
	);
	assert.deepEqual(errors, []);
	console.log(
		'Lifecycle checks passed: repeated start/dispose, no stale input handlers, removed canvas and debug snapshot.',
	);
} finally {
	await browser.close();
}
