import { afterEach, expect, test } from 'bun:test';

import { expandShortcuts } from '../../src/cli/commands/session/cc-shortcuts';
import {
	launchDetachedDebugProxy,
	launchDetachedSession,
	type WindowsDebugLaunchResult,
} from '../../src/cli/commands/session/cc-session-win';

const originalWeztermPane = process.env.WEZTERM_PANE;
const workspaceDir = 'C:/workspace/oh-my-claude';
const proxyScriptPath = 'C:/workspace/oh-my-claude/.test-fixtures/proxy/server.js';

function buildDebugOptions() {
	return {
		terminal: 'wezterm' as const,
		proxyScript: proxyScriptPath,
		ports: { port: 61728, controlPort: 61729 },
		cwd: workspaceDir,
		sessionId: 'session-1234',
		baseUrl: 'http://localhost:61728/s/session-1234',
		claudeArgsStr: ' --enable-auto-mode',
	};
}

function buildSessionOptions(debug = true) {
	return {
		sessionId: 'session-1234',
		ports: { port: 61728, controlPort: 61729 },
		terminal: 'wezterm' as const,
		claudeArgs: ['--enable-auto-mode'],
		debug,
	};
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
	const logs: string[] = [];
	const originalLog = console.log;
	console.log = (...args: unknown[]) => {
		logs.push(args.map((arg) => String(arg)).join(' '));
	};

	try {
		await fn();
		return logs;
	} finally {
		console.log = originalLog;
	}
}

afterEach(() => {
	if (originalWeztermPane === undefined) {
		delete process.env.WEZTERM_PANE;
	} else {
		process.env.WEZTERM_PANE = originalWeztermPane;
	}
});

test('expandShortcuts treats -debug as debug mode without changing the user entrypoint contract', () => {
	const result = expandShortcuts(['-debug', '-a']);

	expect(result.debugMode).toBe(true);
	expect(result.args).toEqual(['--enable-auto-mode']);
});

test('launchDetachedDebugProxy reports pane presentation when coordinator spawns inside WezTerm', async () => {
	const healthChecks: Array<[number, number | undefined, number | undefined]> = [];

	const result = await launchDetachedDebugProxy(buildDebugOptions(), {
		spawnProxyInWeztermWindow: async () => ({
			windowStarted: true,
			paneId: '42',
		}),
		waitForHealth: async (controlPort, attempts, delayMs) => {
			healthChecks.push([controlPort, attempts, delayMs]);
			return { healthy: true } as any;
		},
		resolveListeningPid: async () => 61728,
	});

	expect(healthChecks).toEqual([[61729, 50, 200]]);
	expect(result).toEqual<WindowsDebugLaunchResult>({
		presentation: 'pane',
		paneId: '42',
		proxyPid: 61728,
		notices: [
			{
				level: 'ok',
				message: 'Proxy running in debug pane (PID: 61728)',
			},
		],
	});
});

test('launchDetachedDebugProxy reports window presentation when no paneId returned', async () => {
	const result = await launchDetachedDebugProxy(buildDebugOptions(), {
		spawnProxyInWeztermWindow: async () => ({
			windowStarted: true,
		}),
		waitForHealth: async () => ({ healthy: true }) as any,
		resolveListeningPid: async () => 61728,
	});

	expect(result.presentation).toBe('window');
	expect(result.paneId).toBeUndefined();
	expect(result.proxyPid).toBe(61728);
	expect(result.notices.map((n) => n.message)).toEqual([
		'Proxy running in debug window (PID: 61728)',
	]);
});

test('launchDetachedDebugProxy fails when the bundled WezTerm window cannot start', async () => {
	await expect(
		launchDetachedDebugProxy(buildDebugOptions(), {
			spawnProxyInWeztermWindow: async () => ({ windowStarted: false }),
		}),
	).rejects.toThrow('Failed to start bundled WezTerm window.');
});

test('launchDetachedDebugProxy fails when proxy does not become healthy', async () => {
	await expect(
		launchDetachedDebugProxy(buildDebugOptions(), {
			spawnProxyInWeztermWindow: async () => ({ windowStarted: true }),
			waitForHealth: async () => ({ healthy: false }) as any,
		}),
	).rejects.toThrow('Proxy failed to become healthy within 10s.');
});

test('launchDetachedDebugProxy surfaces Bun resolution failures before opening a WezTerm window', async () => {
	await expect(
		launchDetachedDebugProxy(buildDebugOptions(), {
			spawnProxyInWeztermWindow: async () => {
				throw new Error('Bun runtime not found.');
			},
		}),
	).rejects.toThrow('Bun runtime not found.');
});

test('launchDetachedDebugProxy fails when PID cannot be resolved after health check', async () => {
	await expect(
		launchDetachedDebugProxy(buildDebugOptions(), {
			spawnProxyInWeztermWindow: async () => ({ windowStarted: true }),
			waitForHealth: async () => ({ healthy: true }) as any,
			resolveListeningPid: async () => undefined,
		}),
	).rejects.toThrow('Failed to resolve proxy PID.');
});

