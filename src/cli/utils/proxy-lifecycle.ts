/**
 * Shared proxy lifecycle management
 *
 * Provides per-session proxy spawning for `oh-my-claude cc`:
 * - `spawnSessionProxy()` — per-session child process (dies with CC session)
 * - `spawnDetachedProxy()` — per-session detached daemon (for terminal window mode)
 * - `findFreePorts()` — allocate dynamic ports for a session
 */

import {
	spawn,
	type ChildProcess,
	type StdioOptions,
} from 'node:child_process';
import { existsSync, openSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { PROXY_SCRIPT, INSTALL_DIR } from './paths';
import { checkHealth } from './health';
import { resolveBunPath } from './bun';
import {
	startDashboard,
	stopDaemon,
	isRunning,
	readDashboardOrigin,
} from '../../proxy/daemon';
import { readInstances } from '../../proxy/state/instance-registry';
import { readProxyRegistry, cleanupStaleEntries } from '../../proxy/registry';

/**
 * Find an available TCP port by binding to port 0.
 */
function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.listen(0, () => {
			const addr = srv.address();
			const port = typeof addr === 'object' && addr ? addr.port : 0;
			srv.close(() => resolve(port));
		});
		srv.on('error', reject);
	});
}

/**
 * Check if a specific TCP port is free.
 */
function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const srv = createServer();
		srv.once('error', () => resolve(false));
		srv.listen(port, () => srv.close(() => resolve(true)));
	});
}

/**
 * Find two available TCP ports for proxy + control.
 * If preferred ports are given and both are free, use them (enables stable URLs).
 */
export async function findFreePorts(
	preferredPort?: number,
	preferredControlPort?: number,
): Promise<{
	port: number;
	controlPort: number;
}> {
	if (preferredPort && preferredControlPort) {
		const [portFree, controlFree] = await Promise.all([
			isPortFree(preferredPort),
			isPortFree(preferredControlPort),
		]);
		if (portFree && controlFree) {
			return { port: preferredPort, controlPort: preferredControlPort };
		}
	}
	const port = await findFreePort();
	const controlPort = await findFreePort();
	return { port, controlPort };
}

/** Options shared by both spawn functions */
interface ProxySpawnOptions {
	port: number;
	controlPort: number;
	debug?: boolean;
	sessionId?: string;
	/** Pre-switch provider (config name or alias, resolved by proxy server) */
	provider?: string;
	/** Pre-switch model ID */
	model?: string;
}

/** Build CLI args for the proxy server process */
function buildProxyArgs(options: ProxySpawnOptions): string[] {
	const args = [
		'run',
		PROXY_SCRIPT,
		'--port',
		String(options.port),
		'--control-port',
		String(options.controlPort),
	];
	if (options.provider && options.model) {
		args.push('--provider', options.provider, '--model', options.model);
	}
	return args;
}

/** Health check: defaults to 200ms intervals, 15 attempts = 3s total */
export async function waitForHealth(
	controlPort: number,
	attempts = 15,
	delayMs = 200,
): Promise<{ healthy: boolean; health?: Record<string, unknown> }> {
	let healthy = false;
	let health: Record<string, unknown> | undefined;
	for (let i = 0; i < attempts; i++) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		try {
			health = await checkHealth(String(controlPort));
			if (health?.status === 'ok') {
				healthy = true;
				break;
			}
		} catch {
			// Keep waiting
		}
	}
	return { healthy, health };
}

/**
 * Spawn a per-session proxy as a child process (NOT a detached daemon).
 * The proxy dies when the parent CC session exits.
 *
 * @returns The child process and health info, or null if proxy script missing
 */
export async function spawnSessionProxy(options: ProxySpawnOptions): Promise<{
	child: ChildProcess;
	healthy: boolean;
	health?: Record<string, unknown>;
	logFile?: string;
} | null> {
	const { port, controlPort, debug, sessionId } = options;

	if (!existsSync(PROXY_SCRIPT)) {
		return null;
	}

	let stdio: StdioOptions = ['ignore', 'ignore', 'ignore'];
	let logFile: string | undefined;

	if (debug) {
		const logName = sessionId
			? `proxy-${sessionId}.log`
			: `proxy-${Date.now()}.log`;
		const logsDir = join(INSTALL_DIR, 'logs');
		mkdirSync(logsDir, { recursive: true });
		logFile = join(logsDir, logName);
		const fd = openSync(logFile, 'w');
		stdio = ['ignore', fd, fd];
	}

	const child = spawn(resolveBunPath(), buildProxyArgs(options), {
		stdio,
		env: { ...process.env },
		windowsHide: true,
	});

	const { healthy, health } = await waitForHealth(controlPort);
	return { child, healthy, health, logFile };
}

