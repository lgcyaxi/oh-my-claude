/**
 * Agent generation + stale cleanup
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { InstallContext } from './types';
import {
	generateAllAgentFiles,
} from '../generators/agent-generator';

export async function installAgents(ctx: InstallContext): Promise<void> {
	try {
		ctx.result.agents = generateAllAgentFiles();

		// Clean up stale agent files from previous versions
		const agentsDir = join(homedir(), '.claude', 'agents');
		const staleAgents = [
			'frontend-ui-ux.md', // replaced by ui-designer in v2.0
			'codex-cli.md', // removed in v2.2.3 — replaced by official openai/codex-plugin-cc
			'codex-rescue.md', // removed in v2.2.3 — replaced by official openai/codex-plugin-cc
		];
		for (const stale of staleAgents) {
			const stalePath = join(agentsDir, stale);
			if (existsSync(stalePath)) {
				try {
					unlinkSync(stalePath);
				} catch {
					/* best-effort */
				}
			}
		}
	} catch (error) {
		ctx.result.errors.push(`Failed to generate agents: ${error}`);
	}
}
