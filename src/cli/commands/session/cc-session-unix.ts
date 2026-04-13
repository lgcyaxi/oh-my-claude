/**
 * CC command — Cross-platform session launch paths
 *
 * Detached: tmux window with optional visible proxy pane (--debug)
 * Inline:   process cleanup, shell selection, tmux inline wrapping, Terminal.app debug fallback
 *
 * All platforms use tmux as the multiplexer (psmux on Windows provides tmux compatibility).
 */

import { spawnSync, execSync } from 'node:child_process';
import { createFormatters } from '../../utils/colors';
import {
	registerProxySession,
	unregisterProxySession,
} from '../../../proxy/registry';
import {
	spawnSessionProxy,
	spawnDetachedProxy,
	waitForHealth,
} from '../../utils/proxy-lifecycle';
import { PROXY_SCRIPT } from '../../utils/paths';
import {
	launchInTmux,
	shouldUseTmuxInline,
	spawnVisibleProxy,
	splitCCIntoProxyPane,
	spawnProxyInNativeTerminal,
} from './cc-terminals';

/**
 * Create and attach a tmux session using detach-then-attach pattern.
 * Works in IDE terminals (Cursor/VSCode) where stdin may not be a real TTY.
 * Direct `tmux new-session` (attached) fails with "open terminal failed"
 * when the parent process lacks a controlling terminal.
 */
function spawnSyncTmuxSession(
	sessionName: string,
	shellCmd: string,
	env?: Record<string, string | undefined>,
): ReturnType<typeof spawnSync> {
	if (process.platform === 'win32') {
		// psmux on Windows: shell-command arg is ignored, use send-keys with bash syntax
		// Append '; exit' so window closes when command exits (matching Unix behavior)
		spawnSync('tmux', ['new-session', '-d', '-s', sessionName], {
			stdio: 'ignore',
			env: env ?? process.env,
		});
		spawnSync('tmux', ['send-keys', '-t', sessionName, `${shellCmd}; exit`, 'Enter'], {
			stdio: 'ignore',
			env: env ?? process.env,
		});
	} else {
		spawnSync('tmux', ['new-session', '-d', '-s', sessionName, shellCmd], {
			stdio: 'ignore',
			env: env ?? process.env,
		});
	}
	return spawnSync('tmux', ['attach-session', '-t', sessionName], {
		stdio: 'inherit',
		env: env ?? process.env,
	});
}

