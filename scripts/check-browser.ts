import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = process.env.BROWSER_PORT || '5174';
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(
	process.execPath,
	[
		'node_modules/vite/bin/vite.js',
		'--host',
		'127.0.0.1',
		'--port',
		port,
		'--strictPort',
	],
	{ stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverOutput = '';
server.stdout.on('data', (chunk: Buffer) => {
	serverOutput += chunk.toString();
});
server.stderr.on('data', (chunk: Buffer) => {
	serverOutput += chunk.toString();
});

try {
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`Vite startup timed out.\n${serverOutput}`)),
			20_000,
		);
		server.once('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		server.once('exit', (code) => {
			clearTimeout(timeout);
			reject(new Error(`Vite exited (${code}).\n${serverOutput}`));
		});
		server.stdout.on('data', (chunk: Buffer) => {
			if (chunk.toString().includes('Local:')) {
				clearTimeout(timeout);
				resolve();
			}
		});
	});
	for (const script of [
		'browser-check',
		'appearance-check',
		'riding-check',
		'stable-check',
		'gait-check',
		'lifecycle-check',
	]) {
		console.log(`Running ${script} against ${baseURL}`);
		const child = spawn(process.execPath, [`scripts/${script}.ts`], {
			stdio: 'inherit',
			env: { ...process.env, BROWSER_BASE_URL: baseURL },
		});
		const [code] = (await once(child, 'exit')) as [
			number | null,
			NodeJS.Signals | null,
		];
		if (code !== 0)
			throw new Error(`${script} exited with code ${String(code)}`);
	}
} finally {
	if (server.pid && server.exitCode === null && server.signalCode === null) {
		const exited = once(server, 'exit');
		server.kill();
		await exited;
	}
}
