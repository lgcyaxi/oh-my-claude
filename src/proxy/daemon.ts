/**
 * Daemon wrapper for oh-my-claude proxy server
 *
 * Manages the proxy server as a background process with PID tracking.
 * Cross-platform support for Windows, macOS, and Linux.
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { DASHBOARD_ORIGIN_FILE, DASHBOARD_PID_FILE } from '../cli/utils/paths';

const INSTALL_DIR = join(homedir(), '.claude', 'oh-my-claude');
const SERVER_SCRIPT = join(INSTALL_DIR, 'dist', 'proxy', 'server.js');
const DASHBOARD_SCRIPT = join(INSTALL_DIR, 'dist', 'proxy', 'dashboard.js');

/** How the running dashboard was launched (see DASHBOARD_ORIGIN_FILE). */
export type DashboardOrigin = 'auto' | 'manual';

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

/** Get the proxy server script path */
export function getServerScript(): string {
	return SERVER_SCRIPT;
}

/** Check if the daemon is running */
export function isRunning(): boolean {
	if (!existsSync(DASHBOARD_PID_FILE)) {
		return false;
	}

	try {
		const pid = parseInt(readFileSync(DASHBOARD_PID_FILE, 'utf-8').trim());
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

	// Check if already running
	if (isRunning()) {
		const pid = parseInt(readFileSync(DASHBOARD_PID_FILE, 'utf-8').trim());
		if (isProcessRunning(pid)) {
			return { pid, port, controlPort };
		}
		// Stale PID file, clean up
		unlinkSync(DASHBOARD_PID_FILE);
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

	// Write PID file
	writeFileSync(DASHBOARD_PID_FILE, String(pid));

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
	if (isRunning()) {
		const pid = parseInt(readFileSync(DASHBOARD_PID_FILE, 'utf-8').trim());
		if (isProcessRunning(pid)) {
			// Dashboard already up — refresh origin (write is sticky on manual)
			writeDashboardOrigin(origin);
			return { pid, port };
		}
		unlinkSync(DASHBOARD_PID_FILE);
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
	writeFileSync(DASHBOARD_PID_FILE, String(pid));
	writeDashboardOrigin(origin);

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

/** Stop the proxy daemon */
export function stopDaemon(): boolean {
	if (!existsSync(DASHBOARD_PID_FILE)) {
		clearDashboardOrigin();
		return false;
	}

	try {
		const pid = parseInt(readFileSync(DASHBOARD_PID_FILE, 'utf-8').trim());

		if (!isProcessRunning(pid)) {
			// Stale PID file
			unlinkSync(DASHBOARD_PID_FILE);
			clearDashboardOrigin();
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

		unlinkSync(DASHBOARD_PID_FILE);
		clearDashboardOrigin();
		return true;
	} catch (error) {
		// If we can't read the PID file, try to delete it
		try {
			unlinkSync(DASHBOARD_PID_FILE);
		} catch {
			// Ignore
		}
		clearDashboardOrigin();
		throw error;
	}
}

/** Get the PID from the PID file */
export function getPid(): number | null {
	try {
		if (!existsSync(DASHBOARD_PID_FILE)) {
			return null;
		}
		return parseInt(readFileSync(DASHBOARD_PID_FILE, 'utf-8').trim());
	} catch {
		return null;
	}
}
