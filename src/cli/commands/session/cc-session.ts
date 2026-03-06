/**
 * CC command — Session launch paths (detached terminal + inline proxy)
 */

import { spawn, spawnSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createFormatters } from '../../utils/colors';
import {
	registerProxySession,
	unregisterProxySession,
} from '../../../proxy/registry';
import {
	spawnSessionProxy,
	spawnDetachedProxy,
} from '../../utils/proxy-lifecycle';
import {
	launchInWezterm,
	launchInTmux,
	shouldUseTmuxInline,
} from './cc-terminals';

/**
 * Launch CC in a detached terminal window (wezterm/tmux).
 * Proxy is spawned as a detached daemon that survives parent exit.
 * Returns the paneId for potential worker spawning.
 */
export async function launchDetachedSession(options: {
	sessionId: string;
	ports: { port: number; controlPort: number };
	terminal: 'wezterm' | 'tmux';
	claudeArgs: string[];
	debug: boolean;
	bridgeMode: boolean;
	switchProvider?: string;
	switchModel?: string;
}): Promise<{ paneId?: string }> {
	const {
		sessionId,
		ports,
		terminal,
		claudeArgs,
		debug,
		bridgeMode,
		switchProvider,
		switchModel,
	} = options;
	const { c, ok, fail, dimText } = createFormatters();

	console.log(ok(`Terminal: ${c.cyan}${terminal}${c.reset}`));

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

	console.log(ok(`Proxy started (PID: ${proxyResult.pid}, detached)`));
	if (debug && proxyResult.logFile) {
		console.log(dimText(`  Log: ${proxyResult.logFile}`));
	}

	const baseUrl = `http://localhost:${ports.port}/s/${sessionId}`;
	const claudeArgsStr =
		claudeArgs.length > 0 ? ' ' + claudeArgs.join(' ') : '';
	const proxyPid = proxyResult.pid;
	const cwd = process.cwd();

	let paneId: string | undefined;

	if (terminal === 'wezterm') {
		paneId = launchInWezterm(
			baseUrl,
			ports.controlPort,
			claudeArgsStr,
			debug,
			cwd,
			proxyPid,
			bridgeMode,
		);
	} else if (terminal === 'tmux') {
		paneId = launchInTmux(
			sessionId,
			baseUrl,
			ports.controlPort,
			claudeArgsStr,
			debug,
			cwd,
			proxyPid,
			bridgeMode,
		);
	}

	registerProxySession({
		sessionId,
		port: ports.port,
		controlPort: ports.controlPort,
		pid: proxyResult.pid,
		startedAt: Date.now(),
		cwd: process.cwd(),
		paneId,
		terminalBackend: terminal,
		detached: true,
	});

	const argsLabel = claudeArgs.length > 0 ? ` (${claudeArgs.join(' ')})` : '';
	const launchTarget =
		terminal === 'wezterm' && process.env.WEZTERM_PANE ? 'tab' : 'window';
	console.log(ok(`Session: ${c.cyan}${sessionId}${c.reset}`));
	console.log(
		ok(`Claude Code launched in ${terminal} ${launchTarget}${argsLabel}`),
	);
	console.log(dimText(`\n  Stop session: oh-my-claude cc stop ${sessionId}`));
	console.log(dimText(`  List sessions: oh-my-claude cc list`));

	return { paneId };
}

/**
 * Launch CC inline (attached proxy, dies with CC session).
 */
