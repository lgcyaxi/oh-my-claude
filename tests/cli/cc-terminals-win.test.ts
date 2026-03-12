import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
	buildCCRunnerScript,
	buildDebugCoordinatorScript,
	launchInWezterm,
	splitCCIntoDebugPane,
	spawnProxyInWeztermWindow,
	splitProxyIntoWeztermPane,
} from '../../src/cli/commands/session/cc-terminals-win';

const originalWeztermPane = process.env.WEZTERM_PANE;
const workspaceDir = 'C:/workspace/oh-my-claude';
const proxyScriptPath = 'C:/workspace/oh-my-claude/dist/proxy/server.js';
const bundledWezterm = 'C:/runtime/omc/apps/wezterm/windows-x64/wezterm.exe';
const bunPath = 'C:/runtime/bun/bin/bun.exe';
const launcherPath = 'C:/tmp/omc-proxy.cmd';

afterEach(() => {
	if (originalWeztermPane === undefined) {
		delete process.env.WEZTERM_PANE;
	} else {
		process.env.WEZTERM_PANE = originalWeztermPane;
	}
});

test('launchInWezterm uses cli spawn only when already inside a WezTerm pane', () => {
	delete process.env.WEZTERM_PANE;
	let spawnSyncCalls = 0;
	let spawnCalls = 0;

	const result = launchInWezterm(
		'http://localhost:61728/s/session-1234',
		61729,
		' --enable-auto-mode',
		true,
		workspaceDir,
		undefined,
		{
			resolveWeztermBinaryImpl: () => bundledWezterm,
			isWezTermMuxAvailableImpl: () => true,
			spawnSyncImpl: () => {
				spawnSyncCalls += 1;
				return { stdout: '23', status: 0 } as any;
			},
			spawnImpl: () => {
				spawnCalls += 1;
				return { unref() {} } as any;
			},
		},
	);

	expect(spawnSyncCalls).toBe(0);
	expect(spawnCalls).toBe(1);
	expect(result).toEqual({ launched: true });
});

test('launchInWezterm keeps using cli spawn inside an existing WezTerm pane', () => {
	process.env.WEZTERM_PANE = 'pane-1';
	let spawnSyncCalls = 0;
	let spawnCalls = 0;

	const result = launchInWezterm(
		'http://localhost:61728/s/session-1234',
		61729,
		' --enable-auto-mode',
		true,
		workspaceDir,
		undefined,
		{
			resolveWeztermBinaryImpl: () => bundledWezterm,
			isWezTermMuxAvailableImpl: () => true,
			spawnSyncImpl: () => {
				spawnSyncCalls += 1;
				return { stdout: '23', status: 0 } as any;
			},
			spawnImpl: () => {
				spawnCalls += 1;
				return { unref() {} } as any;
			},
		},
	);

	expect(spawnSyncCalls).toBe(1);
	expect(spawnCalls).toBe(0);
	expect(result).toEqual({ launched: true, paneId: '23' });
});

test('buildDebugCoordinatorScript creates a coordinator script with correct content', () => {
	const result = buildDebugCoordinatorScript({
		weztermPath: bundledWezterm,
		proxyLauncherPath: launcherPath,
		cwd: workspaceDir,
		baseUrl: 'http://localhost:61728/s/session-1234',
		controlPort: 61729,
		claudeArgsStr: ' --continue -a',
		port: 61728,
	});

	expect(result).toMatch(/coordinator-61728-61729\.cmd$/);
	const content = readFileSync(result, 'utf8');
	expect(content).toContain('@echo off');
	expect(content).toContain('cli split-pane --right --percent 35');
	expect(content).toContain(launcherPath);
	expect(content).toContain('timeout /t 2 /nobreak');
	expect(content).toContain('set ANTHROPIC_BASE_URL=http://localhost:61728/s/session-1234');
	expect(content).toContain('set OMC_PROXY_CONTROL_PORT=61729');
	expect(content).toContain('set OMC_DEBUG=1');
	expect(content).toContain('set CLAUDECODE=');
	expect(content).toContain('claude --continue -a');
});

