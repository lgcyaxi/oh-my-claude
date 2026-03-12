import { afterEach, beforeEach, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	CodexCoworkerRuntime,
	OpenCodeCoworkerRuntime,
} from '../../src/coworker';

const originalFetch = globalThis.fetch;
const originalStateDir = process.env.OMC_COWORKER_STATE_DIR;
let testStateDir: string | null = null;

beforeEach(() => {
	testStateDir = mkdtempSync(join(tmpdir(), 'omc-coworker-timeout-'));
	process.env.OMC_COWORKER_STATE_DIR = testStateDir;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.env.OMC_COWORKER_STATE_DIR = originalStateDir;
	if (testStateDir) {
		rmSync(testStateDir, { recursive: true, force: true });
		testStateDir = null;
	}
});

class FakeCodexDaemon extends EventEmitter {
	interruptCalls = 0;

	getStatus(): 'running' {
		return 'running';
	}

	async start(): Promise<void> {}

	async queueRequest(): Promise<string> {
		return 'req-timeout';
	}

	getModel(): string {
		return 'gpt-5.4';
	}

	getSessionId(): string {
		return 'codex-session';
	}

	isViewerAvailable(): boolean {
		return false;
	}

	isViewerAttached(): boolean {
		return false;
	}

	ensureViewer(): boolean {
		return false;
	}

	async interruptActiveTurn(): Promise<boolean> {
		this.interruptCalls += 1;
		return true;
	}
}

test('codex timeout interrupts the active turn', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	const fakeDaemon = new FakeCodexDaemon();

	(runtime as any).daemon = fakeDaemon;

	await expect(
		runtime.runTask({
			message: 'timeout me',
			timeoutMs: 25,
		}),
	).rejects.toThrow(/timed out/i);

	expect(fakeDaemon.interruptCalls).toBe(1);
});

test('opencode timeout aborts the session request and drives TUI controls', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());

	const tui = {
		selectSessionCalls: 0,
		toasts: [] as string[],
		executeCalls: [] as string[],
	};

	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => {
			tui.selectSessionCalls += 1;
			return true;
		},
		showTuiToast: async (options: { message: string }) => {
			tui.toasts.push(options.message);
			return true;
		},
		executeTuiCommand: async (command: string) => {
			tui.executeCalls.push(command);
			return true;
		},
	};
	(runtime as any).ensureViewer = () => true;

	let abortCalls = 0;
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		const url = String(input);
		if (url.endsWith('/session') && init?.method === 'POST') {
			return new Response(JSON.stringify({ id: 'ses_test_123' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}

		if (url.endsWith('/agent')) {
			return new Response(
				JSON.stringify([{ name: 'build', mode: 'subagent', native: true }]),
				{
				status: 200,
				headers: { 'content-type': 'application/json' },
				},
			);
		}

		if (url.endsWith('/abort') && init?.method === 'POST') {
			abortCalls += 1;
			return new Response('true', { status: 200 });
		}

		if (url.endsWith('/message') && init?.method === 'POST') {
			return await new Promise<Response>((_, reject) => {
				const signal = init.signal;
				const onAbort = () =>
					reject(
						signal?.reason instanceof Error
							? signal.reason
							: new Error('aborted'),
					);

				if (signal?.aborted) {
					onAbort();
					return;
				}

				signal?.addEventListener('abort', onAbort, { once: true });
			});
		}

		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	await expect(
		runtime.runTask({
			message: 'timeout me',
			timeoutMs: 25,
		}),
	).rejects.toThrow(/timed out/i);

	expect(abortCalls).toBe(1);
	expect(tui.selectSessionCalls).toBeGreaterThan(0);
	expect(tui.executeCalls).toContain('session_interrupt');
	expect(tui.toasts.some((message) => message.includes('started'))).toBe(
		true,
	);
});

test('opencode prefers the native build agent over summary-style primary agents', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};

	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = String(input);
		if (url.endsWith('/agent')) {
			return new Response(
				JSON.stringify([
					{ name: 'compaction', mode: 'primary', native: true },
					{ name: 'build', mode: 'subagent', native: true },
					{ name: 'summary', mode: 'primary', native: true },
				]),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				},
			);
		}

		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	const execution = await (runtime as any).resolveExecutionConfig({
		message: 'choose agent',
	});
	expect(execution.agent).toBe('build');
});
