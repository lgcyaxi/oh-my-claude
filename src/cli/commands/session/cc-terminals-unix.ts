/**
 * CC command — Unix terminal implementations (macOS/Linux)
 *
 * Terminal backends: tmux (multiplexer) + Terminal.app (native macOS fallback)
 */

import { spawnSync, execSync } from 'node:child_process';
import { detectTerminalBackend, appleScriptEscape } from './cc-routing';

export async function shouldUseTmuxInline(): Promise<boolean> {
	if (process.env.TMUX) return false;
	return detectTerminalBackend() === 'tmux';
}

export function launchInWezterm(
	_baseUrl: string,
	_controlPort: number,
	_claudeArgsStr: string,
	_debug: boolean,
	_cwd: string,
	_proxyPid?: number,
): string | undefined {
	return undefined;
}

export function launchInTmux(
	sessionId: string,
	baseUrl: string,
	controlPort: number,
	claudeArgsStr: string,
	debug: boolean,
	cwd: string,
	proxyPid?: number,
): string | undefined {
	const tmuxSession = `omc-cc-${sessionId}`;
	const escapedCwd = cwd.replace(/'/g, "'\\''");
	const envParts = [
		`ANTHROPIC_BASE_URL=${baseUrl}`,
		`OMC_PROXY_CONTROL_PORT=${controlPort}`,
		...(debug ? ['OMC_DEBUG=1'] : []),
	];
	const killProxy = proxyPid
		? `; kill ${proxyPid} 2>/dev/null`
		: '';
	const shellCmd = `cd '${escapedCwd}' && unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CODEX_COMPANION_SESSION_ID && ${envParts.join(' ')} claude${claudeArgsStr}${killProxy}`;
	const escapedShellCmd = shellCmd.replace(/'/g, "'\\''");

	try {
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
	_terminal: 'wezterm' | 'tmux',
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
	_terminal: 'wezterm' | 'tmux',
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
	try {
		execSync(`tmux kill-session -t ${paneId}`, {
			encoding: 'utf-8',
			windowsHide: true,
		});
	} catch {
		// Terminal pane may already be dead
	}
}
