/**
 * Path utilities for the installer
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Get the package root directory
 * Works correctly whether running from source or bundled npm package
 */
export function getPackageRoot(): string {
	// Use import.meta.url to get the current file's URL
	// This works correctly in both ESM and bundled code
	const currentFile = fileURLToPath(import.meta.url);
	const currentDir = dirname(currentFile);

	// Debug: show where we're looking
	const debug = process.env.DEBUG_INSTALL === '1';
	if (debug) {
		console.log(`[DEBUG] import.meta.url: ${import.meta.url}`);
		console.log(`[DEBUG] currentFile: ${currentFile}`);
		console.log(`[DEBUG] currentDir: ${currentDir}`);
	}

	// When running from dist/cli.js, go up one level to package root
	// When running from src/installer/index.ts, go up two levels
	// Check which one contains package.json
	let root = dirname(currentDir); // Try one level up (dist -> root)
	if (debug)
		console.log(
			`[DEBUG] Trying root (1 up): ${root}, has package.json: ${existsSync(join(root, 'package.json'))}`,
		);

	if (!existsSync(join(root, 'package.json'))) {
		root = dirname(root); // Try two levels up (src/installer -> src -> root)
		if (debug)
			console.log(
				`[DEBUG] Trying root (2 up): ${root}, has package.json: ${existsSync(join(root, 'package.json'))}`,
			);
	}
	if (!existsSync(join(root, 'package.json'))) {
		root = dirname(root); // Try three levels up (for deeply nested)
		if (debug)
			console.log(
				`[DEBUG] Trying root (3 up): ${root}, has package.json: ${existsSync(join(root, 'package.json'))}`,
			);
	}

	if (debug) console.log(`[DEBUG] Final root: ${root}`);
	return root;
}

/**
 * Get commands directory
 */
export function getCommandsDir(): string {
	return join(homedir(), '.claude', 'commands');
}

/**
 * Get oh-my-claude installation directory
 */
export function getInstallDir(): string {
	return join(homedir(), '.claude', 'oh-my-claude');
}

/**
 * Get hooks directory
 */
export function getHooksDir(): string {
	return join(getInstallDir(), 'hooks');
}

/**
 * Get MCP server path
 */
export function getMcpServerPath(): string {
	return join(getInstallDir(), 'mcp', 'server.js');
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
	return join(homedir(), '.claude', 'oh-my-claude.json');
}

/**
 * Get statusline script path
 */
export function getStatusLineScriptPath(): string {
	return join(getInstallDir(), 'dist', 'statusline', 'statusline.js');
}