test('launchDetachedSession splits CC into proxy pane and reports right pane debug visibility', async () => {
	process.env.WEZTERM_PANE = 'pane-1';
	let launchInWeztermCalls = 0;
	let splitCCCalls: string[] = [];

	const logs = await captureLogs(async () => {
		await launchDetachedSession(buildSessionOptions(), {
			launchDetachedDebugProxy: async () => ({
				presentation: 'pane',
				paneId: '18',
				proxyPid: 61728,
				notices: [],
			}),
			splitCCIntoDebugPane: (proxyPaneId) => {
				splitCCCalls.push(proxyPaneId);
				return '20';
			},
			launchInWezterm: () => {
				launchInWeztermCalls += 1;
				return { launched: true, paneId: 'unexpected' };
			},
			registerProxySession: () => {},
			killProcess: () => {},
			spawnDetachedProxy: async () => {
				throw new Error('should not be called');
			},
			exit: ((code: number) => {
				throw new Error(`EXIT:${code}`);
			}) as (code: number) => never,
		});
	});

	expect(launchInWeztermCalls).toBe(0);
	expect(splitCCCalls).toEqual(['18']);
	expect(logs.some((line) => line.includes('Debug: proxy visible in right pane'))).toBe(true);
});

test('launchDetachedSession reports window debug visibility for outside WezTerm launches', async () => {
	delete process.env.WEZTERM_PANE;
	let launchInWeztermCalls = 0;

	const logs = await captureLogs(async () => {
		await launchDetachedSession(buildSessionOptions(), {
			launchDetachedDebugProxy: async () => ({
				presentation: 'window',
				proxyPid: 61728,
				notices: [],
			}),
			splitCCIntoDebugPane: () => {
				throw new Error('should not be called for window presentation');
			},
			launchInWezterm: () => {
				launchInWeztermCalls += 1;
				return { launched: true, paneId: 'unexpected' };
			},
			registerProxySession: () => {},
			killProcess: () => {},
			spawnDetachedProxy: async () => {
				throw new Error('should not be called');
			},
			exit: ((code: number) => {
				throw new Error(`EXIT:${code}`);
			}) as (code: number) => never,
		});
	});

	expect(launchInWeztermCalls).toBe(0);
	expect(logs.some((line) => line.includes('Debug: proxy visible in WezTerm window'))).toBe(true);
	expect(
		logs.some((line) => line.includes('Debug: proxy visible in right pane')),
	).toBe(false);
});

test('launchDetachedSession exits without claiming pane visibility when bundled WezTerm pane startup fails', async () => {
	delete process.env.WEZTERM_PANE;

	const logs = await captureLogs(async () => {
		await expect(
			launchDetachedSession(buildSessionOptions(), {
				launchDetachedDebugProxy: async () => {
					throw new Error(
						'Proxy failed to become healthy within 10s.',
					);
				},
				splitCCIntoDebugPane: () => undefined,
				launchInWezterm: () => ({ launched: true, paneId: '19' }),
				registerProxySession: () => {},
				killProcess: () => {},
				spawnDetachedProxy: async () => {
					throw new Error('should not be called');
				},
				exit: ((code: number) => {
					throw new Error(`EXIT:${code}`);
				}) as (code: number) => never,
			}),
		).rejects.toThrow('EXIT:1');
	});

	expect(
		logs.some((line) =>
			line.includes(
				'Proxy failed to become healthy within 10s.',
			),
		),
	).toBe(true);
	expect(logs.some((line) => line.includes('Debug: proxy visible in right pane'))).toBe(false);
});

test('launchDetachedSession exits when non-debug Claude Code launch fails', async () => {
	delete process.env.WEZTERM_PANE;
	const killed: Array<number | undefined> = [];

	const logs = await captureLogs(async () => {
		await expect(
			launchDetachedSession(buildSessionOptions(false), {
				launchInWezterm: () => ({ launched: false }),
				splitCCIntoDebugPane: () => undefined,
				registerProxySession: () => {},
				killProcess: (pid) => {
					killed.push(pid);
				},
				spawnDetachedProxy: async () => ({
					pid: 61728,
					healthy: true,
				}),
				launchDetachedDebugProxy: async () => {
					throw new Error('should not be called');
				},
				exit: ((code: number) => {
					throw new Error(`EXIT:${code}`);
				}) as (code: number) => never,
			}),
		).rejects.toThrow('EXIT:1');
	});

	expect(killed.length).toBeGreaterThanOrEqual(1);
	expect(killed.every((pid) => pid === 61728)).toBe(true);
	expect(logs.some((line) => line.includes('Failed to launch Claude Code in WezTerm window.'))).toBe(true);
	expect(logs.some((line) => line.includes('Session:'))).toBe(false);
});
