import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	copyBuiltMenubarBinary,
	resolveMenubarAppPath,
} from '../../src/cli/commands/system/menubar';

let tempDir: string | null = null;

afterEach(() => {
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = null;
	}
});

test('copyBuiltMenubarBinary copies the Windows release binary into builds/windows-x64', () => {
	tempDir = mkdtempSync(join(tmpdir(), 'omc-menubar-'));
	const releaseDir = join(tempDir, 'src-tauri', 'target', 'release');
	mkdirSync(releaseDir, { recursive: true });
	const builtExe = join(releaseDir, 'omc-menubar.exe');
	writeFileSync(builtExe, 'binary');

	const copiedPath = copyBuiltMenubarBinary(tempDir!, 'win32', 'x64');

	expect(copiedPath).toBe(join(tempDir, 'builds', 'windows-x64', 'omc-menubar.exe'));
	expect(existsSync(copiedPath)).toBe(true);
});

test('copyBuiltMenubarBinary fails when the release binary does not exist', () => {
	tempDir = mkdtempSync(join(tmpdir(), 'omc-menubar-'));

	expect(() => copyBuiltMenubarBinary(tempDir!, 'win32', 'x64')).toThrow(
		'Built menubar binary not found:',
	);
});

test('resolveMenubarAppPath prefers the copied Windows binary over the release directory', () => {
	tempDir = mkdtempSync(join(tmpdir(), 'omc-menubar-'));
	const buildsExe = join(tempDir, 'builds', 'windows-x64', 'omc-menubar.exe');
	const releaseExe = join(
		tempDir,
		'src-tauri',
		'target',
		'release',
		'omc-menubar.exe',
	);
	mkdirSync(join(tempDir, 'builds', 'windows-x64'), { recursive: true });
	mkdirSync(join(tempDir, 'src-tauri', 'target', 'release'), { recursive: true });
	writeFileSync(buildsExe, 'copied');
	writeFileSync(releaseExe, 'release');

	expect(resolveMenubarAppPath(tempDir!, 'win32', 'x64')).toBe(buildsExe);
});
