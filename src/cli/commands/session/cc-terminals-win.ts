/**
 * CC command - Windows terminal implementations
 *
 * Terminal backends: wezterm (multiplexer) + cmd.exe/Git Bash (native)
 * No tmux support on Windows - that lives in cc-terminals-unix.ts
 */

import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveBunPath } from '../../utils/bun';
import {
	resolveWeztermBinary,
} from '../../utils/terminal-detect';

export type WezTermLaunchResult = {
	launched: boolean;
	paneId?: string;
};

export type WezTermWindowLaunchResult = {
	windowStarted: boolean;
	/** Set when spawned inside WezTerm via cli spawn (coordinator tab pane ID). */
	paneId?: string;
};

type WezTermLaunchDeps = {
	spawnSyncImpl?: typeof spawnSync;
	spawnImpl?: typeof spawn;
	resolveWeztermBinaryImpl?: typeof resolveWeztermBinary;
	isWezTermMuxAvailableImpl?: typeof isWezTermMuxAvailable;
};

type VisibleProxyDeps = {
	spawnSyncImpl?: typeof spawnSync;
	spawnImpl?: typeof spawn;
	resolveWeztermBinaryImpl?: typeof resolveWeztermBinary;
	resolveBunPathImpl?: typeof resolveBunPath;
	buildVisibleProxyLauncherImpl?: typeof buildVisibleProxyLauncher;
};

