/**
 * CC command — Unix terminal implementations (macOS/Linux)
 *
 * Terminal backends: tmux (multiplexer) + Terminal.app (native macOS fallback)
 */

import { spawnSync, execSync } from 'node:child_process';
import { detectTerminalBackend, appleScriptEscape } from './cc-routing';

export async function shouldUseTmuxInline(): Promise<boolean> {
	// Already inside tmux/psmux — run inline, let Claude Code use native tmux integration
	if (process.env.TMUX) return false;
	return detectTerminalBackend() === 'tmux';
}

/**
 * Get the first available tmux session name to attach a new window to.
 * Returns undefined if no psmux/tmux server is running.
 */
function getFirstTmuxSession(): string | undefined {
	try {
		const output = execSync("tmux list-sessions -F '#{session_name}'", {
			encoding: 'utf-8',
			windowsHide: true,
		}).trim();
		return output.split(/\r?\n/)[0] || undefined;
	} catch {
		return undefined;
	}
}

export function launchInTmux(
	sessionId: string,
	baseUrl: string,
	controlPort: number,
	claudeArgsStr: string,
	debug: boolean,
	cwd: string,
	proxyPid?: number,
	noFlicker?: boolean,
): string | undefined {
	const tmuxSession = `omc-cc-${sessionId}`;
	const isWindows = process.platform === 'win32';

	try {
		const escapedCwd = cwd.replace(/'/g, "'\\''");

		if (isWindows) {
			// psmux: create a window in existing session rather than a new session.
			// Use send-keys since psmux ignores shell-command arg in new-window/new-session.
			const envParts = [
				`ANTHROPIC_BASE_URL=${baseUrl}`,
				`OMC_PROXY_CONTROL_PORT=${controlPort}`,
				...(debug ? ['OMC_DEBUG=1'] : []),
				...(noFlicker ? ['CLAUDE_CODE_NO_FLICKER=1'] : []),
			];
			// Proxy cleanup: use trap to ensure proxy dies even on SIGINT/SIGTERM
			const killProxy = proxyPid
				? `trap "kill ${proxyPid} 2>/dev/null" EXIT; `
				: '';
			const shellCmd = `${killProxy}cd '${escapedCwd}' && unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CODEX_COMPANION_SESSION_ID && ${envParts.join(' ')} claude${claudeArgsStr}; exit`;

			const insideTmux = !!process.env.TMUX;
			const existingSession = !insideTmux ? getFirstTmuxSession() : undefined;

			if (insideTmux) {
				execSync(`tmux new-window -n '${tmuxSession}'`, {
					encoding: 'utf-8',
					windowsHide: true,
				});
			} else if (existingSession) {
				spawnSync('tmux', ['new-window', '-t', existingSession, '-n', tmuxSession], {
					stdio: 'ignore',
					windowsHide: true,
				});
			} else {
				spawnSync('tmux', ['new-session', '-d', '-s', tmuxSession], {
					stdio: 'ignore',
					windowsHide: true,
				});
			}

			const target = insideTmux
				? `${execSync("tmux display-message -p '#{session_name}'", { encoding: 'utf-8', windowsHide: true }).trim()}:${tmuxSession}`
				: existingSession
					? `${existingSession}:${tmuxSession}`
					: tmuxSession;

			spawnSync('tmux', ['send-keys', '-t', target, shellCmd, 'Enter'], {
				stdio: 'ignore',
				windowsHide: true,
			});

			// Return the full target so killTerminalPane can find the window
			return target;
		} else {
			// Unix: pass shell command directly to new-window/new-session
			const envParts = [
				`ANTHROPIC_BASE_URL=${baseUrl}`,
				`OMC_PROXY_CONTROL_PORT=${controlPort}`,
				...(debug ? ['OMC_DEBUG=1'] : []),
				...(noFlicker ? ['CLAUDE_CODE_NO_FLICKER=1'] : []),
			];
			// Use double-quotes inside trap so single-quote escaping in the
			// outer tmux command string doesn't break the trap body
			const killProxy = proxyPid
				? `trap "kill ${proxyPid} 2>/dev/null" EXIT; `
				: '';
			const shellCmd = `${killProxy}cd '${escapedCwd}' && unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CODEX_COMPANION_SESSION_ID && ${envParts.join(' ')} claude${claudeArgsStr}`;
			const escapedShellCmd = shellCmd.replace(/'/g, "'\\''");

			if (process.env.TMUX) {
				execSync(
					`tmux new-window -n '${tmuxSession}' -c '${escapedCwd}' '${escapedShellCmd}'`,
					{ encoding: 'utf-8', windowsHide: true },
				);
			} else {
				execSync(
					`tmux new-session -d -s ${tmuxSession} -c '${escapedCwd}' '${escapedShellCmd}'`,
					{ encoding: 'utf-8', windowsHide: true },
				);
			}
		}
		return tmuxSession;
	} catch {
		return undefined;
	}
}

/**
 * Spawn the proxy in a visible tmux pane.
 * Used by `omc cc --debug` so the user can see proxy output.
 */
export function spawnVisibleProxy(
	_terminal: 'tmux',
	proxyScript: string,
	port: number,
	controlPort: number,
	cwd: string,
	sessionId: string,
	switchProvider?: string,
	switchModel?: string,
): string | undefined {
	const escapedCwd = cwd.replace(/'/g, "'\\''");
	const providerArgs =
		switchProvider && switchModel
			? ` --provider ${switchProvider} --model ${switchModel}`
			: '';
	const proxyCmd = `bun run '${proxyScript.replace(/'/g, "'\\''")}' --port ${port} --control-port ${controlPort}${providerArgs}`;
	const tmuxName = `omc-cc-${sessionId}`;
	const insideTmux = !!process.env.TMUX;
	const escapedProxyCmd = proxyCmd.replace(/'/g, "'\\''");

	try {
		if (insideTmux) {
			execSync(
				`tmux new-window -d -n '${tmuxName}' -c '${escapedCwd}' '${escapedProxyCmd}'`,
				{ encoding: 'utf-8', windowsHide: true },
			);
		} else {
			execSync(
				`tmux new-session -d -s '${tmuxName}' -c '${escapedCwd}' '${escapedProxyCmd}'`,
				{ encoding: 'utf-8', windowsHide: true },
			);
		}
		return tmuxName;
	} catch {
		return undefined;
	}
}

/**
 * Split an existing tmux pane: CC on the left (65%), proxy stays on the right.
 * Auto-kills the debug window when CC exits.
 */
export function splitCCIntoProxyPane(
	_terminal: 'tmux',
	proxyPaneId: string,
	baseUrl: string,
	controlPort: number,
	claudeArgsStr: string,
	cwd: string,
): string | undefined {
	const escapedCwd = cwd.replace(/'/g, "'\\''");
	const envParts = [
		`ANTHROPIC_BASE_URL=${baseUrl}`,
		`OMC_PROXY_CONTROL_PORT=${controlPort}`,
		'OMC_DEBUG=1',
	];
	const ccCmd = `cd '${escapedCwd}' && unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CODEX_COMPANION_SESSION_ID && ${envParts.join(' ')} claude${claudeArgsStr}`;
	const wrappedCcCmd = `${ccCmd}; _rc=$?; echo ""; echo "--- claude exited with code: $_rc ---"; sleep 2; tmux kill-window -t '${proxyPaneId}' 2>/dev/null; exit $_rc`;
	const escapedCmd = wrappedCcCmd.replace(/'/g, "'\\''");
	const tmuxCmd = `tmux split-window -b -h -t '${proxyPaneId}' -l '65%' -c '${escapedCwd}' '${escapedCmd}'`;

	try {
		execSync(tmuxCmd, { encoding: 'utf-8', windowsHide: true });
		return proxyPaneId;
	} catch {
		return undefined;
	}
}

/**
 * Spawn the proxy in a native macOS Terminal.app window via osascript.
 * Returns false on Linux (no Terminal.app).
 */
export function spawnProxyInNativeTerminal(
	proxyScript: string,
	port: number,
	controlPort: number,
	cwd: string,
	switchProvider?: string,
	switchModel?: string,
): boolean {
	if (process.platform !== 'darwin') return false;

	const providerArgs =
		switchProvider && switchModel
			? ` --provider ${switchProvider} --model ${switchModel}`
			: '';
	const command = `cd ${cwd.replace(/'/g, "'\\''")} && bun run '${proxyScript.replace(/'/g, "'\\''")}' --port ${port} --control-port ${controlPort}${providerArgs}`;
	const osaScript = `tell application "Terminal" to do script "${appleScriptEscape(command)}"`;

	const result = spawnSync('osascript', ['-e', osaScript], {
		stdio: 'ignore',
		windowsHide: true,
	});
	return result.status === 0;
}

export function killTerminalPane(_backend: string, paneId: string): void {
	// paneId is either a standalone session name (Unix: "omc-cc-abc123") or a
	// "session:window" target (Windows session-reuse: "0:omc-cc-abc123").
	// Use kill-window for session:window targets (precise), kill-session for
	// standalone sessions (avoids accidentally targeting the wrong window).
	const cmd = paneId.includes(':') ? 'kill-window' : 'kill-session';
	try {
		execSync(`tmux ${cmd} -t '${paneId}'`, {
			encoding: 'utf-8',
			windowsHide: true,
		});
	} catch {
		// Terminal pane/session may already be dead
	}
}
