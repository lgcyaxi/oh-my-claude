/**
 * Proxy lifecycle utilities for memory hooks.
 * Handles detection, auto-spawn, and cleanup of the session-scoped proxy.
 * Uses only Node.js built-ins — no heavy deps.
 */

import {
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { shortHash } from './paths';

const DEFAULT_CONTROL_PORT = 18911;

export function getControlPort(): number {
	const env =
		process.env.OMC_CONTROL_PORT || process.env.OMC_PROXY_CONTROL_PORT;
	if (env) {
		const parsed = parseInt(env, 10);
		if (!isNaN(parsed)) return parsed;
	}
	return DEFAULT_CONTROL_PORT;
}

export async function isProxyHealthy(controlPort?: number): Promise<boolean> {
	const port = controlPort ?? getControlPort();
	try {
		const resp = await fetch(`http://localhost:${port}/health`, {
			signal: AbortSignal.timeout(500),
		});
		if (!resp.ok) return false;
		const data = (await resp.json()) as { status?: string };
		return data.status === 'ok';
	} catch {
		return false;
	}
}

/**
 * Auto-spawn the proxy if not running. Session-scoped: tracked PID is killed on Stop.
 * Returns the control port to use, or null if proxy couldn't start.
 */
export async function ensureProxy(projectCwd?: string): Promise<number | null> {
	const controlPort = getControlPort();

	if (await isProxyHealthy(controlPort)) {
		return controlPort;
	}

	try {
		const proxyScript = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'dist',
			'proxy',
			'server.js',
		);
		if (!existsSync(proxyScript)) {
			console.error(
				'[hook:proxy] Proxy script not found, cannot auto-spawn',
			);
			return null;
		}

		let bunPath = 'bun';
		try {
			const { execSync } = await import('node:child_process');
			bunPath = execSync('which bun', {
				encoding: 'utf-8',
				timeout: 3000,
				stdio: ['ignore', 'pipe', 'ignore'],
			}).trim();
		} catch {
			/* use default */
		}

		const { spawn: spawnProcess } = await import('node:child_process');
		const child = spawnProcess(
			bunPath,
			[
				'run',
				proxyScript,
				'--port',
				'18910',
				'--control-port',
				String(controlPort),
			],
			{
				detached: process.platform !== 'win32',
				stdio: ['ignore', 'ignore', 'ignore'],
				env: { ...process.env },
				windowsHide: true,
			},
		);
		child.unref();

		const pid = child.pid;
		if (!pid) {
			console.error('[hook:proxy] Failed to spawn proxy (no PID)');
			return null;
		}

		const sessionHash = projectCwd ? shortHash(projectCwd) : 'global';
		const sessionsDir = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'sessions',
			sessionHash,
		);
		mkdirSync(sessionsDir, { recursive: true });
		writeFileSync(
			join(sessionsDir, 'auto-proxy.json'),
			JSON.stringify({
				pid,
				autoSpawned: true,
				startedAt: new Date().toISOString(),
			}),
			'utf-8',
		);

		for (let i = 0; i < 15; i++) {
			await new Promise((resolve) => setTimeout(resolve, 200));
			if (await isProxyHealthy(controlPort)) {
				console.error(
					`[hook:proxy] Auto-spawned proxy (PID ${pid}) on port ${controlPort}`,
				);
				return controlPort;
			}
		}

		console.error(
			'[hook:proxy] Auto-spawned proxy but health check timed out',
		);
		return null;
	} catch (error) {
		console.error('[hook:proxy] Failed to auto-spawn proxy:', error);
		return null;
	}
}

export function cleanupAutoProxy(projectCwd?: string): void {
	try {
		const sessionHash = projectCwd ? shortHash(projectCwd) : 'global';
		const autoProxyFile = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'sessions',
			sessionHash,
			'auto-proxy.json',
		);
		if (!existsSync(autoProxyFile)) return;

		const data = JSON.parse(readFileSync(autoProxyFile, 'utf-8')) as {
			pid?: number;
			autoSpawned?: boolean;
		};

		if (data.autoSpawned && data.pid) {
			try {
				process.kill(data.pid, 'SIGTERM');
				console.error(
					`[hook:proxy] Killed auto-spawned proxy (PID ${data.pid})`,
				);
			} catch {
				// Already dead
			}
		}

		unlinkSync(autoProxyFile);
	} catch {
		// Best-effort
	}
}