/**
 * Spawn a detached proxy daemon that survives parent exit.
 * Used by `cc` when launching in a terminal window (parent returns immediately).
 *
 * @returns PID, health status, and optional log file path, or null if proxy script missing
 */
export async function spawnDetachedProxy(
	options: ProxySpawnOptions & { sessionId: string },
): Promise<{ pid: number; healthy: boolean; logFile?: string } | null> {
	const { controlPort, debug, sessionId } = options;

	if (!existsSync(PROXY_SCRIPT)) {
		return null;
	}

	let stdio: StdioOptions = ['ignore', 'ignore', 'ignore'];
	let logFile: string | undefined;

	if (debug) {
		const logsDir = join(INSTALL_DIR, 'logs');
		mkdirSync(logsDir, { recursive: true });
		logFile = join(logsDir, `proxy-${sessionId}.log`);
		const fd = openSync(logFile, 'w');
		stdio = ['ignore', fd, fd];
	}

	// On Windows, detached: true creates a new process group which may flash
	// a console window. Use windowsHide: true WITHOUT detached to keep it hidden.
	// The proxy still outlives the parent because stdio is disconnected + unref'd.
	const isWindows = process.platform === 'win32';
	const child = spawn(resolveBunPath(), buildProxyArgs(options), {
		detached: !isWindows,
		stdio,
		env: { ...process.env },
		windowsHide: true,
	});
	child.unref();

	const pid = child.pid;
	if (!pid) {
		return null;
	}

	const { healthy } = await waitForHealth(controlPort);
	return { pid, healthy, logFile };
}

/**
 * Ensure the dashboard server is running on port 18920.
 * Auto-starts it as a daemon if not already running.
 *
 * Always records `origin: "auto"` for any implicitly-started dashboard so
 * that `maybeStopDashboard()` can later tear it down when no cc sessions
 * remain. If the dashboard was previously started by `omc proxy dashboard`
 * (origin=manual), the origin write inside `startDashboard` is a no-op —
 * manual mode is sticky.
 *
 * @returns The dashboard URL, or null if it couldn't be started
 */
export async function ensureDashboard(): Promise<string | null> {
	const DASHBOARD_CONTROL_PORT = 18920;

	// Check if already running (PID file check)
	if (isRunning()) {
		return `http://localhost:${DASHBOARD_CONTROL_PORT}/web/`;
	}

	// Also check if port is reachable (covers case where PID file is stale
	// but something else is listening)
	try {
		const health = await checkHealth(String(DASHBOARD_CONTROL_PORT));
		if (health?.status === 'ok') {
			return `http://localhost:${DASHBOARD_CONTROL_PORT}/web/`;
		}
	} catch {
		// Not running
	}

	// Start the dashboard-only server (no proxy port needed)
	try {
		await startDashboard({ port: DASHBOARD_CONTROL_PORT, origin: 'auto' });
		return `http://localhost:${DASHBOARD_CONTROL_PORT}/web/`;
	} catch {
		return null;
	}
}

/**
 * Ref-counted dashboard teardown.
 *
 * Invoked from every `omc cc` exit path (inline cleanup + `omc cc stop`).
 * Tears the dashboard down only when ALL of these hold:
 *   1. Dashboard is actually running (PID file points to a live process).
 *   2. Dashboard was started implicitly (`origin === "auto"`). A manually
 *      launched dashboard (`omc proxy dashboard`) is never auto-killed.
 *   3. No live proxy instances remain in `proxy-instances.json`
 *      (filtered by 5-minute heartbeat TTL inside `readInstances`).
 *   4. No live `omc cc` sessions remain in `proxy-sessions.json`
 *      (filtered by PID liveness inside `cleanupStaleEntries`).
 *
 * `reason` is used purely for logging so we can trace teardown decisions
 * during smoke tests and incident investigation.
 *
 * Self-healing: if a second `omc cc` is starting concurrently with an exit,
 * its `ensureDashboard()` call re-launches the dashboard on the next line.
 */
export function maybeStopDashboard(reason = 'cc-exit'): boolean {
	if (!isRunning()) return false;

	const origin = readDashboardOrigin();
	if (origin === 'manual') {
		return false;
	}

	cleanupStaleEntries();
	const liveSessions = readProxyRegistry();
	const liveInstances = readInstances();

	if (liveSessions.length > 0 || liveInstances.length > 0) {
		return false;
	}

	try {
		const stopped = stopDaemon();
		if (stopped) {
			console.error(
				`[lifecycle] dashboard torn down (${reason}; origin=${origin ?? 'unknown'})`,
			);
		}
		return stopped;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[lifecycle] dashboard teardown failed (${reason}): ${message}`,
		);
		return false;
	}
}
