/**
 * CLI installer for oh-my-claude
 *
 * Installs:
 * - Agent .md files to ~/.claude/agents/
 * - Slash commands to ~/.claude/commands/
 * - Hook scripts to ~/.claude/oh-my-claude/hooks/
 * - Scripts to ~/.claude/oh-my-claude/scripts/ (for auth login scripts)
 * - MCP server configuration to ~/.claude/settings.json
 * - Default configuration to ~/.claude/oh-my-claude.json
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveBunPath } from '../utils/bun';

// Re-export types
export type { InstallResult, InstallContext, UninstallResult } from './types';

// Re-export path utilities
export {
	getPackageRoot,
	getCommandsDir,
	getInstallDir,
	getHooksDir,
	getMcpServerPath,
	getConfigPath,
	getStatusLineScriptPath,
} from './paths';

// Import path utilities for internal use
import {
	getPackageRoot,
	getCommandsDir,
	getInstallDir,
	getHooksDir,
	getMcpServerPath,
	getStatusLineScriptPath,
	getConfigPath,
} from './paths';

// Import types for internal use
import type { InstallResult, UninstallResult, InstallContext } from './types';

// Import install step modules
import { installAgents } from './install-agents';
import { installCommands } from './install-commands';
import { installHooksStep } from './install-hooks';
import { installMcpStep } from './install-mcp';
import { installStatuslineStep } from './install-statusline';
import { installApps } from './install-apps';
import { installFinalize, cleanupCoworkerTestArtifacts } from './install-finalize';

// Imports for uninstall/check (kept in this file)
import {
	removeAgentFiles,
} from '../generators/agent-generator';
import {
	uninstallFromSettings,
	uninstallStatusLine,
} from './settings-merger';

/**
 * Install oh-my-claude
 */
export async function install(options?: {
	/** Skip agent file generation */
	skipAgents?: boolean;
	/** Skip commands installation */
	skipCommands?: boolean;
	/** Skip hooks installation */
	skipHooks?: boolean;
	/** Skip MCP server installation */
	skipMcp?: boolean;
	/** Skip statusline installation */
	skipStatusLine?: boolean;
	/** Force overwrite existing files */
	force?: boolean;
	/** Source directory (for built files) */
	sourceDir?: string;
}): Promise<InstallResult> {
	const result: InstallResult = {
		success: true,
		agents: { generated: [], skipped: [] },
		commands: { installed: [], skipped: [], removed: [] },
		hooks: { installed: [], updated: [], skipped: [] },
		mcp: { installed: false, updated: false },
		statusLine: {
			installed: false,
			wrapperCreated: false,
			updated: false,
			configCreated: false,
		},
		styles: { deployed: [], skipped: [] },
		config: { created: false },
		errors: [],
		warnings: [],
	};

	const installDir = getInstallDir();
	const sourceDir = options?.sourceDir ?? getPackageRoot(); // Use package root detection

	// Debug output
	const debug = process.env.DEBUG_INSTALL === '1';
	if (debug) {
		console.log(`[DEBUG] installDir: ${installDir}`);
		console.log(`[DEBUG] sourceDir: ${sourceDir}`);
		console.log(
			`[DEBUG] src/assets/commands exists: ${existsSync(join(sourceDir, 'src', 'assets', 'commands'))}`,
		);
		console.log(
			`[DEBUG] dist/hooks exists: ${existsSync(join(sourceDir, 'dist', 'hooks'))}`,
		);
		console.log(
			`[DEBUG] dist/mcp exists: ${existsSync(join(sourceDir, 'dist', 'mcp'))}`,
		);
		console.log(
			`[DEBUG] dist/statusline exists: ${existsSync(join(sourceDir, 'dist', 'statusline'))}`,
		);
	}

	const force = options?.force ?? false;
	const ctx: InstallContext = { installDir, sourceDir, debug, force, result };

	try {
		// Create installation directory
		if (!existsSync(installDir)) {
			mkdirSync(installDir, { recursive: true });
		}

		cleanupCoworkerTestArtifacts();

		try {
			resolveBunPath();
		} catch (error) {
			const message =
				error instanceof Error ? error.message.split('\n')[0] : 'Bun runtime not found.';
			result.warnings.push(
				`${message} Install Bun before using proxy-backed features like 'omc cc -debug' or the menubar build.`,
			);
		}

		if (!options?.skipAgents) await installAgents(ctx);
		if (!options?.skipCommands) await installCommands(ctx);
		if (!options?.skipHooks) await installHooksStep(ctx);
		if (!options?.skipMcp) await installMcpStep(ctx);
		if (!options?.skipStatusLine) await installStatuslineStep(ctx);
		await installApps(ctx);
		await installFinalize(ctx);

		result.success = result.errors.length === 0;
	} catch (error) {
		result.success = false;
		result.errors.push(`Installation failed: ${error}`);
	}

	return result;
}

