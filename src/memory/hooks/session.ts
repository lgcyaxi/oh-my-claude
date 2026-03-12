/**
 * Session log operations for memory hooks.
 * Manages checkpoint state, session log read/write/clear, and prompt logging.
 * Uses only Node.js built-ins — no heavy deps.
 */

import {
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	statSync,
	appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { shortHash, getStateFile, getSessionLogPath } from './paths';

const STATE_DIR = join(homedir(), '.claude', 'oh-my-claude', 'state');

// ---- Checkpoint state ----

export interface ContextMemoryState {
	lastSaveTimestamp: string | null;
	lastSaveLogSizeKB: number | null;
	saveCount: number;
}

export function loadState(projectCwd?: string): ContextMemoryState {
	try {
		const stateFile = getStateFile(projectCwd);
		if (existsSync(stateFile)) {
			const raw = readFileSync(stateFile, 'utf-8');
			return JSON.parse(raw);
		}
	} catch {
		// Ignore
	}
	return { lastSaveTimestamp: null, lastSaveLogSizeKB: null, saveCount: 0 };
}

export function saveState(
	state: ContextMemoryState,
	projectCwd?: string,
): void {
	try {
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			getStateFile(projectCwd),
			JSON.stringify(state, null, 2),
			'utf-8',
		);
	} catch {
		// Ignore
	}
}

// ---- Session log operations ----

export function getSessionLogSizeKB(projectCwd?: string): number {
	try {
		const logPath = getSessionLogPath(projectCwd);
		if (!existsSync(logPath)) return 0;
		const stats = statSync(logPath);
		return Math.round(stats.size / 1024);
	} catch {
		return 0;
	}
}

export function readSessionLog(projectCwd?: string): string {
	try {
		const logPath = getSessionLogPath(projectCwd);
		if (!existsSync(logPath)) return '';
		const raw = readFileSync(logPath, 'utf-8').trim();
		if (!raw) return '';

		const lines = raw.split('\n').filter(Boolean);
		const observations: string[] = [];

		for (const line of lines) {
			try {
				const obs = JSON.parse(line) as {
					ts: string;
					tool: string;
					summary: string;
				};
				const time = obs.ts.slice(11, 19);
				observations.push(`  [${time}] ${obs.tool}: ${obs.summary}`);
			} catch {
				// Skip
			}
		}

		const joined = observations.join('\n');
		return joined.length > 8000 ? '...\n' + joined.slice(-8000) : joined;
	} catch {
		return '';
	}
}

export function clearSessionLog(projectCwd?: string): void {
	try {
		const logPath = getSessionLogPath(projectCwd);
		if (existsSync(logPath)) {
			writeFileSync(logPath, '', 'utf-8');
		}
	} catch {
		// Ignore
	}
}

// ---- Prompt logging ----

export function logUserPrompt(prompt: string, projectCwd?: string): void {
	if (!prompt || prompt.length < 5) return;
	try {
		const logDir = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'memory',
			'sessions',
		);
		if (!existsSync(logDir)) {
			mkdirSync(logDir, { recursive: true });
		}
		const suffix = projectCwd ? `-${shortHash(projectCwd)}` : '';
		const logPath = join(logDir, `active-session${suffix}.jsonl`);
		const truncated =
			prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt;
		const observation = {
			ts: new Date().toISOString(),
			tool: 'UserPrompt',
			summary: `user: ${truncated}`,
		};
		appendFileSync(logPath, JSON.stringify(observation) + '\n', 'utf-8');
	} catch {
		// Silently fail — never block
	}
}
