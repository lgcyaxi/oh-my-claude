/**
 * CC command - Windows session launch paths
 *
 * Detached: wezterm window with visible debug proxy pane
 * Inline:   taskkill cleanup, cmd.exe shell, no tmux inline wrapping
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
	launchInWezterm,
	splitCCIntoDebugPane,
	spawnProxyInWeztermWindow,
	type WezTermLaunchResult,
} from './cc-terminals-win';

export type WindowsDebugPresentation = 'pane' | 'window';

type DebugNotice = {
	level: 'ok' | 'fail' | 'dim';
	message: string;
};

export type WindowsDebugLaunchResult = {
	presentation: WindowsDebugPresentation;
	paneId?: string;
	proxyPid: number;
	notices: DebugNotice[];
};

type WindowsDebugLaunchDeps = {
	spawnProxyInWeztermWindow: typeof spawnProxyInWeztermWindow;
	waitForHealth: typeof waitForHealth;
	resolveListeningPid: typeof resolveListeningPid;
};

type DetachedSessionDeps = {
	spawnDetachedProxy: typeof spawnDetachedProxy;
	launchInWezterm: typeof launchInWezterm;
	splitCCIntoDebugPane: typeof splitCCIntoDebugPane;
	registerProxySession: typeof registerProxySession;
	launchDetachedDebugProxy: typeof launchDetachedDebugProxy;
	killProcess: (pid: number | undefined) => void;
	exit: (code: number) => never;
};

const defaultDebugLaunchDeps: WindowsDebugLaunchDeps = {
	spawnProxyInWeztermWindow,
	waitForHealth,
	resolveListeningPid,
};

const defaultDetachedSessionDeps: DetachedSessionDeps = {
	spawnDetachedProxy,
	launchInWezterm,
	splitCCIntoDebugPane,
	registerProxySession,
	launchDetachedDebugProxy,
	killProcess: killWindowsProcess,
	exit: (code: number) => process.exit(code),
};

function killWindowsProcess(pid: number | undefined): void {
	if (!pid) return;
	try {
		execSync(`taskkill /F /PID ${pid}`, {
			stdio: 'ignore',
			windowsHide: true,
		});
	} catch {
		// Process may already be gone.
	}
}

function readListeningPid(port: number): number | undefined {
	try {
		const raw = execSync(
			`netstat -ano | findstr :${port} | findstr LISTENING`,
			{
				encoding: 'utf-8',
				windowsHide: true,
			},
		).trim();
		const line = raw
			.split(/\r?\n/)
			.find((entry) => entry.includes(`:${port}`));
		if (!line) return undefined;
		const parts = line.trim().split(/\s+/);
		const pid = parseInt(parts[parts.length - 1] ?? '', 10);
		return Number.isNaN(pid) ? undefined : pid;
	} catch {
		return undefined;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureClaudeLaunch(
	result: WezTermLaunchResult,
	proxyPid: number | undefined,
	killProcess: (pid: number | undefined) => void,
	fail: (message: string) => string,
	exit: (code: number) => never,
): string | undefined {
	if (result.launched) return result.paneId;
	killProcess(proxyPid);
	console.log(fail('Failed to launch Claude Code in WezTerm window.'));
	exit(1);
}

export async function resolveListeningPid(
	port: number,
	attempts = 10,
	delayMs = 150,
): Promise<number | undefined> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const pid = readListeningPid(port);
		if (pid) return pid;
		if (attempt < attempts - 1) {
			await sleep(delayMs);
		}
	}
	return undefined;
}

export async function launchDetachedDebugProxy(
	options: {
		terminal: 'wezterm' | 'tmux';
		proxyScript: string;
		ports: { port: number; controlPort: number };
		cwd: string;
		sessionId: string;
		baseUrl: string;
		claudeArgsStr: string;
		switchProvider?: string;
		switchModel?: string;
	},
	deps: Partial<WindowsDebugLaunchDeps> = {},
): Promise<WindowsDebugLaunchResult> {
	const runtime = { ...defaultDebugLaunchDeps, ...deps };
	const { proxyScript, ports, cwd, sessionId, baseUrl, claudeArgsStr, switchProvider, switchModel } = options;
	const notices: DebugNotice[] = [];

	// Unified coordinator approach: works both inside and outside WezTerm.
	// Inside WezTerm: spawns coordinator in a new tab (same window, mux access).
	// Outside WezTerm: launches a new WezTerm window with coordinator.
	const opened = await runtime.spawnProxyInWeztermWindow(
		proxyScript,
		ports.port,
		ports.controlPort,
		cwd,
		sessionId,
		baseUrl,
		claudeArgsStr,
		switchProvider,
		switchModel,
	);
	if (!opened.windowStarted) {
		throw new Error('Failed to start bundled WezTerm window.');
	}

	const { healthy } = await runtime.waitForHealth(ports.controlPort, 50, 200);
	if (!healthy) {
		throw new Error('Proxy failed to become healthy within 10s.');
	}

	const proxyPid = await runtime.resolveListeningPid(ports.port);
	if (!proxyPid) {
		throw new Error('Failed to resolve proxy PID.');
	}

	const presentation = opened.paneId ? 'pane' : 'window';
	notices.push({
		level: 'ok',
		message: `Proxy running in debug ${presentation} (PID: ${proxyPid})`,
	});
	return { presentation, paneId: opened.paneId, proxyPid, notices };
}

export async function launchDetachedSession(
	options: {
		sessionId: string;
		ports: { port: number; controlPort: number };
		terminal: 'wezterm' | 'tmux';
		claudeArgs: string[];
		debug: boolean;
		switchProvider?: string;
		switchModel?: string;
	},
	deps: Partial<DetachedSessionDeps> = {},
): Promise<{ paneId?: string }> {
	const runtime = { ...defaultDetachedSessionDeps, ...deps };
	const {
		sessionId,
		ports,
		terminal,
		claudeArgs,
		debug,
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
	let debugPresentation: WindowsDebugPresentation | undefined;

	if (debug) {
		try {
			const debugLaunch = await runtime.launchDetachedDebugProxy({
				terminal,
				proxyScript: PROXY_SCRIPT,
				ports,
				cwd,
				sessionId,
				baseUrl,
				claudeArgsStr,
				switchProvider,
				switchModel,
			});
			proxyPid = debugLaunch.proxyPid;
			debugPresentation = debugLaunch.presentation;

			for (const notice of debugLaunch.notices) {
				if (notice.level === 'ok') {
					console.log(ok(notice.message));
				} else if (notice.level === 'fail') {
					console.log(fail(notice.message));
				} else {
					console.log(dimText(notice.message));
				}
			}

			// Inside WezTerm: proxy is in a new tab (paneId).
			// Split CC into the LEFT 65% of that tab. The CC pane
			// becomes the one we track and activate.
			if (debugLaunch.paneId) {
				const ccPaneId = runtime.splitCCIntoDebugPane(
					debugLaunch.paneId,
					baseUrl,
					ports.controlPort,
					claudeArgsStr,
					cwd,
				);
				paneId = ccPaneId ?? debugLaunch.paneId;
			}
		} catch (error) {
			runtime.killProcess(proxyPid);
			console.log(
				fail(
					error instanceof Error
						? error.message
						: 'Failed to launch visible debug proxy.',
				),
			);
			runtime.exit(1);
		}
	} else {
		const proxyResult = await runtime.spawnDetachedProxy({
			...ports,
			debug,
			sessionId,
			provider: switchProvider,
			model: switchModel,
		});

		if (!proxyResult) {
			console.log(fail('Proxy server script not found.'));
			console.log(dimText("Run 'oh-my-claude install' first."));
			runtime.exit(1);
			return {};
		}

		if (!proxyResult.healthy) {
			console.log(fail('Per-session proxy failed to start within 3s.'));
			runtime.killProcess(proxyResult.pid);
			runtime.exit(1);
			return {};
		}

		proxyPid = proxyResult.pid;
		console.log(ok(`Proxy started (PID: ${proxyPid}, detached)`));

		paneId = ensureClaudeLaunch(
			runtime.launchInWezterm(
				baseUrl,
				ports.controlPort,
				claudeArgsStr,
				debug,
				cwd,
				proxyPid,
			),
			proxyPid,
			runtime.killProcess,
			fail,
			runtime.exit,
		);
	}

	runtime.registerProxySession({
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
	const launchTarget = process.env.WEZTERM_PANE ? 'tab' : 'window';
	console.log(ok(`Session: ${c.cyan}${sessionId}${c.reset}`));
	console.log(
		ok(`Claude Code launched in ${terminal} ${launchTarget}${argsLabel}`),
	);
	if (debugPresentation === 'pane') {
		console.log(dimText('  Debug: proxy visible in right pane'));
	} else if (debugPresentation === 'window') {
		console.log(dimText('  Debug: proxy visible in WezTerm window'));
	}
	console.log(dimText(`\n  Stop session: oh-my-claude cc stop ${sessionId}`));
	console.log(dimText('  List sessions: oh-my-claude cc list'));

	// Tab activation for inside-WezTerm is handled by splitCCIntoDebugPane()
	// which already calls activate-pane when creating the CC split.

	return { paneId };
}

export async function launchInlineSession(options: {
	sessionId: string;
	ports: { port: number; controlPort: number };
	claudeArgs: string[];
	debug: boolean;
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
		isRemoteControl,
		terminalMode,
		insideWezTerm,
		switchProvider,
		switchModel,
	} = options;
	const { c, ok, fail, dimText } = createFormatters();

	if (insideWezTerm) {
		console.log(dimText('  Inside WezTerm - launching inline...'));
	} else if (terminalMode === 'auto') {
		console.log(
			dimText(
				'  No terminal multiplexer found (wezterm), launching inline...',
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

	const activeProxy = proxyResult;
	if (!activeProxy.healthy) {
		console.log(fail('Per-session proxy failed to start within 3s.'));
		killWindowsProcess(activeProxy.child.pid ?? undefined);
		process.exit(1);
	}

	console.log(ok(`Proxy started (PID: ${activeProxy.child.pid})`));
	if (debug && activeProxy.logFile) {
		console.log(dimText(`  Log: ${activeProxy.logFile}`));
	}

	registerProxySession({
		sessionId,
		port: ports.port,
		controlPort: ports.controlPort,
		pid: activeProxy.child.pid!,
		startedAt: Date.now(),
		cwd: process.cwd(),
	});

	let cleanedUp = false;
	const cleanup = () => {
		if (cleanedUp) return;
		cleanedUp = true;
		unregisterProxySession(sessionId);
		killWindowsProcess(activeProxy.child.pid ?? undefined);
	};

	process.on('SIGINT', () => {
		cleanup();
		process.exit(130);
	});
	process.on('SIGTERM', () => {
		cleanup();
		process.exit(143);
	});

	const argsLabel = claudeArgs.length > 0 ? ` (${claudeArgs.join(' ')})` : '';
	console.log(ok(`Session: ${c.cyan}${sessionId}${c.reset}`));

	const baseUrl = `http://localhost:${ports.port}/s/${sessionId}`;

	if (isRemoteControl) {
		console.log(ok('Launching Claude Code Remote Control...\n'));
		console.log(
			dimText('  Connect from claude.ai/code or Claude mobile app'),
		);
		console.log(
			dimText('  API calls will route through the oh-my-claude proxy'),
		);
		console.log(
			dimText('  Use /omc-switch in-session to change provider\n'),
		);

		const result = spawnSync('claude', ['remote-control'], {
			stdio: 'inherit',
			env: {
				...process.env,
				ANTHROPIC_BASE_URL: baseUrl,
				OMC_PROXY_CONTROL_PORT: String(ports.controlPort),
				...(debug ? { OMC_DEBUG: '1' } : {}),
			},
			shell: true,
		});

		cleanup();
		process.exit(result.status ?? 0);
	}

	console.log(ok(`Launching Claude Code${argsLabel}...\n`));

	const shell: string | boolean = true;

	if (debug) {
		const { dimText: dim } = createFormatters();
		console.log(dim(`  Shell: ${shell}`));
	}

	const env: Record<string, string | undefined> = {
		...process.env,
		ANTHROPIC_BASE_URL: baseUrl,
		OMC_PROXY_CONTROL_PORT: String(ports.controlPort),
		...(debug ? { OMC_DEBUG: '1' } : {}),
		CLAUDECODE: undefined,
	};

	const result = spawnSync('claude', claudeArgs, {
		stdio: 'inherit',
		env,
		shell,
	});

	cleanup();
	process.exit(result.status ?? 0);
}
