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
	// Tools that pick a free port pass it in PORT; `--port` still takes precedence.
	server: process.env.PORT ? { port: Number(process.env.PORT) } : {},
	build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