function quoteCmdArg(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function buildProxyCommandLine(
	bunPath: string,
	proxyScript: string,
	port: number,
	controlPort: number,
	switchProvider?: string,
	switchModel?: string,
): string {
	const args = [
		quoteCmdArg(bunPath),
		'run',
		quoteCmdArg(proxyScript),
		'--port',
		String(port),
		'--control-port',
		String(controlPort),
	];
	if (switchProvider && switchModel) {
		args.push('--provider', quoteCmdArg(switchProvider));
		args.push('--model', quoteCmdArg(switchModel));
	}
	return args.join(' ');
}

function buildVisibleProxyLauncher(
	proxyScript: string,
	port: number,
	controlPort: number,
	cwd: string,
	switchProvider?: string,
	switchModel?: string,
	resolveBunPathImpl: typeof resolveBunPath = resolveBunPath,
): string {
	const bunPath = resolveBunPathImpl();
	const launcherDir = join(tmpdir(), 'oh-my-claude', 'proxy-launchers');
	mkdirSync(launcherDir, { recursive: true });
	const launcherPath = join(launcherDir, `proxy-${port}-${controlPort}.cmd`);
	const proxyCmd = buildProxyCommandLine(
		bunPath,
		proxyScript,
		port,
		controlPort,
		switchProvider,
		switchModel,
	);
	const launcherBody = [
		'@echo off',
		`cd /d ${quoteCmdArg(cwd)}`,
		`${proxyCmd}`,
		'if errorlevel 1 (',
		'\tset OMC_PROXY_EXIT_CODE=%ERRORLEVEL%',
		'\techo.',
		'\techo Visible proxy failed to start.',
		'\techo Exit code %OMC_PROXY_EXIT_CODE%.',
		'\techo Press any key to close this window.',
		'\tpause >nul',
		'\texit /b %OMC_PROXY_EXIT_CODE%',
		')',
	].join('\r\n');
	writeFileSync(launcherPath, launcherBody, 'utf8');
	return launcherPath;
}

/**
 * Build a JS script that launches Claude Code with the correct env vars.
 * Used by `splitCCIntoDebugPane()` to run CC inside a WezTerm split pane.
 */
export function buildCCRunnerScript(opts: {
	baseUrl: string;
	controlPort: number;
	claudeArgsStr: string;
	cwd: string;
}): string {
	const launcherDir = join(tmpdir(), 'oh-my-claude', 'proxy-launchers');
	mkdirSync(launcherDir, { recursive: true });
	const scriptPath = join(launcherDir, `cc-runner-${opts.controlPort}.js`);

	const claudeArgs = opts.claudeArgsStr.trim().split(/\s+/).filter(Boolean);

	const body = `// oh-my-claude CC runner (generated — do not edit)
process.env.ANTHROPIC_BASE_URL = ${JSON.stringify(opts.baseUrl)};
process.env.OMC_PROXY_CONTROL_PORT = ${JSON.stringify(String(opts.controlPort))};
process.env.OMC_DEBUG = "1";
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;
delete process.env.CLAUDE_CODE_EXECPATH;
delete process.env.CODEX_COMPANION_SESSION_ID;
const r = Bun.spawnSync(${JSON.stringify(['claude', ...claudeArgs])}, {
  stdio: ["inherit", "inherit", "inherit"],
  env: process.env,
  cwd: ${JSON.stringify(opts.cwd)},
});
process.exit(r.exitCode ?? 0);
`;
	writeFileSync(scriptPath, body, 'utf8');
	return scriptPath;
}

/**
 * Build a JS coordinator script for outside-WezTerm debug launch.
 * Runs via `bun coordinator.js` inside a new WezTerm window.
 *
 * The coordinator uses Bun.spawnSync (array args) to:
 * 1. Split the current pane: right 35% for the proxy
 * 2. Run the proxy (bun run proxy-server.js) in the split pane
 * 3. Launch claude in the coordinator's own pane (becomes CC)
 */
export function buildJsCoordinator(opts: {
	weztermPath: string;
	bunPath: string;
	proxyScript: string;
	port: number;
	controlPort: number;
	cwd: string;
	baseUrl: string;
	claudeArgsStr: string;
	switchProvider?: string;
	switchModel?: string;
}): string {
	const launcherDir = join(tmpdir(), 'oh-my-claude', 'proxy-launchers');
	mkdirSync(launcherDir, { recursive: true });
	const coordPath = join(launcherDir, `coordinator-${opts.port}-${opts.controlPort}.js`);

	const proxyArgs = JSON.stringify([
		opts.bunPath, 'run', opts.proxyScript,
		'--port', String(opts.port),
		'--control-port', String(opts.controlPort),
		...(opts.switchProvider && opts.switchModel
			? ['--provider', opts.switchProvider, '--model', opts.switchModel]
			: []),
	]);

	const body = `// oh-my-claude debug coordinator (generated — do not edit)
const wez = ${JSON.stringify(opts.weztermPath)};
const cwd = ${JSON.stringify(opts.cwd)};

// 1. Split right 35% for proxy pane — run bun directly (no shell/send-text)
const proxyArgs = ${proxyArgs};
const split = Bun.spawnSync([wez, "cli", "split-pane", "--right", "--percent", "35", "--cwd", cwd, "--", ...proxyArgs], { cwd });
const proxyPaneId = split.stdout.toString().trim();
if (split.exitCode !== 0 || !/^\\d+$/.test(proxyPaneId)) {
  console.error("Failed to split pane:", split.stderr.toString());
  process.exit(1);
}

// 2. Wait for proxy startup, then launch claude in this pane
await Bun.sleep(2000);
process.chdir(cwd);
process.env.ANTHROPIC_BASE_URL = ${JSON.stringify(opts.baseUrl)};
process.env.OMC_PROXY_CONTROL_PORT = ${JSON.stringify(String(opts.controlPort))};
process.env.OMC_DEBUG = "1";
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;
delete process.env.CLAUDE_CODE_EXECPATH;
delete process.env.CODEX_COMPANION_SESSION_ID;
const claudeArgs = ${JSON.stringify(['claude', ...opts.claudeArgsStr.trim().split(/\s+/).filter(Boolean)])};
const claude = Bun.spawnSync(claudeArgs, {
  stdio: ["inherit", "inherit", "inherit"],
  env: process.env,
  cwd,
});
process.exit(claude.exitCode ?? 0);
`;
	writeFileSync(coordPath, body, 'utf8');
	return coordPath;
}

/**
 * Build a coordinator .cmd script that runs inside the WezTerm window.
 * It uses `wezterm cli split-pane` to create the proxy pane, waits briefly,
 * then launches Claude Code in the main pane with the correct env vars.
 */
export function buildDebugCoordinatorScript(opts: {
	weztermPath: string;
	proxyLauncherPath: string;
	cwd: string;
	baseUrl: string;
	controlPort: number;
	claudeArgsStr: string;
	port: number;
}): string {
	const launcherDir = join(tmpdir(), 'oh-my-claude', 'proxy-launchers');
	mkdirSync(launcherDir, { recursive: true });
	const coordPath = join(
		launcherDir,
		`coordinator-${opts.port}-${opts.controlPort}.cmd`,
	);
	const body = [
		'@echo off',
		`${quoteCmdArg(opts.weztermPath)} cli split-pane --right --percent 35 -- cmd.exe /d /c call ${quoteCmdArg(opts.proxyLauncherPath)}`,
		'timeout /t 2 /nobreak >nul',
		`cd /d ${quoteCmdArg(opts.cwd)}`,
		`set ANTHROPIC_BASE_URL=${opts.baseUrl}`,
		`set OMC_PROXY_CONTROL_PORT=${opts.controlPort}`,
		'set OMC_DEBUG=1',
		'set CLAUDECODE=',
		'set CLAUDE_CODE_ENTRYPOINT=',
		'set CLAUDE_CODE_EXECPATH=',
		'set CODEX_COMPANION_SESSION_ID=',
		`claude${opts.claudeArgsStr}`,
	].join('\r\n');
	writeFileSync(coordPath, body, 'utf8');
	return coordPath;
}

export function isWezTermMuxAvailable(): boolean {
	try {
		const wezterm = resolveWeztermBinary();
		const result = spawnSync(wezterm, ['cli', 'list'], {
			encoding: 'utf-8',
			windowsHide: true,
			timeout: 5_000,
		});
		return result.status === 0;
	} catch {
		return false;
	}
}

export function canManageWeztermPanes(): boolean {
	return !!process.env.WEZTERM_PANE && isWezTermMuxAvailable();
}

export async function shouldUseTmuxInline(): Promise<boolean> {
	return false;
}

export function launchInTmux(
	_sessionId: string,
	_baseUrl: string,
	_controlPort: number,
	_claudeArgsStr: string,
	_debug: boolean,
	_cwd: string,
	_proxyPid?: number,
): string | undefined {
	return undefined;
}

export function launchInWezterm(
	baseUrl: string,
	controlPort: number,
	claudeArgsStr: string,
	debug: boolean,
	cwd: string,
	proxyPid?: number,
	deps: WezTermLaunchDeps = {},
): WezTermLaunchResult {
	const spawnSyncImpl = deps.spawnSyncImpl ?? spawnSync;
	const spawnImpl = deps.spawnImpl ?? spawn;
	const resolveWeztermBinaryImpl =
		deps.resolveWeztermBinaryImpl ?? resolveWeztermBinary;
	const isWezTermMuxAvailableImpl =
		deps.isWezTermMuxAvailableImpl ?? isWezTermMuxAvailable;
	const wezterm = resolveWeztermBinaryImpl();
	const insideWezTerm = !!process.env.WEZTERM_PANE;

	// Write a temp .cmd batch file to avoid shell quoting/escaping issues
	// when WezTerm forwards args to cmd.exe (especially with && chains).
	const killProxy = proxyPid
		? `taskkill /F /PID ${proxyPid} >nul 2>&1\n`
		: '';
	const batchLines = [
		'@echo off',
		`set ANTHROPIC_BASE_URL=${baseUrl}`,
		`set OMC_PROXY_CONTROL_PORT=${controlPort}`,
		'set CLAUDECODE=',
		'set CLAUDE_CODE_ENTRYPOINT=',
		'set CLAUDE_CODE_EXECPATH=',
		'set CODEX_COMPANION_SESSION_ID=',
		...(debug ? ['set OMC_DEBUG=1'] : []),
		`claude${claudeArgsStr}`,
		killProxy,
	].filter(Boolean);
	const batchDir = join(tmpdir(), 'omc-cc');
	mkdirSync(batchDir, { recursive: true });
	const batchPath = join(batchDir, `cc-launch-${Date.now()}.cmd`);
	writeFileSync(batchPath, batchLines.join('\r\n') + '\r\n');

	if (insideWezTerm && isWezTermMuxAvailableImpl()) {
		try {
			const result = spawnSyncImpl(
				wezterm,
				[
					'cli',
					'spawn',
					'--cwd',
					cwd,
					'--',
					'cmd.exe',
					'/d',
					'/k',
					'call',
					batchPath,
				],
				{
					encoding: 'utf-8',
					windowsHide: true,
				},
			);
			const stdout = (result.stdout ?? '').trim();
			if (/^\d+$/.test(stdout)) {
				return { launched: true, paneId: stdout };
			}
		} catch {
			// Fall back to a detached window below.
		}
	}

	try {
		const child = spawnImpl(
			wezterm,
			[
				'start',
				'--cwd',
				cwd,
				'--',
				'cmd.exe',
				'/d',
				'/k',
				'call',
				batchPath,
			],
			{ detached: true, stdio: 'ignore', windowsHide: true },
		);
		child.unref();
		return { launched: true };
	} catch {
		return { launched: false };
	}
}

/**
 * Spawn the proxy in a visible wezterm pane.
 */
export function spawnVisibleProxy(
	_terminal: 'wezterm' | 'tmux',
	proxyScript: string,
	port: number,
	controlPort: number,
	cwd: string,
	_sessionId: string,
	switchProvider?: string,
	switchModel?: string,
	deps: VisibleProxyDeps = {},
): string | undefined {
	if (!canManageWeztermPanes()) return undefined;

	const spawnSyncImpl = deps.spawnSyncImpl ?? spawnSync;
	const resolveWeztermBinaryImpl =
		deps.resolveWeztermBinaryImpl ?? resolveWeztermBinary;
	const resolveBunPathImpl = deps.resolveBunPathImpl ?? resolveBunPath;
	const buildVisibleProxyLauncherImpl =
		deps.buildVisibleProxyLauncherImpl ?? buildVisibleProxyLauncher;
	const wezterm = resolveWeztermBinaryImpl();
	const launcherPath = buildVisibleProxyLauncherImpl(
		proxyScript,
		port,
		controlPort,
		cwd,
		switchProvider,
		switchModel,
		resolveBunPathImpl,
	);

	try {
		const result = spawnSyncImpl(
			wezterm,
			[
				'cli',
				'spawn',
				'--cwd',
				cwd,
				'--',
				'cmd.exe',
				'/d',
				'/c',
				'call',
				launcherPath,
			],
			{
				encoding: 'utf-8',
				windowsHide: true,
			},
		);
		const stdout = (result.stdout ?? '').trim();
		if (/^\d+$/.test(stdout)) return stdout;
	} catch {
		// Pane spawn failed; caller decides how to recover.
	}

	return undefined;
}

/**
 * Launch a coordinator script that creates [CC 65% | Proxy 35%] layout.
 *
 * Inside WezTerm: spawns coordinator in a new tab via `wezterm cli spawn`
 * (same window, guaranteed mux access). Returns paneId for tab activation.
 *
 * Outside WezTerm: launches a new WezTerm window via `wezterm start`.
 * The coordinator runs INSIDE the process with guaranteed mux access.
 */
export async function spawnProxyInWeztermWindow(
	proxyScript: string,
	port: number,
	controlPort: number,
	cwd: string,
	_sessionId: string,
	baseUrl: string,
	claudeArgsStr: string,
	switchProvider?: string,
	switchModel?: string,
	deps: VisibleProxyDeps = {},
): Promise<WezTermWindowLaunchResult> {
	const spawnImpl = deps.spawnImpl ?? spawn;
	const spawnSyncImpl = deps.spawnSyncImpl ?? spawnSync;
	const resolveWeztermBinaryImpl =
		deps.resolveWeztermBinaryImpl ?? resolveWeztermBinary;
	const resolveBunPathImpl = deps.resolveBunPathImpl ?? resolveBunPath;
	const wezterm = resolveWeztermBinaryImpl();
	const workspace = `omc-debug-${port}-${controlPort}`;
	const bunPath = resolveBunPathImpl();
	const jsCoordPath = buildJsCoordinator({
		weztermPath: wezterm,
		bunPath,
		proxyScript,
		port,
		controlPort,
		cwd,
		baseUrl,
		claudeArgsStr,
		switchProvider,
		switchModel,
	});

	// Inside WezTerm: spawn proxy DIRECTLY in a new tab (no coordinator).
	// The calling process has WEZTERM_PANE set → guaranteed mux access.
	// CC will be split into this pane later by splitCCIntoDebugPane().
	if (process.env.WEZTERM_PANE) {
		try {
			const proxyArgs = [
				bunPath, proxyScript,
				'--port', String(port),
				'--control-port', String(controlPort),
				...(switchProvider && switchModel
					? ['--provider', switchProvider, '--model', switchModel]
					: []),
			];
			const result = spawnSyncImpl(
				wezterm,
				['cli', 'spawn', '--cwd', cwd, '--', ...proxyArgs],
				{ encoding: 'utf-8', windowsHide: true },
			);
			const paneId = (result.stdout ?? '').trim();
			if (/^\d+$/.test(paneId)) {
				return { windowStarted: true, paneId };
			}
		} catch {
			// Fall through to wezterm start below.
		}
	}

	// Outside WezTerm (or cli spawn failed): launch new window
	try {
		const child = spawnImpl(
			wezterm,
			['start', '--workspace', workspace, '--', bunPath, jsCoordPath],
			{
				detached: true,
				stdio: 'ignore',
				windowsHide: true,
			},
		);
		child.unref();
		return { windowStarted: true };
	} catch {
		return { windowStarted: false };
	}
}

type SplitCCDeps = {
	spawnSyncImpl?: typeof spawnSync;
	resolveWeztermBinaryImpl?: typeof resolveWeztermBinary;
	resolveBunPathImpl?: typeof resolveBunPath;
};

/**
 * Split CC into an existing proxy pane (proxy-first inside-WezTerm flow).
 *
 * Creates [CC 65% | Proxy 35%] by splitting LEFT into the proxy's pane.
 * Uses a bun JS runner script to set env vars and launch claude.
 */
export function splitCCIntoDebugPane(
	proxyPaneId: string,
	baseUrl: string,
	controlPort: number,
	claudeArgsStr: string,
	cwd: string,
	deps: SplitCCDeps = {},
): string | undefined {
	const spawnSyncImpl = deps.spawnSyncImpl ?? spawnSync;
	const resolveWeztermBinaryImpl =
		deps.resolveWeztermBinaryImpl ?? resolveWeztermBinary;
	const resolveBunPathImpl = deps.resolveBunPathImpl ?? resolveBunPath;
	const wezterm = resolveWeztermBinaryImpl();
	const bunPath = resolveBunPathImpl();
	const ccScript = buildCCRunnerScript({
		baseUrl,
		controlPort,
		claudeArgsStr,
		cwd,
	});

	try {
		const result = spawnSyncImpl(
			wezterm,
			[
				'cli',
				'split-pane',
				'--left',
				'--percent',
				'65',
				'--pane-id',
				proxyPaneId,
				'--cwd',
				cwd,
				'--',
				bunPath,
				ccScript,
			],
			{ encoding: 'utf-8', windowsHide: true },
		);
		const paneId = (result.stdout ?? '').trim();
		if (/^\d+$/.test(paneId)) {
			try {
				spawnSyncImpl(
					wezterm,
					['cli', 'activate-pane', '--pane-id', paneId],
					{ encoding: 'utf-8', windowsHide: true },
				);
			} catch {
				// Best effort — CC pane exists regardless.
			}
			return paneId;
		}
	} catch {
		// Split failed; caller decides how to recover.
	}

	return undefined;
}

export function splitProxyIntoWeztermPane(
	_terminal: 'wezterm' | 'tmux',
	hostPaneId: string,
	proxyScript: string,
	port: number,
	controlPort: number,
	cwd: string,
	switchProvider?: string,
	switchModel?: string,
	deps: VisibleProxyDeps = {},
): string | undefined {
	const spawnSyncImpl = deps.spawnSyncImpl ?? spawnSync;
	const resolveWeztermBinaryImpl =
		deps.resolveWeztermBinaryImpl ?? resolveWeztermBinary;
	const resolveBunPathImpl = deps.resolveBunPathImpl ?? resolveBunPath;
	const buildVisibleProxyLauncherImpl =
		deps.buildVisibleProxyLauncherImpl ?? buildVisibleProxyLauncher;
	const wezterm = resolveWeztermBinaryImpl();
	const launcherPath = buildVisibleProxyLauncherImpl(
		proxyScript,
		port,
		controlPort,
		cwd,
		switchProvider,
		switchModel,
		resolveBunPathImpl,
	);

	try {
		const result = spawnSyncImpl(
			wezterm,
			[
				'cli',
				'split-pane',
				'--right',
				'--percent',
				'35',
				'--pane-id',
				hostPaneId,
				'--cwd',
				cwd,
				'--',
				'cmd.exe',
				'/d',
				'/c',
				'call',
				launcherPath,
			],
			{
				encoding: 'utf-8',
				windowsHide: true,
			},
		);
		const stdout = (result.stdout ?? '').trim();
		if (/^\d+$/.test(stdout)) return stdout;
	} catch {
		// Proxy pane split failed; caller decides how to recover.
	}

	return undefined;
}

/**
 * Split an existing wezterm pane: CC on the left (65%), proxy stays on the right.
 * After splitting, activates the CC pane so it has focus.
 */
export function splitCCIntoProxyPane(
	_terminal: 'wezterm' | 'tmux',
	proxyPaneId: string,
	baseUrl: string,
	controlPort: number,
	claudeArgsStr: string,
	cwd: string,
): string | undefined {
	const wezterm = resolveWeztermBinary();
	const envParts = [
		`set ANTHROPIC_BASE_URL=${baseUrl}`,
		`set OMC_PROXY_CONTROL_PORT=${controlPort}`,
		'set OMC_DEBUG=1',
	];
	const ccCmd = `cd /d "${cwd}" && set CLAUDECODE= && set CLAUDE_CODE_ENTRYPOINT= && set CLAUDE_CODE_EXECPATH= && set CODEX_COMPANION_SESSION_ID= && ${envParts.join(' && ')} && claude${claudeArgsStr}`;

	try {
		const stdout = execSync(
			`"${wezterm}" cli split-pane --left --percent 65 --pane-id ${proxyPaneId} --cwd "${cwd}" -- cmd.exe /d /k "${ccCmd}"`,
			{ encoding: 'utf-8' },
		).trim();
		if (/^\d+$/.test(stdout)) {
			try {
				// activate-pane focuses the pane AND switches to its tab
				execSync(
					`"${wezterm}" cli activate-pane --pane-id ${stdout}`,
					{ encoding: 'utf-8', windowsHide: true },
				);
			} catch {
				// Best effort - pane is created regardless.
			}
			return stdout;
		}
	} catch {
		// Split failed; caller decides how to recover.
	}

	return undefined;
}

export function spawnProxyInNativeTerminal(
	_proxyScript: string,
	_port: number,
	_controlPort: number,
	_cwd: string,
	_switchProvider?: string,
	_switchModel?: string,
): boolean {
	return false;
}

export function killTerminalPane(_backend: string, paneId: string): void {
	try {
		const wezterm = resolveWeztermBinary();
		execSync(`"${wezterm}" cli kill-pane --pane-id ${paneId}`, {
			encoding: 'utf-8',
			windowsHide: true,
		});
	} catch {
		// Terminal pane may already be dead.
	}
}
