/**
 * Output styles, memory dirs, package.json, beta marker, config,
 * and coworker test artifact cleanup
 */

import {
	existsSync,
	writeFileSync,
	copyFileSync,
	readFileSync,
	rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { InstallContext } from './types';
import { getConfigPath } from './paths';
import { DEFAULT_CONFIG } from '../../shared/config/schema';
import { deployBuiltInStyles } from '../../assets/styles';
import { ensureMemoryDirs } from '../../memory';

export function cleanupCoworkerTestArtifacts(): void {
	const baseDir = join(homedir(), '.claude', 'oh-my-claude');
	const fixturePrefixes = [
		'ses_test_',
		'ses_env_',
		'ses_approve_',
		'ses_perm_',
	];
	for (const target of ['opencode']) {
		const logPath = join(baseDir, 'logs', 'coworker', `${target}.jsonl`);
		if (existsSync(logPath)) {
			try {
				const cleaned = readFileSync(logPath, 'utf8')
					.split('\n')
					.filter((line) => line.trim().length > 0)
					.filter((line) => {
						try {
							const entry = JSON.parse(line) as {
								sessionId?: string;
							};
							if (
								fixturePrefixes.some((prefix) =>
									entry.sessionId?.startsWith(prefix),
								)
							) {
								return false;
							}
							return true;
						} catch {
							return true;
						}
					})
					.join('\n');
				writeFileSync(
					logPath,
					cleaned.length > 0 ? `${cleaned}\n` : '',
					'utf8',
				);
			} catch {
				/* best-effort */
			}
		}

		const statusPath = join(baseDir, 'run', `${target}-status.json`);
		if (existsSync(statusPath)) {
			try {
				const status = JSON.parse(readFileSync(statusPath, 'utf8')) as {
					sessionId?: string;
				};
				if (
					fixturePrefixes.some((prefix) =>
						status.sessionId?.startsWith(prefix),
					)
				) {
					rmSync(statusPath, { force: true });
				}
			} catch {
				/* best-effort */
			}
		}
	}
}

export async function installFinalize(ctx: InstallContext): Promise<void> {
	// 5. Deploy output style presets
	try {
		ctx.result.styles = deployBuiltInStyles(ctx.sourceDir);
	} catch (error) {
		ctx.result.errors.push(`Failed to deploy output styles: ${error}`);
	}

	// 5b. Create memory directories
	try {
		ensureMemoryDirs();
	} catch (error) {
		ctx.result.errors.push(`Failed to create memory directories: ${error}`);
	}

	// 6. Copy package.json for version detection
	try {
		const srcPkgPath = join(ctx.sourceDir, 'package.json');
		const destPkgPath = join(ctx.installDir, 'package.json');
		if (existsSync(srcPkgPath)) {
			copyFileSync(srcPkgPath, destPkgPath);
		}
	} catch (error) {
		// Non-critical error, just log
		if (ctx.debug)
			console.log(`[DEBUG] Failed to copy package.json: ${error}`);
	}

	// 6b. Check if installing from git dev branch and create beta marker
	try {
		const gitDir = join(ctx.sourceDir, '.git');
		if (existsSync(gitDir)) {
			// Get current branch
			const branch = execSync('git rev-parse --abbrev-ref HEAD', {
				cwd: ctx.sourceDir,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe'],
			}).trim();

			// If on dev branch, create beta channel marker
			if (branch === 'dev') {
				const ref = execSync('git rev-parse --short HEAD', {
					cwd: ctx.sourceDir,
					encoding: 'utf-8',
					stdio: ['pipe', 'pipe', 'pipe'],
				}).trim();

				const { setBetaChannelInfo } = require('./beta-channel');
				setBetaChannelInfo({
					ref,
					branch: 'dev',
					installedAt: new Date().toISOString(),
				});
				// Clear stale update check cache
				try {
					const { clearCache } = require('../utils/update-check');
					clearCache();
				} catch { /* non-critical */ }
				if (ctx.debug)
					console.log(
						`[DEBUG] Created beta channel marker: dev @ ${ref}`,
					);
			} else {
				// Not on dev branch, clear any existing beta marker
				const { clearBetaChannel } = require('./beta-channel');
				clearBetaChannel();
			}
		}
	} catch (error) {
		// Not in a git repo or git not available, ignore
		if (ctx.debug) console.log(`[DEBUG] Git check failed: ${error}`);
	}

	// 7. Create default config if not exists
	const configPath = getConfigPath();
	if (!existsSync(configPath) || ctx.force) {
		try {
			writeFileSync(
				configPath,
				JSON.stringify(DEFAULT_CONFIG, null, 2),
				'utf-8',
			);
			ctx.result.config.created = true;
		} catch (error) {
			ctx.result.errors.push(`Failed to create config: ${error}`);
		}
	}
}
