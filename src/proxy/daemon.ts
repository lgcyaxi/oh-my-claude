/**
 * Daemon wrapper for oh-my-claude proxy server
 *
 * Manages the proxy server + dashboard as background processes with PID
 * tracking. Cross-platform support for Windows, macOS, and Linux.
 *
 * Beta.8 hardening:
 *   - DAEMON (full proxy) and DASHBOARD (dashboard-only) have separate PID
 *     files so they can coexist without clobbering each other.
 *   - PID file creation uses `openSync(path, 'wx')` (O_CREAT|O_EXCL) so we
 *     never silently overwrite another live process's PID. On EEXIST we
 *     check liveness and unlink stale files before retrying.
 *   - `stopDaemon(kind)` / `isRunning(kind)` / `getPid(kind)` now take an
 *     explicit target so we can't accidentally stop the dashboard when the
 *     caller meant the proxy daemon or vice versa.
 */

import { spawn } from 'node:child_process';
import {
	existsSync,
	writeFileSync,
	readFileSync,
	unlinkSync,
	openSync,
	closeSync,
	writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import {
	DAEMON_PID_FILE,
	DASHBOARD_ORIGIN_FILE,
	DASHBOARD_PID_FILE,
} from '../cli/utils/paths';

const INSTALL_DIR = join(homedir(), '.claude', 'oh-my-claude');
const SERVER_SCRIPT = join(INSTALL_DIR, 'dist', 'proxy', 'server.js');
const DASHBOARD_SCRIPT = join(INSTALL_DIR, 'dist', 'proxy', 'dashboard.js');

/** Which daemon a lifecycle call is targeting. */
export type DaemonKind = 'daemon' | 'dashboard';

/** How the running dashboard was launched (see DASHBOARD_ORIGIN_FILE). */
export type DashboardOrigin = 'auto' | 'manual';

function pidFileFor(kind: DaemonKind): string {
	return kind === 'daemon' ? DAEMON_PID_FILE : DASHBOARD_PID_FILE;
}

/**
 * Read the origin marker for the running dashboard.
 *
 * Returns null when the dashboard is not running or no marker exists
 * (e.g. an older install started the dashboard before the marker was
 * introduced — callers should treat that as "unknown / don't auto-stop").
 */
export function readDashboardOrigin(): DashboardOrigin | null {
	try {
		if (!existsSync(DASHBOARD_ORIGIN_FILE)) return null;
		const raw = readFileSync(DASHBOARD_ORIGIN_FILE, 'utf-8').trim();
		return raw === 'auto' || raw === 'manual' ? raw : null;
	} catch {
		return null;
	}
}

/**
 * Write the origin marker. `manual` is sticky: once it's recorded we never
 * downgrade to `auto`, so that an implicit `ensureDashboard()` after a manual
 * `omc proxy dashboard` cannot accidentally enable auto-teardown.
 */
function writeDashboardOrigin(origin: DashboardOrigin): void {
	try {
		const current = readDashboardOrigin();
		if (current === 'manual' && origin === 'auto') return;
		writeFileSync(DASHBOARD_ORIGIN_FILE, origin, 'utf-8');
	} catch {
		// Best-effort — origin tracking is advisory only.
	}
}

function clearDashboardOrigin(): void {
	try {
		if (existsSync(DASHBOARD_ORIGIN_FILE)) unlinkSync(DASHBOARD_ORIGIN_FILE);
	} catch {
		// Ignore
	}
}

/** Check if a process is running */
function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Atomically claim the PID file for this kind. Returns true on success.
 *
 * On EEXIST we inspect the incumbent PID:
 *  - If it's alive, bail (caller uses existing process).
 *  - If it's dead/stale, unlink and retry once.
 *
 * This replaces the legacy `existsSync → writeFileSync` pattern which could
 * overwrite a live process's PID during concurrent spawns. Callers that hit
 * `'incumbent-alive'` should NOT spawn a new process.
 */
type ClaimResult =
	| { status: 'claimed' }
	| { status: 'incumbent-alive'; pid: number }
	| { status: 'failed'; error: unknown };

function claimPidFile(kind: DaemonKind, pid: number): ClaimResult {
	const path = pidFileFor(kind);
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const fd = openSync(path, 'wx');
			try {
				writeSync(fd, String(pid));
			} finally {
				closeSync(fd);
			}
			return { status: 'claimed' };
		} catch (err) {
			const code = (err as NodeJS.ErrnoException | undefined)?.code;
			if (code !== 'EEXIST') {
				return { status: 'failed', error: err };
			}
			// Incumbent PID file — check liveness once.
			try {
				const existing = parseInt(readFileSync(path, 'utf-8').trim(), 10);
				if (Number.isFinite(existing) && isProcessRunning(existing)) {
					return { status: 'incumbent-alive', pid: existing };
				}
			} catch {
				// Unreadable PID file — treat as stale and try to remove.
			}
			try {
				unlinkSync(path);
			} catch {
				// Another racer may have unlinked; retry.
			}
		}
	}
	return {
		status: 'failed',
		error: new Error(`Failed to claim ${kind} PID file at ${path}`),
	};
}

