/**
 * CC command — Windows routing
 *
 * Terminal detection: $WEZTERM_PANE → where wezterm → 'none'
 * Proxy-switched CC launch: wezterm cli spawn with cmd.exe
 */

import { spawnSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveWeztermBinary } from '../../utils/terminal-detect';
import type { TerminalBackend } from './cc-routing';

export function detectTerminalBackend(): TerminalBackend {
	if (process.env.WEZTERM_PANE) return 'wezterm';

	try {
		execSync('where wezterm', { stdio: 'ignore', windowsHide: true });
		return 'wezterm';
	} catch {}

	return 'none';
}

export function spawnProxySwitchedCC(
	terminal: TerminalBackend,
	alias: string,
	claudeArgs: string[],
): boolean {
	// Lazy import to avoid circular dep at module evaluation time
	const { shellEscapeSingle } =
		require('./cc-routing') as typeof import('./cc-routing');

	const cwd = process.cwd();
	const argsStr = claudeArgs.map((arg) => shellEscapeSingle(arg)).join(' ');
	const claudeCmd = `claude${argsStr ? ` ${argsStr}` : ''}`;

	try {
		if (terminal === 'wezterm') {
			const wezterm = resolveWeztermBinary();
			// Write a temp .cmd batch file to avoid shell quoting issues
			// when WezTerm forwards args to cmd.exe
			const batchLines = [
				'@echo off',
				...(alias !== 'revert'
					? [`oh-my-claude proxy switch ${alias} 2>nul`]
					: []),
				claudeCmd,
			];
			const batchDir = join(tmpdir(), 'omc-cc');
			mkdirSync(batchDir, { recursive: true });
			const batchPath = join(batchDir, `cc-switch-${Date.now()}.cmd`);
			writeFileSync(batchPath, batchLines.join('\r\n') + '\r\n');

			const result = spawnSync(
				wezterm,
				['cli', 'spawn', '--cwd', cwd, '--', 'cmd.exe', '/d', '/k', 'call', batchPath],
				{ stdio: 'ignore', windowsHide: true },
			);
			return result.status === 0;
		}
	} catch {
		return false;
	}

	return false;
}
