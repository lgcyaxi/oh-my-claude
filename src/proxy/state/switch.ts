/**
 * Proxy switch state management
 *
 * Reads/writes proxy-switch.json signal file used for IPC
 * between the MCP server (writer) and proxy server (reader).
 *
 * Path: ~/.claude/oh-my-claude/proxy-switch.json
 */

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ProxySwitchState } from './types';
import { DEFAULT_SWITCH_STATE } from './types';
import {
	atomicWriteJson,
	withFileLockSync,
} from '../../shared/fs/file-lock.js';

/** Path to the proxy switch state file */
export function getSwitchStatePath(): string {
	return join(homedir(), '.claude', 'oh-my-claude', 'proxy-switch.json');
}

function getSwitchStateLockPath(): string {
	return getSwitchStatePath() + '.lock';
}

/**
 * Read current switch state from disk
 * Returns default passthrough state if file doesn't exist or is invalid
 */
export function readSwitchState(): ProxySwitchState {
	const statePath = getSwitchStatePath();

	try {
		if (!existsSync(statePath)) {
			return { ...DEFAULT_SWITCH_STATE };
		}

		const content = readFileSync(statePath, 'utf-8');
		const parsed = JSON.parse(content) as ProxySwitchState;

		// Validate required fields
		if (typeof parsed.switched !== 'boolean') {
			return { ...DEFAULT_SWITCH_STATE };
		}

		return {
			switched: parsed.switched,
			provider: parsed.provider,
			model: parsed.model,
			switchedAt: parsed.switchedAt,
		};
	} catch {
		return { ...DEFAULT_SWITCH_STATE };
	}
}

/**
 * Write switch state to disk atomically.
 *
 * Runs under `withFileLockSync` so two concurrent `/switch` + `/revert`
 * control API calls can't race to write disjoint states. `atomicWriteJson`
 * handles the temp-file + rename dance. Readers remain lock-free because
 * rename is atomic.
 */
export function writeSwitchState(state: ProxySwitchState): void {
	const statePath = getSwitchStatePath();
	const dir = dirname(statePath);

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	withFileLockSync(getSwitchStateLockPath(), () => {
		atomicWriteJson(statePath, state, {
			indent: 2,
			trailingNewline: false,
		});
	});
}

/**
 * Reset switch state to passthrough mode
 */
export function resetSwitchState(): void {
	writeSwitchState({ ...DEFAULT_SWITCH_STATE });
}