export async function launchInlineSession(options: {
	sessionId: string;
	ports: { port: number; controlPort: number };
	claudeArgs: string[];
	debug: boolean;
	bridgeMode: boolean;
	isRemoteControl: boolean;
	terminalMode: string;
	insideWezTerm: boolean;
	switchProvider?: string;
	switchModel?: string;
}): Promise<void> {
	const {
		sessionId,
		ports,
		claudeArgs,
		debug,
		bridgeMode,
		isRemoteControl,
		terminalMode,
		insideWezTerm,
		switchProvider,
		switchModel,
	} = options;
	const { c, ok, fail, dimText } = createFormatters();

	if (insideWezTerm) {
		console.log(dimText('  Inside WezTerm — launching inline...'));
	} else if (terminalMode === 'auto') {
		console.log(
			dimText(
				'  No terminal multiplexer found (wezterm/tmux), launching inline...',
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
		const pid = proxyResult.child.pid;
		if (pid) {
			if (process.platform === 'win32') {
				try {
					execSync(`taskkill /F /PID ${pid}`, {
						stdio: 'ignore',
						windowsHide: true,
					});
				} catch {}
			} else {
				proxyResult.child.kill();
			}
		}
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

	// Remote Control mode
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

		const shell =
			process.env.SHELL || (process.env.MSYSTEM ? 'bash' : true);
		const result = spawnSync('claude', ['remote-control'], {
			stdio: 'inherit',
			env: {
				...process.env,
				ANTHROPIC_BASE_URL: baseUrl,
				OMC_PROXY_CONTROL_PORT: String(ports.controlPort),
				...(debug ? { OMC_DEBUG: '1' } : {}),
				...(bridgeMode ? { OMC_BRIDGE_MODE: '1' } : {}),
			},
			shell,
		});

		cleanup();
		process.exit(result.status ?? 0);
	}

	// Check if tmux is available for inline wrapping
	const useTmuxInline = await shouldUseTmuxInline();

	if (useTmuxInline) {
		console.log(
			ok(`Launching Claude Code in tmux session${argsLabel}...\n`),
		);

		if (bridgeMode && (process.env.OMC_BRIDGE_PANE || '').trim() === '1') {
			try {
				const runDir = join(
					homedir(),
					'.claude',
					'oh-my-claude',
					'run',
				);
				mkdirSync(runDir, { recursive: true });
				writeFileSync(
					join(runDir, `bridge-ready-${sessionId}.json`),
					JSON.stringify({ sessionId, readyAt: Date.now() }),
					'utf-8',
				);
			} catch {}
		}

		const tmuxSession = `omc-cc-${sessionId}`;
		const envPrefix = [
			`ANTHROPIC_BASE_URL=${baseUrl}`,
			`OMC_PROXY_CONTROL_PORT=${ports.controlPort}`,
			...(debug ? ['OMC_DEBUG=1'] : []),
			...(bridgeMode ? ['OMC_BRIDGE_MODE=1'] : []),
		].join(' ');
		const claudeCmd = `claude${claudeArgs.length > 0 ? ' ' + claudeArgs.join(' ') : ''}`;
		const bridgeDown = bridgeMode
			? '; oh-my-claude bridge down all 2>/dev/null'
			: '';
		const shellCmd = `${envPrefix} ${claudeCmd}${bridgeDown}`;

		const result = spawnSync(
			'tmux',
			['new-session', '-s', tmuxSession, shellCmd],
			{
				stdio: 'inherit',
				env: process.env,
			},
		);

		cleanup();
		process.exit(result.status ?? 0);
	}

	console.log(ok(`Launching Claude Code${argsLabel}...\n`));

	if (bridgeMode && (process.env.OMC_BRIDGE_PANE || '').trim() === '1') {
		try {
			const runDir = join(homedir(), '.claude', 'oh-my-claude', 'run');
			mkdirSync(runDir, { recursive: true });
			const signalPath = join(runDir, `bridge-ready-${sessionId}.json`);
			writeFileSync(
				signalPath,
				JSON.stringify({ sessionId, readyAt: Date.now() }),
				'utf-8',
			);
		} catch {}
	}

	const isBridgeWorker = (process.env.OMC_BRIDGE_PANE || '').trim() === '1';
	const shell =
		isBridgeWorker && process.platform === 'win32'
			? 'cmd.exe'
			: process.env.SHELL || (process.env.MSYSTEM ? 'bash' : true);

	if (debug) {
		const { dimText: dim } = createFormatters();
		console.log(dim(`  Shell: ${shell}, isBridgeWorker=${isBridgeWorker}`));
	}

	const result = spawnSync('claude', claudeArgs, {
		stdio: 'inherit',
		env: {
			...process.env,
			ANTHROPIC_BASE_URL: baseUrl,
			OMC_PROXY_CONTROL_PORT: String(ports.controlPort),
			...(debug ? { OMC_DEBUG: '1' } : {}),
			...(bridgeMode ? { OMC_BRIDGE_MODE: '1' } : {}),
			...(isBridgeWorker ? { CLAUDECODE: undefined } : {}),
		},
		shell,
	});

	cleanup();
	process.exit(result.status ?? 0);
}