/** Get the proxy server script path */
export function getServerScript(): string {
	return SERVER_SCRIPT;
}

/**
 * Check if the daemon of the given kind is running.
 *
 * Defaults to `'dashboard'` for backwards compatibility with pre-beta.8
 * callers that only had one "daemon" concept (which was, in practice, the
 * dashboard — the full proxy daemon was never shipped for production use).
 */
export function isRunning(kind: DaemonKind = 'dashboard'): boolean {
	const path = pidFileFor(kind);
	if (!existsSync(path)) {
		return false;
	}

	try {
		const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10);
		return isProcessRunning(pid);
	} catch {
		return false;
	}
}

/** Start the proxy daemon */
export async function startDaemon(options?: {
	port?: number;
	controlPort?: number;
	foreground?: boolean;
}): Promise<{ pid: number; port: number; controlPort: number }> {
	const port = options?.port ?? 18910;
	const controlPort = options?.controlPort ?? 18911;

	// Check if already running — atomic claim below handles the race but an
	// early check avoids an unnecessary spawn.
	if (isRunning('daemon')) {
		const pid = parseInt(readFileSync(DAEMON_PID_FILE, 'utf-8').trim(), 10);
		if (isProcessRunning(pid)) {
			return { pid, port, controlPort };
		}
		// Stale PID file, clean up
		try {
			unlinkSync(DAEMON_PID_FILE);
		} catch {
			/* ignore — claim below will retry */
		}
	}

	// Check if server script exists
	if (!existsSync(SERVER_SCRIPT)) {
		throw new Error(
			`Proxy server not found at ${SERVER_SCRIPT}\nRun 'oh-my-claude install' first.`,
		);
	}

	// Check if Bun is available
	try {
		execSync('bun --version', { stdio: 'pipe' });
	} catch {
		throw new Error(
			'Bun runtime not found. Please install Bun: https://bun.sh',
		);
	}

	// Spawn the proxy server
	const args = ['run', SERVER_SCRIPT];
	if (options?.port) {
		args.push('--port', String(options.port));
	}
	if (options?.controlPort) {
		args.push('--control-port', String(options.controlPort));
	}

	const proc = spawn('bun', args, {
		detached: true,
		stdio: options?.foreground ? 'inherit' : 'ignore',
		windowsHide: true,
	});

	const pid = proc.pid;
	if (pid === undefined) {
		throw new Error('Failed to get process PID');
	}

	if (options?.foreground) {
		// Running in foreground, don't unref
		return { pid, port, controlPort };
	}

	// Background mode: detach from parent
	proc.unref();

	// Atomically record PID; if a racer beat us, kill our just-spawned child
	// and return the incumbent pid instead of overwriting the PID file.
	const claim = claimPidFile('daemon', pid);
	if (claim.status === 'claimed') {
		return { pid, port, controlPort };
	}
	if (claim.status === 'incumbent-alive') {
		try {
			process.kill(pid, 'SIGTERM');
		} catch {
			/* ignore */
		}
		return { pid: claim.pid, port, controlPort };
	}
	// claim.status === 'failed': rare I/O issue. Leave child running; return
	// our pid so callers can stop it manually.
	return { pid, port, controlPort };
}

