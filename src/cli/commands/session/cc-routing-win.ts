/**
 * CC command — Windows routing
 *
 * Terminal detection: tmux (via psmux) → 'none'
 * Proxy-switched CC launch: tmux split-pane
 */

import { spawnSync, execSync } from 'node:child_process';
import type { TerminalBackend } from './cc-routing';

export function detectTerminalBackend(): TerminalBackend {
	// Check if inside an active tmux session
	if (process.env.TMUX) return 'tmux';

	try {
		execSync('where tmux', { stdio: 'ignore', windowsHide: true });
		return 'tmux';
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
		if (terminal === 'tmux') {
			const switchCmd = alias !== 'revert'
				? `oh-my-claude proxy switch ${alias} 2>/dev/null; `
				: '';
			const fullCmd = `cd ${shellEscapeSingle(cwd)} && ${switchCmd}${claudeCmd}`;

			const result = spawnSync(
				'tmux',
				['split-window', '-h', fullCmd],
				{ stdio: 'ignore', windowsHide: true },
			);
			return result.status === 0;
		}
	} catch {
		return false;
	}

	return false;
}
