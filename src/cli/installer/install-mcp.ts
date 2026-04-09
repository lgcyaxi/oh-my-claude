/**
 * MCP server installation
 */

import {
	existsSync,
	mkdirSync,
	writeFileSync,
	cpSync,
	statSync,
} from 'node:fs';
import { join } from 'node:path';
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
}