/**
 * Uninstall oh-my-claude
 */
export async function uninstall(options?: {
	/** Keep configuration file */
	keepConfig?: boolean;
}): Promise<UninstallResult> {
	const result: UninstallResult = {
		success: true,
		agents: [],
		commands: [],
		hooks: [],
		mcp: false,
		statusLine: false,
		errors: [],
	};

	try {
		// 1. Remove agent files
		try {
			result.agents = removeAgentFiles();
		} catch (error) {
			result.errors.push(`Failed to remove agents: ${error}`);
		}

		// 2. Remove command files
		try {
			const commandsDir = getCommandsDir();
			if (existsSync(commandsDir)) {
				const ourCommands = [
					// Agent commands (omc-)
					'omc-sisyphus',
					'omc-oracle',
					'omc-librarian',
					'omc-reviewer',
					'omc-scout',
					'omc-explore',
					'omc-plan',
					'omc-start-work',
					'omc-status',
					'omc-switch',
					'omc-mem-compact',
					'omc-mem-clear',
					'omc-mem-summary',
					'omc-ulw',
					// Quick action commands (omcx-)
					'omcx-commit',
					'omcx-implement',
					'omcx-refactor',
					'omcx-docs',
					'omcx-issue',
				];
				const { unlinkSync } = require('node:fs');
				for (const cmd of ourCommands) {
					const cmdPath = join(commandsDir, `${cmd}.md`);
					if (existsSync(cmdPath)) {
						unlinkSync(cmdPath);
						result.commands.push(cmd);
					}
				}
			}
		} catch (error) {
			result.errors.push(`Failed to remove commands: ${error}`);
		}

		// 3. Remove from settings.json
		try {
			const { removedHooks, removedMcp } = uninstallFromSettings();
			result.hooks = removedHooks;
			result.mcp = removedMcp;
		} catch (error) {
			result.errors.push(`Failed to update settings: ${error}`);
		}

		// 4. Remove statusline
		try {
			result.statusLine = uninstallStatusLine();
		} catch (error) {
			result.errors.push(`Failed to remove statusline: ${error}`);
		}

		// 5. Remove installation directory
		const installDir = getInstallDir();
		if (existsSync(installDir)) {
			try {
				const { rmSync } = require('node:fs');
				rmSync(installDir, { recursive: true });
			} catch (error) {
				result.errors.push(
					`Failed to remove installation directory: ${error}`,
				);
			}
		}

		// 6. Remove config (unless keepConfig)
		if (!options?.keepConfig) {
			const configPath = getConfigPath();
			if (existsSync(configPath)) {
				try {
					const { unlinkSync } = require('node:fs');
					unlinkSync(configPath);
				} catch (error) {
					result.errors.push(`Failed to remove config: ${error}`);
				}
			}
		}

		result.success = result.errors.length === 0;
	} catch (error) {
		result.success = false;
		result.errors.push(`Uninstallation failed: ${error}`);
	}

	return result;
}

/**
 * Check installation status
 */
export function checkInstallation(): {
	installed: boolean;
	components: {
		agents: boolean;
		hooks: boolean;
		mcp: boolean;
		statusLine: boolean;
		config: boolean;
	};
} {
	const installDir = getInstallDir();
	const hooksDir = getHooksDir();
	const mcpServerPath = getMcpServerPath();
	const statusLineScriptPath = getStatusLineScriptPath();
	const configPath = getConfigPath();

	// Check if statusline is configured in settings
	const { isStatusLineConfigured } = require('./statusline-merger');

	return {
		installed:
			existsSync(installDir) &&
			existsSync(hooksDir) &&
			existsSync(mcpServerPath),
		components: {
			agents: existsSync(
				join(homedir(), '.claude', 'agents', 'sisyphus.md'),
			),
			hooks: existsSync(join(hooksDir, 'comment-checker.js')),
			mcp: existsSync(mcpServerPath),
			statusLine:
				existsSync(statusLineScriptPath) && isStatusLineConfigured(),
			config: existsSync(configPath),
		},
	};
}
