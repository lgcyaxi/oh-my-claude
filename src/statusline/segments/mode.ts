/**
 * Mode segment - shows active session modes.
 *
 * Today this segment only renders ULW. Legacy runtime state is gone; this file
 * remains as the session-mode display hook.
 */

import type {
	Segment,
	SegmentData,
	SegmentContext,
	SegmentConfig,
	StyleConfig,
} from './types';
import { applyColor } from './index';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface ModeState {
	ulw: boolean;
}

/**
 * Extract session ID from ANTHROPIC_BASE_URL.
 * Matches paths like /s/{sessionId} at the end of the URL.
 */
function extractSessionId(): string | undefined {
	const baseUrl = process.env.ANTHROPIC_BASE_URL;
	if (!baseUrl) return undefined;

	try {
		const url = new URL(baseUrl);
		const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
		return match ? match[1] : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read mode.json from the session directory.
 */
function readModeState(sessionId: string): ModeState | null {
	try {
		const modePath = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'sessions',
			sessionId,
			'mode.json',
		);
		if (!existsSync(modePath)) return null;

		const content = readFileSync(modePath, 'utf-8');
		const state = JSON.parse(content) as Partial<ModeState>;
		return {
			ulw: !!state.ulw,
		};
	} catch {
		return null;
	}
}

/**
 * Collect mode data
 */
async function collectModeData(
	_context: SegmentContext,
): Promise<SegmentData | null> {
	try {
		const sessionId = extractSessionId();
		if (!sessionId) return null;

		const state = readModeState(sessionId);
		if (!state) return null;

		const { ulw } = state;

		if (!ulw) return null;

		return {
			primary: '⚡ ULW',
			metadata: {},
			color: 'critical',
		};
	} catch {
		return null;
	}
}

/**
 * Format mode segment for display
 */
function formatModeSegment(
	data: SegmentData,
	_config: SegmentConfig,
	style: StyleConfig,
): string {
	// No brackets — icon prefix (⚡ / ◈) provides visual identity without wrapping
	return applyColor(data.primary, data.color, style);
}

export const modeSegment: Segment = {
	id: 'mode',
	collect: collectModeData,
	format: formatModeSegment,
};
