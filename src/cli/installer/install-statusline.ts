/**
 * Statusline copy + settings + validation
 */

import {
	existsSync,
	mkdirSync,
	cpSync,
} from 'node:fs';
import { join } from 'node:path';
import type { InstallContext } from './types';
import { getStatusLineScriptPath } from './paths';
import { installStatusLine } from './settings-merger';
import { ensureConfigExists as ensureStatusLineConfigExists } from '../../statusline/config';

export async function installStatuslineStep(ctx: InstallContext): Promise<void> {
	try {
		const statusLineDir = join(ctx.installDir, 'dist', 'statusline');
		if (!existsSync(statusLineDir)) {
			mkdirSync(statusLineDir, { recursive: true });
		}

		// Copy statusline script (assuming it's built to dist/statusline/)
		const builtStatusLineDir = join(
			ctx.sourceDir,
			'dist',
			'statusline',
		);
		if (existsSync(builtStatusLineDir)) {
			cpSync(builtStatusLineDir, statusLineDir, {
				recursive: true,
			});
		}

		// Install statusline into settings.json
		const statusLineResult = installStatusLine(
			getStatusLineScriptPath(),
			ctx.force,
		);
		ctx.result.statusLine.installed = statusLineResult.installed;
		ctx.result.statusLine.wrapperCreated =
			statusLineResult.wrapperCreated;
		ctx.result.statusLine.updated = statusLineResult.updated;

		// Create default statusline segment config (full preset for maximum visibility)
		// This now returns a boolean indicating success
		ctx.result.statusLine.configCreated =
			ensureStatusLineConfigExists('full');
		if (!ctx.result.statusLine.configCreated) {
			ctx.result.warnings.push(
				'Failed to create statusline config file. Statusline may not work correctly.',
			);
		}

		// Validate statusline setup
		const {
			validateStatusLineSetup,
		} = require('./statusline-merger');
		const validation = validateStatusLineSetup();
		ctx.result.statusLine.validation = {
			valid: validation.valid,
			errors: validation.errors,
			warnings: validation.warnings,
		};

		// Add validation errors/warnings to main result
		if (!validation.valid) {
			for (const err of validation.errors) {
				ctx.result.warnings.push(`[statusline] ${err}`);
			}
		}
		for (const warn of validation.warnings) {
			ctx.result.warnings.push(`[statusline] ${warn}`);
		}

		if (ctx.debug && !validation.valid) {
			console.log(`[DEBUG] Statusline validation failed:`);
			console.log(
				`[DEBUG]   Script exists: ${validation.details.scriptExists}`,
			);
			console.log(
				`[DEBUG]   Node path valid: ${validation.details.nodePathValid}`,
			);
			console.log(
				`[DEBUG]   Settings configured: ${validation.details.settingsConfigured}`,
			);
			console.log(
				`[DEBUG]   Command works: ${validation.details.commandWorks}`,
			);
		}
	} catch (error) {
		ctx.result.errors.push(`Failed to install statusline: ${error}`);
	}
}