export async function launchDetachedSession(options: {
	sessionId: string;
	ports: { port: number; controlPort: number };
	terminal: 'tmux';
	claudeArgs: string[];
	debug: boolean;
	noFlicker?: boolean;
	switchProvider?: string;
	switchModel?: string;
}): Promise<{ paneId?: string }> {
	const {
		sessionId,
		ports,
		terminal,
		claudeArgs,
		debug,
		noFlicker,
		switchProvider,
		switchModel,
	} = options;
	const { c, ok, fail, dimText } = createFormatters();
	const cwd = process.cwd();
	const baseUrl = `http://localhost:${ports.port}/s/${sessionId}`;
	const claudeArgsStr =
		claudeArgs.length > 0 ? ' ' + claudeArgs.join(' ') : '';

	console.log(ok(`Terminal: ${c.cyan}${terminal}${c.reset}`));

	let paneId: string | undefined;
	let proxyPid: number | undefined;

	if (debug) {
		const proxyPaneId = spawnVisibleProxy(
			terminal,
			PROXY_SCRIPT,
			ports.port,
			ports.controlPort,
			cwd,
			sessionId,
			switchProvider,
			switchModel,
		);

		if (!proxyPaneId) {
			console.log(fail('Failed to spawn visible proxy pane.'));
			console.log(dimText('Falling back to hidden proxy...'));

			const fallbackProxy = await spawnDetachedProxy({
				...ports,
				debug: true,
				sessionId,
				provider: switchProvider,
				model: switchModel,
			});
			if (!fallbackProxy) {
				console.log(fail('Proxy server script not found.'));
				process.exit(1);
			}
			if (!fallbackProxy.healthy) {
				console.log(fail('Hidden proxy failed to start within 3s.'));
				process.exit(1);
			}
			proxyPid = fallbackProxy.pid;
		} else {
			const { healthy } = await waitForHealth(ports.controlPort);
			if (!healthy) {
				console.log(fail('Proxy failed to start within 3s.'));
				process.exit(1);
			}
		}

		if (proxyPaneId) {
			if (!proxyPid) {
				try {
					const pidCmd = process.platform === 'win32'
						? `netstat -ano | findstr :${ports.port} | findstr LISTENING`
						: `lsof -ti tcp:${ports.port} 2>/dev/null || true`;
					const raw = execSync(pidCmd, { encoding: 'utf-8' }).trim();
					if (process.platform === 'win32') {
						const line = raw.split(/\r?\n/).find(l => l.includes(`:${ports.port}`));
						if (line) {
							const parts = line.trim().split(/\s+/);
							proxyPid = parseInt(parts[parts.length - 1] ?? '', 10);
						}
					} else {
						proxyPid = parseInt(raw, 10);
					}
				} catch {}
			}

			console.log(
				ok(
					`Proxy running in visible pane${proxyPid ? ` (PID: ${proxyPid})` : ''}`,
				),
			);

			paneId = splitCCIntoProxyPane(
				terminal,
				proxyPaneId,
				baseUrl,
				ports.controlPort,
				claudeArgsStr,
				cwd,
			);
		} else {
			paneId = launchInTmux(
				sessionId,
				baseUrl,
				ports.controlPort,
				claudeArgsStr,
				debug,
				cwd,
				proxyPid,
				noFlicker,
			);
		}
	} else {
		const proxyResult = await spawnDetachedProxy({
			...ports,
			debug,
			sessionId,
			provider: switchProvider,
			model: switchModel,
		});

		if (!proxyResult) {
			console.log(fail('Proxy server script not found.'));
			console.log(dimText("Run 'oh-my-claude install' first."));
			process.exit(1);
		}

		if (!proxyResult.healthy) {
			console.log(fail('Per-session proxy failed to start within 3s.'));
			try {
				process.kill(proxyResult.pid, 'SIGTERM');
			} catch {}
			process.exit(1);
		}

		proxyPid = proxyResult.pid;
		console.log(ok(`Proxy started (PID: ${proxyPid}, detached)`));

		paneId = launchInTmux(
			sessionId,
			baseUrl,
			ports.controlPort,
			claudeArgsStr,
			debug,
			cwd,
			proxyPid,
			noFlicker,
		);
	}

	registerProxySession({
		sessionId,
		port: ports.port,
		controlPort: ports.controlPort,
		pid: proxyPid ?? 0,
		startedAt: Date.now(),
		cwd,
		paneId,
		terminalBackend: terminal,
		detached: true,
	});

	const argsLabel = claudeArgs.length > 0 ? ` (${claudeArgs.join(' ')})` : '';
	console.log(ok(`Session: ${c.cyan}${sessionId}${c.reset}`));
	console.log(ok(`Claude Code launched in ${terminal} window${argsLabel}`));
	if (debug) {
		console.log(dimText(`  Debug: proxy visible in right pane`));
	}
	console.log(dimText(`\n  Stop session: oh-my-claude cc stop ${sessionId}`));
	console.log(dimText(`  List sessions: oh-my-claude cc list`));

	return { paneId };
}

