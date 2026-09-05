import { chromium } from '@playwright/test';

export const BASE_URL = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:5173';
export const launchBrowser = () =>
	chromium.launch({
		channel: process.env.BROWSER_CHANNEL || 'chrome',
		headless: true,
	});
