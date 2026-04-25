/**
 * Hook configuration loader.
 * Uses only Node.js built-ins — no heavy deps.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_SESSION_LOG_THRESHOLD_KB = 40;

export interface AutoRotateConfig {
	enabled: boolean;
	graceDays: number;
	thresholdFiles: number;
	maxDatesPerRun: number;
	useLLMWhenAvailable: boolean;
}

export interface HookConfig {
	threshold: number;
	autoRotate: AutoRotateConfig;
}

const DEFAULT_AUTO_ROTATE: AutoRotateConfig = {
	enabled: true,
	graceDays: 1,
	thresholdFiles: 3,
	maxDatesPerRun: 2,
	useLLMWhenAvailable: true,
};

function coerceAutoRotate(raw: unknown): AutoRotateConfig {
	if (!raw || typeof raw !== 'object') return { ...DEFAULT_AUTO_ROTATE };
	const r = raw as Record<string, unknown>;
	const pickNum = (key: keyof AutoRotateConfig, fallback: number): number => {
		const v = r[key as string];
		return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
	};
	const pickBool = (key: keyof AutoRotateConfig, fallback: boolean): boolean => {
		const v = r[key as string];
		return typeof v === 'boolean' ? v : fallback;
	};
	return {
		enabled: pickBool('enabled', DEFAULT_AUTO_ROTATE.enabled),
		graceDays: pickNum('graceDays', DEFAULT_AUTO_ROTATE.graceDays),
		thresholdFiles: pickNum('thresholdFiles', DEFAULT_AUTO_ROTATE.thresholdFiles),
		maxDatesPerRun: pickNum('maxDatesPerRun', DEFAULT_AUTO_ROTATE.maxDatesPerRun),
		useLLMWhenAvailable: pickBool(
			'useLLMWhenAvailable',
			DEFAULT_AUTO_ROTATE.useLLMWhenAvailable,
		),
	};
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
				autoRotate: coerceAutoRotate(config.memory?.autoRotate),
			};
		}
	} catch {
		// Ignore config errors
	}
	return {
		threshold: DEFAULT_SESSION_LOG_THRESHOLD_KB,
		autoRotate: { ...DEFAULT_AUTO_ROTATE },
	};
}
