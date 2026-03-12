/**
 * CC command — Routing dispatcher + platform-agnostic helpers
 *
 * Platform-specific detection/spawn live in:
 * - cc-routing-unix.ts (tmux + Terminal.app)
 * - cc-routing-win.ts  (wezterm + cmd.exe)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as unix from './cc-routing-unix';
import * as win from './cc-routing-win';

const platformImpl = process.platform === 'win32' ? win : unix;

// --- Platform-dispatched exports ---

export type TerminalBackend = 'tmux' | 'wezterm' | 'macos-terminal' | 'none';

export const detectTerminalBackend: () => TerminalBackend =
	platformImpl.detectTerminalBackend;

export const spawnProxySwitchedCC: (
	terminal: TerminalBackend,
	alias: string,
	claudeArgs: string[],
) => boolean = platformImpl.spawnProxySwitchedCC;

// --- Platform-agnostic helpers ---

export function isProxyConfigured(): boolean {
	if ((process.env.OMC_PROXY_CONTROL_PORT || '').trim().length > 0)
		return true;
	const baseUrl = (process.env.ANTHROPIC_BASE_URL || '').trim();
	return baseUrl.includes('localhost:') || baseUrl.includes('127.0.0.1:');
}

/**
 * Derive control port from environment.
 * Priority: OMC_PROXY_CONTROL_PORT env → ANTHROPIC_BASE_URL port + 1 → default 18911
 */
export function resolveProxyControlPort(): number {
	const envPort = parseInt(process.env.OMC_PROXY_CONTROL_PORT || '', 10);
	if (!isNaN(envPort) && envPort > 0) return envPort;

	const baseUrl = (process.env.ANTHROPIC_BASE_URL || '').trim();
	if (baseUrl) {
		try {
			const parsed = new URL(baseUrl);
			const proxyPort = parseInt(parsed.port, 10);
			if (!isNaN(proxyPort) && proxyPort > 0) return proxyPort + 1;
		} catch {}
	}

	return 18911; // DEFAULT_PROXY_CONFIG.controlPort
}

export function resolveProxySwitchAlias(providerOption?: string): string {
	const alias = (providerOption || process.env.OMC_SWITCH_ALIAS || 'revert')
		.trim()
		.toLowerCase();
	return alias.length > 0 ? alias : 'revert';
}

export function runNativeCC(claudeArgs: string[]): never {
	const shell = process.env.SHELL || (process.env.MSYSTEM ? 'bash' : true);
	const result = spawnSync('claude', claudeArgs, {
		stdio: 'inherit',
		env: process.env,
		shell,
	});
	process.exit(result.status ?? 0);
}

export function shellEscapeSingle(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function appleScriptEscape(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Load API key environment variables from ~/.zshrc.api.
 */
export function loadApiEnvFile(): void {
	try {
		const envFile = join(homedir(), '.zshrc.api');
		if (!existsSync(envFile)) return;

		const content = readFileSync(envFile, 'utf-8');
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const match = trimmed.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (!match) continue;
			const key = match[1]!;
			let value = match[2]!;
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			process.env[key] = value;
		}
	} catch {
		// Silent — file may not exist or be unreadable
	}
}

export function formatAge(startedAt: number): string {
	const ms = Date.now() - startedAt;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m ago`;
}