/** Start the dashboard-only server (no proxy port) */
export async function startDashboard(options?: {
	port?: number;
	foreground?: boolean;
	/**
	 * Launch origin — "auto" (implicit via `omc cc`) or "manual" (explicit via
	 * `omc proxy dashboard`). `manual` is sticky across re-entry; see
	 * `writeDashboardOrigin` for the downgrade guard.
	 */
	origin?: DashboardOrigin;
}): Promise<{ pid: number; port: number }> {
	const port = options?.port ?? 18920;
	const origin: DashboardOrigin = options?.origin ?? 'auto';

	// Check if already running
	if (isRunning('dashboard')) {
		const pid = parseInt(readFileSync(DASHBOARD_PID_FILE, 'utf-8').trim(), 10);
		if (isProcessRunning(pid)) {
			// Dashboard already up — refresh origin (write is sticky on manual)
			writeDashboardOrigin(origin);
			return { pid, port };
		}
		try {
			unlinkSync(DASHBOARD_PID_FILE);
		} catch {
			/* ignore */
		}
		clearDashboardOrigin();
	}

	const script = existsSync(DASHBOARD_SCRIPT)
		? DASHBOARD_SCRIPT
		: SERVER_SCRIPT; // fallback to full server if dashboard not built

	if (!existsSync(script)) {
		throw new Error(
			`Dashboard not found at ${script}\nRun 'oh-my-claude install' first.`,
		);
	}

	try {
		execSync('bun --version', { stdio: 'pipe' });
	} catch {
		throw new Error(
			'Bun runtime not found. Please install Bun: https://bun.sh',
		);
	}

	const args = [script, '--port', String(port)];

	// On Windows, detached: true flashes a console window.
	// Use windowsHide + unref instead.
	const isWindows = process.platform === 'win32';
	const proc = spawn('bun', args, {
		detached: !isWindows,
		stdio: options?.foreground ? 'inherit' : 'ignore',
		windowsHide: true,
	});

	const pid = proc.pid;
	if (pid === undefined) {
		throw new Error('Failed to get process PID');
	}

	if (options?.foreground) {
		return { pid, port };
	}

	proc.unref();

	const claim = claimPidFile('dashboard', pid);
	if (claim.status === 'claimed') {
		writeDashboardOrigin(origin);
	} else if (claim.status === 'incumbent-alive') {
		// Racer already started a dashboard; reuse it.
		try {
			process.kill(pid, 'SIGTERM');
		} catch {
			/* ignore */
		}
		writeDashboardOrigin(origin);
		// Don't return early — still wait for the incumbent's /health below,
		// but use the incumbent pid.
		const incumbentPid = claim.pid;
		for (let i = 0; i < 15; i++) {
			await new Promise((r) => setTimeout(r, 200));
			try {
				const resp = await fetch(`http://localhost:${port}/health`, {
					signal: AbortSignal.timeout(500),
				});
				if (resp.ok) return { pid: incumbentPid, port };
			} catch {
				/* keep waiting */
			}
		}
		return { pid: incumbentPid, port };
	}

	// Wait for the server to be ready
	for (let i = 0; i < 15; i++) {
		await new Promise((r) => setTimeout(r, 200));
		try {
			const resp = await fetch(`http://localhost:${port}/health`, {
				signal: AbortSignal.timeout(500),
			});
			if (resp.ok) return { pid, port };
		} catch {
			// Keep waiting
		}
	}

	return { pid, port };
}

/**
 * Stop the daemon of the given kind.
 *
 * Defaults to `'dashboard'` for backwards compatibility — the pre-beta.8
 * call sites all targeted the dashboard PID file. When stopping the full
 * proxy daemon, pass `'daemon'` explicitly.
 */
export function stopDaemon(kind: DaemonKind = 'dashboard'): boolean {
	const path = pidFileFor(kind);
	const clearOriginIfDashboard = () => {
		if (kind === 'dashboard') clearDashboardOrigin();
	};

	if (!existsSync(path)) {
		clearOriginIfDashboard();
		return false;
	}

	try {
		const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10);

		if (!Number.isFinite(pid) || !isProcessRunning(pid)) {
			// Stale PID file
			try {
				unlinkSync(path);
			} catch {
				/* ignore */
			}
			clearOriginIfDashboard();
			return false;
		}

		// Try graceful shutdown first (SIGTERM)
		process.kill(pid, 'SIGTERM');

		// Wait up to 2 seconds for process to exit
		const start = Date.now();
		while (Date.now() - start < 2000) {
			if (!isProcessRunning(pid)) {
				break;
			}
			// Busy wait (short duration)
		}

		// Force kill if still running
		if (isProcessRunning(pid)) {
			process.kill(pid, 'SIGKILL');
		}

		try {
			unlinkSync(path);
		} catch {
			/* ignore */
		}
		clearOriginIfDashboard();
		return true;
	} catch (error) {
		// If we can't read the PID file, try to delete it
		try {
			unlinkSync(path);
		} catch {
			// Ignore
		}
		clearOriginIfDashboard();
		throw error;
	}
}

/** Get the PID from the PID file for the given kind (defaults to dashboard). */
export function getPid(kind: DaemonKind = 'dashboard'): number | null {
	const path = pidFileFor(kind);
	try {
		if (!existsSync(path)) {
			return null;
		}
		const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10);
		return Number.isFinite(pid) ? pid : null;
	} catch {
		return null;
	}
}
