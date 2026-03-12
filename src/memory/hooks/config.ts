/**
 * Hook configuration loader.
 * Uses only Node.js built-ins — no heavy deps.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_SESSION_LOG_THRESHOLD_KB = 40;

export interface HookConfig {
	threshold: number;
}

export function loadHookConfig(): HookConfig {
	const configPath = join(homedir(), '.claude', 'oh-my-claude.json');
	try {
		if (existsSync(configPath)) {
			const raw = readFileSync(configPath, 'utf-8');
			const config = JSON.parse(raw);
			return {
				threshold:
					config.memory?.autoSaveThreshold === 0
						? 0
						: Math.round(
								(config.memory?.autoSaveThreshold ?? 75) * 1.33,
							),
			};
		}
	} catch {
		// Ignore config errors
	}
	return {
		threshold: DEFAULT_SESSION_LOG_THRESHOLD_KB,
	};
}
