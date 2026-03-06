/**
 * Codex segment — live Codex daemon activity status.
 *
 * Reads ~/.claude/oh-my-claude/run/codex-status.json (written by CodexAppServerDaemon).
 * Returns null (hidden) when:
 * - File does not exist (no daemon ever started)
 * - State is "idle"
 * - Signal is stale (> 30s for thinking/error, > 5s for complete)
 *
 * When active, renders on row 3 (Infrastructure):
 *   thinking  → [⟳ Codex]  (yellow)
 *   complete  → [✓ Codex]  (green)
 *   error     → [✗ Codex]  (red)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
	Segment,
	SegmentData,
	SegmentContext,
	SegmentConfig,
	StyleConfig,
} from './types';
import { wrapBrackets, applyColor } from './index';

const STATUS_SIGNAL_PATH = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'run',
	'codex-status.json',
);

interface CodexStatusSignal {
	state: 'idle' | 'thinking' | 'complete' | 'error';
	tool?: string;
	model?: string;
	updatedAt: number;
}

// How long a signal stays visible after it's written (ms)
const STALE_THRESHOLDS: Record<string, number> = {
	thinking: 30_000,
	complete: 5_000,
	error: 30_000,
	idle: 0,
};

function readStatusSignal(): CodexStatusSignal | null {
	try {
		const raw = readFileSync(STATUS_SIGNAL_PATH, 'utf-8');
		return JSON.parse(raw) as CodexStatusSignal;
	} catch {
		return null;
	}
}

async function collectCodexData(
	_context: SegmentContext,
): Promise<SegmentData | null> {
	const signal = readStatusSignal();
	if (!signal || signal.state === 'idle') {
		return null;
	}

	const age = Date.now() - (signal.updatedAt ?? 0);
	const threshold = STALE_THRESHOLDS[signal.state] ?? 30_000;
	if (age > threshold) {
		return null; // Signal too old — suppress
	}

	let icon: string;
	let color: SegmentData['color'];

	switch (signal.state) {
		case 'thinking':
			icon = '⟳';
			color = 'warning'; // yellow
			break;
		case 'complete':
			icon = '✓';
			color = 'good'; // green
			break;
		case 'error':
			icon = '✗';
			color = 'critical'; // red
			break;
		default:
			return null;
	}

	const label = signal.tool ? `Codex: ${signal.tool}` : 'Codex';
	const primary = `${icon} ${label}`;

	return {
		primary,
		metadata: {
			state: signal.state,
			model: signal.model ?? '',
		},
		color,
	};
}

function formatCodexSegment(
	data: SegmentData,
	_config: SegmentConfig,
	style: StyleConfig,
): string {
	const colored = applyColor(data.primary, data.color, style);
	return wrapBrackets(colored, style);
}

export const codexSegment: Segment = {
	id: 'codex',
	collect: collectCodexData,
	format: formatCodexSegment,
};
