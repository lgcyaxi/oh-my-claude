/**
 * Slash command copy + deprecated cleanup
 */

import {
	existsSync,
	mkdirSync,
	copyFileSync,
	readdirSync,
	unlinkSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import type { InstallContext } from './types';
import { getCommandsDir } from './paths';

export async function installCommands(ctx: InstallContext): Promise<void> {
	try {
		const commandsDir = getCommandsDir();
		if (!existsSync(commandsDir)) {
			mkdirSync(commandsDir, { recursive: true });
		}

		// Copy command files from src/assets/commands/ (including subfolders)
		const srcCommandsDir = join(
			ctx.sourceDir,
			'src',
			'assets',
			'commands',
		);
		if (existsSync(srcCommandsDir)) {
			// Collect .md files from root and subfolders (orchestration/, memory/, runtime/, actions/)
			const collectMdFiles = (dir: string): string[] => {
				const files: string[] = [];
				for (const entry of readdirSync(dir, {
					withFileTypes: true,
				})) {
					if (entry.isDirectory()) {
						files.push(
							...collectMdFiles(join(dir, entry.name)),
						);
					} else if (entry.name.endsWith('.md')) {
						files.push(join(dir, entry.name));
					}
				}
				return files;
			};
			const commandFiles = collectMdFiles(srcCommandsDir);
			for (const srcPath of commandFiles) {
				const file = basename(srcPath);
				const destPath = join(commandsDir, file);
				const wasExisting = existsSync(destPath);
				// Always copy our command files (they're ours, we should update them)
				copyFileSync(srcPath, destPath);
				if (wasExisting) {
					ctx.result.commands.installed.push(
						`${file.replace('.md', '')} (updated)`,
					);
				} else {
					ctx.result.commands.installed.push(
						file.replace('.md', ''),
					);
				}
			}

			// Clean up deprecated/renamed command files
			const deprecatedCommands = [
				'omc-compact.md', // renamed → omc-mem-compact.md
				'omc-clear.md', // renamed → omc-mem-clear.md
				'omc-summary.md', // renamed → omc-mem-summary.md
				'ulw.md', // renamed → omc-ulw.md
				'omc-team.md', // removed — use native Agent Teams
				'omc-explore.md', // removed in v2.0 — use Explore subagent
				'omc-scout.md', // removed in v2.0 — use claude-scout subagent
				'omc-oracle.md', // removed in v2.0 — use oracle subagent via proxy
				'omc-librarian.md', // removed in v2.0 — use librarian subagent via proxy
				'omc-reviewer.md', // removed in v2.0 — use claude-reviewer subagent
				'omc-hephaestus.md', // removed in v2.0 — use hephaestus subagent via proxy
				'omc-navigator.md', // removed in v2.0 — use navigator subagent via proxy
				'omc-pend.md', // removed in v2.1.3 — superseded by wait_for_tasks and signal files
				'omc-up.md', // removed in v2.1.3-beta.37 — stale legacy runtime API
				'omc-down.md', // removed in v2.1.3-beta.37 — stale legacy runtime API
				'omc-status-bridge.md', // removed in v2.1.3-beta.37 — merged into /omc-status (legacy filename cleanup)
				'omc-codex.md', // removed in v2.2.3 — replaced by official openai/codex-plugin-cc
			];
			for (const deprecated of deprecatedCommands) {
				const oldPath = join(commandsDir, deprecated);
				if (existsSync(oldPath)) {
					try {
						unlinkSync(oldPath);
						ctx.result.commands.removed.push(
							deprecated.replace('.md', ''),
						);
					} catch {
						// Best-effort cleanup
					}
				}
			}
		} else {
			ctx.result.errors.push(
				`Commands source directory not found: ${srcCommandsDir}`,
			);
		}
	} catch (error) {
		ctx.result.errors.push(`Failed to install commands: ${error}`);
	}
}
