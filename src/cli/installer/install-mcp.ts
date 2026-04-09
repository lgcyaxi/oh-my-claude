/**
 * MCP server copy + Codex plugin
 */

import {
	existsSync,
	mkdirSync,
	writeFileSync,
	cpSync,
	readdirSync,
	statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { InstallContext } from './types';
import { getMcpServerPath } from './paths';
import { installMcpServer } from './settings-merger';

export async function installMcpStep(ctx: InstallContext): Promise<void> {
	try {
		const mcpDir = join(ctx.installDir, 'mcp');
		if (!existsSync(mcpDir)) {
			mkdirSync(mcpDir, { recursive: true });
		}

		// Copy MCP server (assuming it's built to dist/mcp/)
		const builtMcpDir = join(ctx.sourceDir, 'dist', 'mcp');
		const mcpServerPath = getMcpServerPath();

		// Track if this is a file update (binary changed on disk)
		let binaryUpdated = false;

		if (existsSync(builtMcpDir)) {
			// Check if the binary is being updated (different size or new)
			const builtServerPath = join(builtMcpDir, 'server.js');
			if (
				existsSync(builtServerPath) &&
				existsSync(mcpServerPath)
			) {
				const builtSize = statSync(builtServerPath).size;
				const installedSize = statSync(mcpServerPath).size;
				binaryUpdated = builtSize !== installedSize;
			} else if (existsSync(builtServerPath)) {
				binaryUpdated = true; // First install
			}

			cpSync(builtMcpDir, mcpDir, { recursive: true });
		} else {
			// If not built, write placeholder
			writeFileSync(
				mcpServerPath,
				`#!/usr/bin/env node
// oh-my-claude MCP server placeholder
// Run 'npm run build:mcp' in oh-my-claude to generate full implementation
console.error("oh-my-claude MCP server not built. Run 'npm run build:mcp' first.");
process.exit(1);
`,
				{ mode: 0o755 },
			);
		}

		// Install MCP server into settings.json
		const mcpResult = installMcpServer(
			mcpServerPath,
			ctx.force,
		);
		ctx.result.mcp.installed = mcpResult ?? false;
		// Track if it was an update (binary changed or force reinstall)
		ctx.result.mcp.updated =
			binaryUpdated ||
			(mcpResult && ctx.force ? true : false);

		// Warn user if binary was updated but MCP server is likely still running old code
		if (binaryUpdated && !ctx.force) {
			ctx.result.warnings.push(
				'MCP server binary updated. Restart Claude Code to load new features.',
			);
		}
	} catch (error) {
		ctx.result.errors.push(`Failed to install MCP server: ${error}`);
	}

	// Install official Codex plugin and enable review gate (non-blocking)
	try {
		execSync('claude plugins add openai/codex-plugin-cc', {
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: 30_000,
		});
		// Enable review gate by default — Codex audits code before stop
		try {
			const codexPluginDir = join(
				homedir(), '.claude', 'plugins', 'cache', 'openai-codex', 'codex',
			);
			if (existsSync(codexPluginDir)) {
				// Find the latest version directory (sort semver descending)
				const versions = readdirSync(codexPluginDir)
					.filter((v) => existsSync(join(codexPluginDir, v, 'scripts', 'codex-companion.mjs')))
					.sort((a, b) => {
						const pa = a.split('.').map(Number);
						const pb = b.split('.').map(Number);
						for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
							const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
							if (diff !== 0) return diff;
						}
						return 0;
					});
				if (versions.length > 0) {
					const script = join(codexPluginDir, versions[0]!, 'scripts', 'codex-companion.mjs');
					execSync(`node "${script}" setup --enable-review-gate`, {
						stdio: ['pipe', 'pipe', 'pipe'],
						timeout: 15_000,
					});
				}
			}
		} catch {
			// Review gate setup is best-effort
		}
	} catch {
		ctx.result.warnings.push(
			'Codex plugin not installed. Run: claude plugins add openai/codex-plugin-cc',
		);
	}
}
