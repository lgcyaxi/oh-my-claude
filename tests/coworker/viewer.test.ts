import { afterEach, describe, expect, test } from 'bun:test';

import {
	spawnCoworkerViewer,
	NOOP_VIEWER_HANDLE,
	resolveNativeBash,
	_resetNativeBashCache,
} from '../../src/coworker/viewer';

const originalCodexNoViewer = process.env.CODEX_NO_VIEWER;
const originalTmux = process.env.TMUX;
afterEach(() => {
	if (originalCodexNoViewer === undefined) {
		delete process.env.CODEX_NO_VIEWER;
	} else {
		process.env.CODEX_NO_VIEWER = originalCodexNoViewer;
	}
	if (originalTmux === undefined) {
		delete process.env.TMUX;
	} else {
		process.env.TMUX = originalTmux;
	}
	_resetNativeBashCache();
});

test('viewer honors the no-viewer env kill switch', () => {
	process.env.CODEX_NO_VIEWER = '1';

	const result = spawnCoworkerViewer({
		command: 'omc m codex log',
		noViewerEnv: 'CODEX_NO_VIEWER',
	});

	expect(result.attached).toBe(false);
});

test('NOOP_VIEWER_HANDLE has attached=false and a no-op close', () => {
	expect(NOOP_VIEWER_HANDLE.attached).toBe(false);
	expect(() => NOOP_VIEWER_HANDLE.close()).not.toThrow();
});

test('viewer returns NOOP when no terminal multiplexer is available on Windows', () => {
	delete process.env.TMUX;

	// On win32 without TMUX, there's no viewer path
	// (macOS Terminal and xterm paths won't trigger on Windows)
	if (process.platform === 'win32') {
		const result = spawnCoworkerViewer({
			command: 'omc m codex log',
			noViewerEnv: 'CODEX_NO_VIEWER',
		});
		expect(result.attached).toBe(false);
	}
});

describe('resolveNativeBash', () => {
	test('returns cached result on second call', () => {
		const first = resolveNativeBash();
		const second = resolveNativeBash();
		expect(second).toBe(first);
	});

	test('returns "bash" on non-Windows platforms', () => {
		if (process.platform !== 'win32') {
			expect(resolveNativeBash()).toBe('bash');
		}
	});

	test('finds Git Bash on Windows when present', () => {
		if (process.platform !== 'win32') return;
		const result = resolveNativeBash();
		// On a Windows dev machine with Git installed, this should find bash
		if (result) {
			expect(result).toMatch(/bash\.exe$/i);
		}
	});

	test('cache resets properly', () => {
		resolveNativeBash(); // populate cache
		_resetNativeBashCache();
		// After reset, calling again should still work (re-resolves)
		const result = resolveNativeBash();
		if (process.platform === 'win32') {
			// May or may not find bash, but should not throw
			expect(result === null || typeof result === 'string').toBe(true);
		} else {
			expect(result).toBe('bash');
		}
	});
});
