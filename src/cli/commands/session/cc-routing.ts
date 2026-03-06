/**
 * CC command — Provider map, proxy/bridge detection, routing helpers
 */

import { spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveWeztermBinary } from '../../utils/terminal-detect';
import { resolveProviderName } from '../../../shared/providers/aliases';

export type TerminalBackend = 'tmux' | 'wezterm' | 'macos-terminal' | 'none';

export function detectTerminalBackend(): TerminalBackend {
	if (process.env.TMUX) return 'tmux';
	if (process.env.WEZTERM_PANE) return 'wezterm';

	try {
		execSync('tmux list-sessions', { stdio: 'ignore', windowsHide: true });
		return 'tmux';
	} catch {}

	try {
		const whichCmd =
			process.platform === 'win32' ? 'where wezterm' : 'which wezterm';
		execSync(whichCmd, { stdio: 'ignore', windowsHide: true });
		return 'wezterm';
	} catch {}

	if (process.platform === 'darwin') return 'macos-terminal';

	return 'none';
}

export function isBridgeModeActive(): boolean {
	if ((process.env.OMC_BRIDGE_MODE || '').trim() === '1') return true;

	try {
		const statePath = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'bridge-state.json',
		);
		if (!existsSync(statePath)) return false;
		const parsed = JSON.parse(readFileSync(statePath, 'utf-8')) as {
			ais?: unknown[];
		};
		return Array.isArray(parsed.ais) && parsed.ais.length > 0;
	} catch {
		return false;
	}
}

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

export function spawnProxySwitchedCC(
	terminal: TerminalBackend,
	alias: string,
	claudeArgs: string[],
): boolean {
	const cwd = process.cwd();
	const argsStr = claudeArgs.map((arg) => shellEscapeSingle(arg)).join(' ');
	const claudeCmd = `claude${argsStr ? ` ${argsStr}` : ''}`;
	const controlPort = resolveProxyControlPort();

	const buildSwitchCmd = (alias: string): string => {
		if (alias === 'revert' || alias === '') return '';
		const provider = resolveProviderName(alias);
		return `curl -sf -X POST http://localhost:${controlPort}/switch -H 'Content-Type: application/json' -d '{"provider":"${provider}"}' > /dev/null 2>&1; `;
	};

	try {
		if (terminal === 'tmux') {
			const switchCmd = buildSwitchCmd(alias);
			const command = `${switchCmd}${claudeCmd}`;
			const tmuxArgs = process.env.TMUX
				? ['new-window', '-c', cwd, command]
				: ['new-window', '-c', cwd, '-t', '0:', command];
			const result = spawnSync('tmux', tmuxArgs, {
				stdio: 'ignore',
				windowsHide: true,
			});
			return result.status === 0;
		}

		if (terminal === 'wezterm') {
			const wezterm = resolveWeztermBinary();
			if (process.platform === 'win32') {
				const switchPart =
					alias !== 'revert'
						? `oh-my-claude proxy switch ${alias} 2>nul & `
						: '';
				const command = `${switchPart}${claudeCmd}`;
				const result = spawnSync(
					wezterm,
					[
						'cli',
						'spawn',
						'--cwd',
						cwd,
						'--',
						'cmd.exe',
						'/k',
						command,
					],
					{ stdio: 'ignore', windowsHide: true },
				);
				return result.status === 0;
			}

			const switchCmd = buildSwitchCmd(alias);
			const unixCommand = `${switchCmd}${claudeCmd}`;
			const result = spawnSync(
				wezterm,
				[
					'cli',
					'spawn',
					'--cwd',
					cwd,
					'--',
					'bash',
					'-lc',
					unixCommand,
				],
				{ stdio: 'ignore', windowsHide: true },
			);
			return result.status === 0;
		}

		if (terminal === 'macos-terminal') {
			return spawnMacOSTerminal(alias, claudeArgs, cwd, controlPort);
		}
	} catch {
		return false;
	}

	return false;
}

export function spawnMacOSTerminal(
	alias: string,
	claudeArgs: string[],
	cwd: string,
	controlPort?: number,
): boolean {
	if (process.platform !== 'darwin') return false;

	const argsStr = claudeArgs.map((arg) => shellEscapeSingle(arg)).join(' ');
	const port = controlPort ?? 18911;
	const provider = resolveProviderName(alias);
	const switchPart =
		alias && alias !== 'revert'
			? `curl -sf -X POST http://localhost:${port}/switch -H 'Content-Type: application/json' -d '{\\\"provider\\\":\\\"${provider}\\\"}' > /dev/null 2>&1 && `
			: '';
	const command = `cd ${shellEscapeSingle(cwd)} && ${switchPart}claude${argsStr ? ` ${argsStr}` : ''} ; exit`;
	const osaScript = `tell application "Terminal" to do script "${appleScriptEscape(command)}"`;

	const result = spawnSync('osascript', ['-e', osaScript], {
		stdio: 'ignore',
		windowsHide: true,
	});
	return result.status === 0;
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
		const { readFileSync, existsSync } = require('node:fs');
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