export async function launchInlineSession(options: {
	sessionId: string;
	ports: { port: number; controlPort: number };
	claudeArgs: string[];
	debug: boolean;
	noFlicker?: boolean;
	isRemoteControl: boolean;
	terminalMode: string;
	switchProvider?: string;
	switchModel?: string;
}): Promise<void> {
	const {
		sessionId,
		ports,
		claudeArgs,
		debug,
		noFlicker,
		isRemoteControl,
		terminalMode,
		switchProvider,
		switchModel,
	} = options;
	const { c, ok, fail, dimText } = createFormatters();

	if (terminalMode === 'auto') {
		console.log(
			dimText(
				'  No terminal multiplexer found (tmux), launching inline...',
			),
		);
	}

	const proxyResult = await spawnSessionProxy({
		...ports,
		debug,
		sessionId,
		provider: switchProvider,
		model: switchModel,
	});

	if (!proxyResult) {
		console.log(fail('Proxy server script not found.'));
		console.log(dimText("Run 'oh-my-claude install' first."));
		process.exit(1);
	}

	if (!proxyResult.healthy) {
		console.log(fail('Per-session proxy failed to start within 3s.'));
		proxyResult.child.kill();
		process.exit(1);
	}

	console.log(ok(`Proxy started (PID: ${proxyResult.child.pid})`));
	if (debug && proxyResult.logFile) {
		console.log(dimText(`  Log: ${proxyResult.logFile}`));
	}

	registerProxySession({
		sessionId,
		port: ports.port,
		controlPort: ports.controlPort,
		pid: proxyResult.child.pid!,
		startedAt: Date.now(),
		cwd: process.cwd(),
	});

	let cleanedUp = false;
	const cleanup = () => {
		if (cleanedUp) return;
		cleanedUp = true;
		unregisterProxySession(sessionId);
		proxyResult.child.kill();
	};

	process.on('SIGINT', () => {
		cleanup();
		process.exit(130);
	});
	process.on('SIGTERM', () => {
		cleanup();
		process.exit(143);
	});
	process.on('SIGHUP', () => {
		cleanup();
		process.exit(129);
	});

	const argsLabel = claudeArgs.length > 0 ? ` (${claudeArgs.join(' ')})` : '';
	console.log(ok(`Session: ${c.cyan}${sessionId}${c.reset}`));

	const baseUrl = `http://localhost:${ports.port}/s/${sessionId}`;

	if (isRemoteControl) {
		console.log(ok(`Launching Claude Code Remote Control...\n`));
		console.log(
			dimText('  Connect from claude.ai/code or Claude mobile app'),
		);
		console.log(
			dimText('  API calls will route through the oh-my-claude proxy'),
		);
		console.log(
			dimText('  Use /omc-switch in-session to change provider\n'),
		);

		const shell = process.env.SHELL || 'bash';
		const result = spawnSync('claude', ['remote-control'], {
			stdio: 'inherit',
			env: {
				...process.env,
				ANTHROPIC_BASE_URL: baseUrl,
				OMC_PROXY_CONTROL_PORT: String(ports.controlPort),
				...(debug ? { OMC_DEBUG: '1' } : {}),
				...(noFlicker ? { CLAUDE_CODE_NO_FLICKER: '1' } : {}),
				CLAUDECODE: undefined,
				CLAUDE_CODE_ENTRYPOINT: undefined,
				CLAUDE_CODE_EXECPATH: undefined,
				CODEX_COMPANION_SESSION_ID: undefined,
			},
			shell,
		});

		cleanup();
		process.exit(result.status ?? 0);
	}

	const useTmuxInline = await shouldUseTmuxInline();

	if (useTmuxInline) {
		console.log(
			ok(`Launching Claude Code in tmux session${argsLabel}...\n`),
		);

		const tmuxSession = `omc-cc-${sessionId}`;
		const claudeCmd = `claude${claudeArgs.length > 0 ? ' ' + claudeArgs.join(' ') : ''}`;

		// psmux on Windows now uses bash (via terminal-config), so all platforms use bash syntax
		const envPrefix = [
			`ANTHROPIC_BASE_URL=${baseUrl}`,
			`OMC_PROXY_CONTROL_PORT=${ports.controlPort}`,
			...(debug ? ['OMC_DEBUG=1'] : []),
			...(noFlicker ? ['CLAUDE_CODE_NO_FLICKER=1'] : []),
		].join(' ');
		const shellCmd = `unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CODEX_COMPANION_SESSION_ID; ${envPrefix} ${claudeCmd}`;

		let result: ReturnType<typeof spawnSync>;

		if (debug) {
			proxyResult.child.kill();

			const proxyPaneId = spawnVisibleProxy(
				'tmux',
				PROXY_SCRIPT,
				ports.port,
				ports.controlPort,
				process.cwd(),
				sessionId,
				switchProvider,
				switchModel,
			);

			if (proxyPaneId) {
				const health = await waitForHealth(ports.controlPort);
				if (!health.healthy) {
					console.log(
						createFormatters().fail(
							'Visible proxy failed to start.',
						),
					);
					process.exit(1);
				}

				const wrappedShellCmd = `${shellCmd}; _rc=$?; echo ""; echo "--- claude exited with code: $_rc ---"; sleep 2; tmux kill-window -t '${proxyPaneId}' 2>/dev/null; exit $_rc`;
				execSync(
					`tmux split-window -b -h -t '${proxyPaneId}' -l '65%' '${wrappedShellCmd.replace(/'/g, "'\\''")}'`,
					{ encoding: 'utf-8', windowsHide: true },
				);

				result = spawnSync(
					'tmux',
					['attach-session', '-t', proxyPaneId],
					{ stdio: 'inherit', env: process.env },
				);
			} else {
				await spawnSessionProxy({
					...ports,
					debug,
					sessionId,
					provider: switchProvider,
					model: switchModel,
				});
				result = spawnSyncTmuxSession(tmuxSession, shellCmd);
			}
		} else {
			result = spawnSyncTmuxSession(tmuxSession, shellCmd);
		}

		cleanup();
		process.exit(result.status ?? 0);
	}

	console.log(ok(`Launching Claude Code${argsLabel}...\n`));

	let nativeProxySpawned = false;
	if (debug) {
		proxyResult.child.kill();
		nativeProxySpawned = spawnProxyInNativeTerminal(
			PROXY_SCRIPT,
			ports.port,
			ports.controlPort,
			process.cwd(),
			switchProvider,
			switchModel,
		);
		if (nativeProxySpawned) {
			console.log(ok('Proxy launched in Terminal.app window'));
			const health = await waitForHealth(ports.controlPort);
			if (!health.healthy) {
				console.log(
					fail('Proxy in Terminal.app failed to start within 3s.'),
				);
				process.exit(1);
			}
		} else {
			const fallback = await spawnSessionProxy({
				...ports,
				debug,
				sessionId,
				provider: switchProvider,
				model: switchModel,
			});
			if (!fallback || !fallback.healthy) {
				console.log(fail('Fallback proxy failed to start.'));
				process.exit(1);
			}
			proxyResult.child = fallback.child;
			if (fallback.logFile) {
				console.log(dimText(`  Log: ${fallback.logFile}`));
			}
		}
	}

	const shell = process.env.SHELL || 'bash';

	if (debug) {
		const { dimText: dim } = createFormatters();
		console.log(dim(`  Shell: ${shell}`));
	}

	const env: Record<string, string | undefined> = {
		...process.env,
		ANTHROPIC_BASE_URL: baseUrl,
		OMC_PROXY_CONTROL_PORT: String(ports.controlPort),
		...(debug ? { OMC_DEBUG: '1' } : {}),
		...(noFlicker ? { CLAUDE_CODE_NO_FLICKER: '1' } : {}),
		CLAUDECODE: undefined,
		CLAUDE_CODE_ENTRYPOINT: undefined,
		CLAUDE_CODE_EXECPATH: undefined,
		CODEX_COMPANION_SESSION_ID: undefined,
	};

	const result = spawnSync('claude', claudeArgs, {
		stdio: 'inherit',
		env,
		shell,
	});

	cleanup();

	if (nativeProxySpawned) {
		try {
			if (process.platform === 'win32') {
				const raw = execSync(`netstat -ano | findstr :${ports.port} | findstr LISTENING`, {
					encoding: 'utf-8',
					windowsHide: true,
				}).trim();
				const line = raw.split(/\r?\n/).find(l => l.includes(`:${ports.port}`));
				if (line) {
					const pid = line.trim().split(/\s+/).pop();
					if (pid) execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
				}
			} else {
				execSync(`lsof -ti tcp:${ports.port} | xargs kill 2>/dev/null`, {
					stdio: 'ignore',
					windowsHide: true,
				});
			}
		} catch {}
	}

	process.exit(result.status ?? 0);
}
