import { defineConfig } from 'vite';
import { en } from './src/i18n/en.ts';

export default defineConfig({
	plugins: [
		{
			name: 'localized-document-title',
			transformIndexHtml: (html) =>
				html.replace('{{app.title}}', en['app.title']),
		},
	],
	build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
