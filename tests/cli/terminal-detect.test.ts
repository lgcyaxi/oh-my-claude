import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	resolveWindowsWeztermBinary,
	resolveWeztermBundleFromDir,
} from '../../src/cli/utils/terminal-detect';

const windowsOnly = process.platform === 'win32' ? test : test.skip;
const originalWeztermExecutable = process.env.WEZTERM_EXECUTABLE;
let tempDir: string | null = null;

function makeBundle(root: string, complete = true) {
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, 'wezterm.exe'), '');
	writeFileSync(join(root, 'wezterm-gui.exe'), '');
	if (complete) {
		writeFileSync(join(root, 'wezterm-mux-server.exe'), '');
	}
}

afterEach(() => {
	if (originalWeztermExecutable === undefined) {
		delete process.env.WEZTERM_EXECUTABLE;
	} else {
		process.env.WEZTERM_EXECUTABLE = originalWeztermExecutable;
	}

	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = null;
	}
});

windowsOnly('resolveWindowsWeztermBinary prefers the active WezTerm session executable over bundled paths', () => {
	tempDir = mkdtempSync(join(tmpdir(), 'omc-wezterm-'));
	const guiExe = join(tempDir, 'wezterm-gui.exe');
	const cliExe = join(tempDir, 'wezterm.exe');
	writeFileSync(guiExe, '');
	writeFileSync(cliExe, '');
	process.env.WEZTERM_EXECUTABLE = guiExe;

	expect(
		resolveWindowsWeztermBinary('wezterm.exe', {
			currentExecutable: process.env.WEZTERM_EXECUTABLE,
			installedBundleDir: join(tempDir, 'installed'),
			currentPackageBundleDir: join(tempDir, 'packaged'),
			systemResolver: () => null,
		}),
	).toBe(cliExe);
	expect(
		resolveWindowsWeztermBinary('wezterm-gui.exe', {
			currentExecutable: process.env.WEZTERM_EXECUTABLE,
			installedBundleDir: join(tempDir, 'installed'),
			currentPackageBundleDir: join(tempDir, 'packaged'),
			systemResolver: () => null,
		}),
	).toBe(guiExe);
});

windowsOnly('resolveWindowsWeztermBinary prefers the installed bundled WezTerm when complete', () => {
	tempDir = mkdtempSync(join(tmpdir(), 'omc-wezterm-'));
	const installedDir = join(tempDir, 'installed');
	const packagedDir = join(tempDir, 'packaged');
	makeBundle(installedDir, true);
	makeBundle(packagedDir, true);
	delete process.env.WEZTERM_EXECUTABLE;

	expect(
		resolveWindowsWeztermBinary('wezterm.exe', {
			installedBundleDir: installedDir,
			currentPackageBundleDir: packagedDir,
			systemResolver: () => null,
		}),
	).toBe(join(installedDir, 'wezterm.exe'));
	expect(
		resolveWindowsWeztermBinary('wezterm-gui.exe', {
			installedBundleDir: installedDir,
			currentPackageBundleDir: packagedDir,
			systemResolver: () => null,
		}),
	).toBe(join(installedDir, 'wezterm-gui.exe'));
});

windowsOnly('resolveWindowsWeztermBinary falls back to the current package bundle when the installed bundle is incomplete', () => {
	tempDir = mkdtempSync(join(tmpdir(), 'omc-wezterm-'));
	const installedDir = join(tempDir, 'installed');
	const packagedDir = join(tempDir, 'packaged');
	makeBundle(installedDir, false);
	makeBundle(packagedDir, true);
	delete process.env.WEZTERM_EXECUTABLE;

	expect(resolveWeztermBundleFromDir(installedDir, 'wezterm.exe')).toBeNull();
	expect(
		resolveWindowsWeztermBinary('wezterm.exe', {
			installedBundleDir: installedDir,
			currentPackageBundleDir: packagedDir,
			systemResolver: () => null,
		}),
	).toBe(join(packagedDir, 'wezterm.exe'));
	expect(
		resolveWindowsWeztermBinary('wezterm-gui.exe', {
			installedBundleDir: installedDir,
			currentPackageBundleDir: packagedDir,
			systemResolver: () => null,
		}),
	).toBe(join(packagedDir, 'wezterm-gui.exe'));
});