test('spawnProxyInWeztermWindow launches wezterm with coordinator script', async () => {
	let capturedArgs: string[] | undefined;
	let spawnCalls = 0;

	const result = await spawnProxyInWeztermWindow(
		proxyScriptPath,
		61728,
		61729,
		workspaceDir,
		'session-1234',
		'http://localhost:61728/s/session-1234',
		' --enable-auto-mode',
		undefined,
		undefined,
		{
			resolveWeztermBinaryImpl: () => bundledWezterm,
			resolveBunPathImpl: () => bunPath,
			buildVisibleProxyLauncherImpl: () => launcherPath,
			spawnImpl: ((_cmd, args) => {
				spawnCalls += 1;
				capturedArgs = args as string[] | undefined;
				return { unref() {} } as any;
			}) as typeof import('node:child_process').spawn,
		},
	);

	expect(spawnCalls).toBe(1);
	expect(result).toEqual({ windowStarted: true });
	expect(capturedArgs).toContain('start');
	expect(capturedArgs).toContain('--workspace');
	expect(capturedArgs?.join(' ')).toContain('omc-debug-61728-61729');
	// Uses bun + JS coordinator (not cmd.exe)
	expect(capturedArgs).toContain(bunPath);
	expect(capturedArgs?.some(a => a.endsWith('.js'))).toBe(true);
});

test('spawnProxyInWeztermWindow spawns proxy directly inside WezTerm (no coordinator)', async () => {
	process.env.WEZTERM_PANE = 'pane-1';
	let capturedSpawnSyncArgs: string[] | undefined;
	let spawnCalls = 0;

	const result = await spawnProxyInWeztermWindow(
		proxyScriptPath,
		61728,
		61729,
		workspaceDir,
		'session-1234',
		'http://localhost:61728/s/session-1234',
		' --enable-auto-mode',
		undefined,
		undefined,
		{
			resolveWeztermBinaryImpl: () => bundledWezterm,
			resolveBunPathImpl: () => bunPath,
			buildVisibleProxyLauncherImpl: () => launcherPath,
			spawnSyncImpl: ((_cmd, args) => {
				capturedSpawnSyncArgs = args as string[];
				return { stdout: '42', status: 0 } as any;
			}) as typeof import('node:child_process').spawnSync,
			spawnImpl: ((_cmd, _args) => {
				spawnCalls += 1;
				return { unref() {} } as any;
			}) as typeof import('node:child_process').spawn,
		},
	);

	expect(spawnCalls).toBe(0);
	// Should use: wezterm cli spawn --cwd ... -- bun proxy.js --port ... --control-port ...
	expect(capturedSpawnSyncArgs).toContain('spawn');
	expect(capturedSpawnSyncArgs).toContain(bunPath);
	expect(capturedSpawnSyncArgs).toContain(proxyScriptPath);
	expect(capturedSpawnSyncArgs).toContain('--port');
	expect(capturedSpawnSyncArgs).toContain('61728');
	expect(capturedSpawnSyncArgs).toContain('--control-port');
	expect(capturedSpawnSyncArgs).toContain('61729');
	expect(result).toEqual({ windowStarted: true, paneId: '42' });
});

test('spawnProxyInWeztermWindow reports failure when wezterm cannot launch', async () => {
	const result = await spawnProxyInWeztermWindow(
		proxyScriptPath,
		61728,
		61729,
		workspaceDir,
		'session-1234',
		'http://localhost:61728/s/session-1234',
		' --enable-auto-mode',
		undefined,
		undefined,
		{
			resolveWeztermBinaryImpl: () => bundledWezterm,
			resolveBunPathImpl: () => bunPath,
			buildVisibleProxyLauncherImpl: () => launcherPath,
			spawnImpl: (() => {
				throw new Error('spawn failed');
			}) as typeof import('node:child_process').spawn,
		},
	);

	expect(result).toEqual({ windowStarted: false });
});

