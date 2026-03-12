/**
 * CC command — Unix routing (macOS/Linux)
 *
 * Terminal detection: $TMUX → tmux list-sessions → macOS Terminal.app fallback
 * Proxy-switched CC launch: tmux new-window / Terminal.app via osascript
 */

import { spawnSync, execSync } from 'node:child_process';
import { resolveProviderName } from '../../../shared/providers/aliases';
import type { TerminalBackend } from './cc-routing';

export function detectTerminalBackend(): TerminalBackend {
	if (process.env.TMUX) return 'tmux';

	try {
		execSync('tmux list-sessions', { stdio: 'ignore', windowsHide: true });
		return 'tmux';
	} catch {}

	if (process.platform === 'darwin') return 'macos-terminal';

	return 'none';
}

export function spawnProxySwitchedCC(
	terminal: TerminalBackend,
	alias: string,
	claudeArgs: string[],
): boolean {
	// Lazy import to avoid circular dep at module evaluation time
	const { shellEscapeSingle, resolveProxyControlPort } =
		require('./cc-routing') as typeof import('./cc-routing');

	const cwd = process.cwd();
	const argsStr = claudeArgs.map((arg) => shellEscapeSingle(arg)).join(' ');
	const claudeCmd = `claude${argsStr ? ` ${argsStr}` : ''}`;
	const controlPort = resolveProxyControlPort();

	const buildSwitchCmd = (a: string): string => {
		if (a === 'revert' || a === '') return '';
		const provider = resolveProviderName(a);
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

	// Lazy import to avoid circular dep at module evaluation time
	const { shellEscapeSingle, appleScriptEscape } =
		require('./cc-routing') as typeof import('./cc-routing');

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
