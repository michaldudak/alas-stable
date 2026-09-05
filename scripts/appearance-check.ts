import type { Appearance } from '../src/horse/appearance.ts';
import { BASE_URL, launchBrowser } from './browser-support.ts';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await launchBrowser();
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(BASE_URL);
	await page.waitForFunction(
		() => (window.__polana?.snapshot().calls ?? 0) > 0,
	);
	const click = (name: string) =>
		page.getByRole('button', { name, exact: true }).click();
	await click('Wygląd konia');
	await click('Obróć w prawo');
	await click('Obróć w prawo');
	const canvas = page.locator('#horse-preview');
	const shot = async () => {
		await page.waitForTimeout(120);
		return canvas.screenshot();
	};
	for (const [tab, names] of [
		[
			'Fryzury',
			[
				'Grzywa: Krótka',
				'Grzywa: Zapleciona',
				'Grzywa: Długa',
				'Ogon: Krótki',
				'Ogon: Zapleciony',
				'Ogon: Długi',
			],
		],
		[
			'Ozdoby',
			[
				'Ozdoba: Kwiaty',
				'Ozdoba: Kokarda',
				'Ozdoba: Wstążki',
				'Ozdoba: Bez ozdoby',
			],
		],
		[
			'Czaprak',
			[
				'Wzór czapraka: Kropki',
				'Wzór czapraka: Paski',
				'Wzór czapraka: Gwiazdki',
				'Wzór czapraka: Gładki',
			],
		],
	] as const) {
		await click(tab);
		let previous = await shot();
		for (const name of names) {
			await click(name);
			const current = await shot();
			assert.equal(
				previous.equals(current),
				false,
				`The preview must change for ${name}`,
			);
			previous = current;
			assert.equal(
				await page
					.getByRole('button', { name, exact: true })
					.getAttribute('aria-pressed'),
				'true',
			);
		}
	}
	await click('Fryzury');
	await click('Grzywa: Zapleciona');
	await click('Ogon: Zapleciony');
	await page.screenshot({ path: 'artifacts/hairstyles.png' });
	await click('Ozdoby');
	await click('Ozdoba: Kokarda');
	await click('Kolor ozdób: Różowy');
	await page.screenshot({ path: 'artifacts/ornaments.png' });
	await click('Czaprak');
	await click('Wzór czapraka: Gwiazdki');
	await click('Czaprak: Fioletowy');
	await page.screenshot({ path: 'artifacts/patterns.png' });
	const saved = await page.evaluate(
		() =>
			JSON.parse(
				localStorage.getItem('polana-appearance') || '{}',
			) as Appearance,
	);
	assert.equal(saved.maneStyle, 'braided');
	assert.equal(saved.tailStyle, 'braided');
	assert.equal(saved.pattern, 'stars');
	assert.equal(saved.ornament, 'bow');
	await click('Wracamy na polanę');
	await page.reload();
	await page.waitForFunction(
		() => (window.__polana?.snapshot().calls ?? 0) > 0,
	);
	await click('Wygląd konia');
	for (const [tab, names] of [
		['Fryzury', ['Grzywa: Zapleciona', 'Ogon: Zapleciony']],
		['Ozdoby', ['Ozdoba: Kokarda', 'Kolor ozdób: Różowy']],
		['Czaprak', ['Wzór czapraka: Gwiazdki', 'Czaprak: Fioletowy']],
	] as const) {
		await click(tab);
		for (const name of names)
			assert.equal(
				await page
					.getByRole('button', { name, exact: true })
					.getAttribute('aria-pressed'),
				'true',
			);
	}
	await page.setViewportSize({ width: 640, height: 720 });
	await page.screenshot({ path: 'artifacts/appearance-640.png' });
	await page.setViewportSize({ width: 320, height: 640 });
	await page
		.getByRole('button', { name: 'Wzór czapraka: Gwiazdki', exact: true })
		.scrollIntoViewIfNeeded();
	await page.screenshot({ path: 'artifacts/appearance-320.png' });
	assert.equal(
		await page
			.locator('#dress-dialog')
			.evaluate((d) => d.scrollWidth <= d.clientWidth),
		true,
	);
	assert.deepEqual(errors, []);
	console.log(
		'Appearance checks passed: all 14 variants visibly change the preview, independent colors, persistence, responsive panel, no page errors.',
	);
} finally {
	await browser.close();
}