test('splitProxyIntoWeztermPane launches the proxy in a right-side pane using the resolved Bun path', () => {
	let capturedArgs: string[] | undefined;

	const result = splitProxyIntoWeztermPane(
		'wezterm',
		'host-1',
		proxyScriptPath,
		61728,
		61729,
		workspaceDir,
		undefined,
		undefined,
		{
			resolveWeztermBinaryImpl: () => bundledWezterm,
			resolveBunPathImpl: () => bunPath,
			buildVisibleProxyLauncherImpl: (
				proxyScript,
				port,
				controlPort,
				cwd,
				switchProvider,
				switchModel,
				resolveBunPathImpl,
			) => {
				expect(resolveBunPathImpl!()).toBe(bunPath);
				expect(proxyScript).toBe(proxyScriptPath);
				expect(port).toBe(61728);
				expect(controlPort).toBe(61729);
				expect(cwd).toBe(workspaceDir);
				expect(switchProvider).toBeUndefined();
				expect(switchModel).toBeUndefined();
				return launcherPath;
			},
			spawnSyncImpl: ((_cmd, args) => {
				capturedArgs = args as string[] | undefined;
				return { stdout: '29', status: 0 } as any;
			}) as typeof import('node:child_process').spawnSync,
		},
	);

	expect(result).toBe('29');
	expect(capturedArgs).toContain('split-pane');
	expect(capturedArgs).toContain('--right');
	expect(capturedArgs).toContain('--pane-id');
	expect(capturedArgs).toContain('host-1');
	expect(capturedArgs).toContain('call');
	expect(capturedArgs).toContain(launcherPath);
});

test('buildCCRunnerScript creates a JS file with env vars and claude launch', () => {
	const result = buildCCRunnerScript({
		baseUrl: 'http://localhost:61728/s/session-1234',
		controlPort: 61729,
		claudeArgsStr: ' --continue -a',
		cwd: workspaceDir,
	});

	expect(result).toMatch(/cc-runner-61729\.js$/);
	const content = readFileSync(result, 'utf8');
	expect(content).toContain('ANTHROPIC_BASE_URL');
	expect(content).toContain('http://localhost:61728/s/session-1234');
	expect(content).toContain('OMC_PROXY_CONTROL_PORT');
	expect(content).toContain('61729');
	expect(content).toContain('OMC_DEBUG');
	expect(content).toContain('CLAUDECODE');
	expect(content).toContain('"claude"');
	expect(content).toContain('"--continue"');
	expect(content).toContain('"-a"');
});

test('splitCCIntoDebugPane splits left 65% into proxy pane with bun CC runner', () => {
	const allCalls: string[][] = [];

	const result = splitCCIntoDebugPane(
		'42',
		'http://localhost:61728/s/session-1234',
		61729,
		' --continue -a',
		workspaceDir,
		{
			resolveWeztermBinaryImpl: () => bundledWezterm,
			resolveBunPathImpl: () => bunPath,
			spawnSyncImpl: ((_cmd, args) => {
				allCalls.push(args as string[]);
				return { stdout: '50', status: 0 } as any;
			}) as typeof import('node:child_process').spawnSync,
		},
	);

	expect(result).toBe('50');
	// First call: split-pane, second call: activate-pane
	expect(allCalls.length).toBe(2);
	const splitArgs = allCalls[0];
	expect(splitArgs).toContain('split-pane');
	expect(splitArgs).toContain('--left');
	expect(splitArgs).toContain('--percent');
	expect(splitArgs).toContain('65');
	expect(splitArgs).toContain('--pane-id');
	expect(splitArgs).toContain('42');
	expect(splitArgs).toContain(bunPath);
	expect(splitArgs?.some(a => a.endsWith('.js'))).toBe(true);
	// Second call: activate the CC pane
	expect(allCalls[1]).toContain('activate-pane');
	expect(allCalls[1]).toContain('50');
});
