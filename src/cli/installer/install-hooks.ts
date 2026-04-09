/**
 * Hooks copy, scripts, node_modules
 */

import {
	existsSync,
	mkdirSync,
	writeFileSync,
	cpSync,
} from 'node:fs';
import { join } from 'node:path';
import type { InstallContext } from './types';
import { getHooksDir } from './paths';
import { installHooks } from './settings-merger';

export async function installHooksStep(ctx: InstallContext): Promise<void> {
	const hooksDir = getHooksDir();

	try {
		// Create hooks directory
		if (!existsSync(hooksDir)) {
			mkdirSync(hooksDir, { recursive: true });
		}

		// Copy hook scripts (assuming they're built to dist/hooks/)
		const builtHooksDir = join(ctx.sourceDir, 'dist', 'hooks');
		if (existsSync(builtHooksDir)) {
			cpSync(builtHooksDir, hooksDir, { recursive: true });
		} else {
			// If not built, write placeholder scripts
			writeFileSync(
				join(hooksDir, 'comment-checker.js'),
				`#!/usr/bin/env node
// oh-my-claude comment-checker hook
// Run 'npm run build' in oh-my-claude to generate full implementation
console.log(JSON.stringify({ decision: "approve" }));
`,
				{ mode: 0o755 },
			);

			writeFileSync(
				join(hooksDir, 'todo-continuation.js'),
				`#!/usr/bin/env node
// oh-my-claude todo-continuation hook
// Run 'npm run build' in oh-my-claude to generate full implementation
console.log(JSON.stringify({ decision: "approve" }));
`,
				{ mode: 0o755 },
			);
		}

		// Install hooks into settings.json
		ctx.result.hooks = installHooks(hooksDir, ctx.force);
	} catch (error) {
		ctx.result.errors.push(`Failed to install hooks: ${error}`);
	}

	// 3b. Install scripts (for auth login scripts, etc.)
	try {
		const scriptsDir = join(ctx.installDir, 'scripts');
		if (!existsSync(scriptsDir)) {
			mkdirSync(scriptsDir, { recursive: true });
		}

		// Copy scripts from source (directly from scripts/ since these are source files)
		const sourceScriptsDir = join(ctx.sourceDir, 'scripts');
		if (existsSync(sourceScriptsDir)) {
			cpSync(sourceScriptsDir, scriptsDir, { recursive: true });
		}
	} catch (error) {
		ctx.result.errors.push(`Failed to install scripts: ${error}`);
	}

	// 3c. Install node_modules (for playwright and other runtime deps)
	try {
		const sourceNodeModules = join(
			ctx.sourceDir,
			'node_modules',
			'playwright',
		);
		const targetNodeModules = join(
			ctx.installDir,
			'node_modules',
			'playwright',
		);

		if (existsSync(sourceNodeModules)) {
			if (!existsSync(join(ctx.installDir, 'node_modules'))) {
				mkdirSync(join(ctx.installDir, 'node_modules'), {
					recursive: true,
				});
			}
			cpSync(sourceNodeModules, targetNodeModules, {
				recursive: true,
			});
		}
	} catch (error) {
		ctx.result.errors.push(`Failed to install node_modules: ${error}`);
	}
}
