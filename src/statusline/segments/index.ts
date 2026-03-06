/**
 * Segment registry and factory
 */

export * from './types';

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
	Segment,
	SegmentId,
	SegmentContext,
	StatusLineConfig,
	StyleConfig,
} from './types';
import {
	PRESETS,
	DEFAULT_SEGMENT_POSITIONS,
	DEFAULT_SEGMENT_ROWS,
} from './types';

// Debug mode: set DEBUG_STATUSLINE=1 to enable error logging
const DEBUG_STATUSLINE = process.env.DEBUG_STATUSLINE === '1';

/**
 * Log segment errors to debug file when DEBUG_STATUSLINE=1
 */
function logSegmentError(segmentId: string, error: unknown): void {
	try {
		const logDir = join(homedir(), '.config', 'oh-my-claude', 'logs');
		if (!existsSync(logDir)) {
			mkdirSync(logDir, { recursive: true });
		}
		const logPath = join(logDir, 'statusline-debug.log');
		const timestamp = new Date().toISOString();
		const errorMsg = error instanceof Error ? error.message : String(error);
		const logLine = `[${timestamp}] Segment "${segmentId}" failed: ${errorMsg}\n`;
		appendFileSync(logPath, logLine);
	} catch {
		// Silently fail if we can't write to log
	}
}

// Import segment implementations
import { gitSegment } from './git';
import { directorySegment } from './directory';
import { sessionSegment } from './session';
import { modelSegment } from './model';
import { contextSegment } from './context';
import { outputStyleSegment } from './output-style';
import { memorySegment } from './memory';
import { modeSegment } from './mode';
import { proxySegment } from './proxy';
import { usageSegment } from './usage/index';
import { preferencesSegment } from './preferences';
import { codexSegment } from './codex';
import { bridgeSegment } from './bridge';

// Registry of all available segments
const segmentRegistry = new Map<SegmentId, Segment>();

/**
 * Register a segment implementation
 */
export function registerSegment(segment: Segment): void {
	segmentRegistry.set(segment.id, segment);
}

/**
 * Get a segment by ID
 */
export function getSegment(id: SegmentId): Segment | undefined {
	return segmentRegistry.get(id);
}

/**
 * Get all registered segments
 */
export function getAllSegments(): Segment[] {
	return Array.from(segmentRegistry.values());
}

/**
 * Get enabled segments based on config, sorted by (row, position)
 */
export function getEnabledSegments(config: StatusLineConfig): Segment[] {
	const enabledIds = Object.entries(config.segments)
		.filter(([_, segConfig]) => segConfig.enabled)
		.sort(([, a], [, b]) =>
			a.row !== b.row ? a.row - b.row : a.position - b.position,
		)
		.map(([id]) => id as SegmentId);

	return enabledIds
		.map((id) => segmentRegistry.get(id))
		.filter((seg): seg is Segment => seg !== undefined);
}

/**
 * Apply a preset to get segment configuration
 */
export function applyPreset(
	preset: StatusLineConfig['preset'],
): Record<SegmentId, { enabled: boolean; position: number; row: number }> {
	const enabledSegments = PRESETS[preset];
	const allSegmentIds: SegmentId[] = [
		'model',
		'git',
		'directory',
		'context',
		'session',
		'output-style',
		'mode',
		'proxy',
		'bridge',
		'memory',
		'preferences',
		'codex',
		'usage',
	];

	const result: Record<
		SegmentId,
		{ enabled: boolean; position: number; row: number }
	> = {} as any;

	for (const id of allSegmentIds) {
		result[id] = {
			enabled: enabledSegments.includes(id),
			position: DEFAULT_SEGMENT_POSITIONS[id],
			row: DEFAULT_SEGMENT_ROWS[id],
		};
	}

	return result;
}

/**
 * Render all enabled segments
 *
 * Row assignment is determined by config.segments[id].row.
 * Segments on the same row are joined with the configured separator.
 * Rows are joined with "\n".
 */
export async function renderSegments(
	config: StatusLineConfig,
	context: SegmentContext,
): Promise<string> {
	if (!config.enabled) {
		return '';
	}

	const segments = getEnabledSegments(config);
	const lineParts: Map<number, string[]> = new Map();

	// Collect all segments in parallel so slow segments don't block fast ones
	const results = await Promise.allSettled(
		segments.map((segment) =>
			segment.collect(context).then((data) => ({ segment, data })),
		),
	);

	// Process results in original segment order (Promise.allSettled preserves order)
	for (const result of results) {
		if (result.status !== 'fulfilled') {
			if (DEBUG_STATUSLINE) {
				logSegmentError('unknown', result.reason);
			}
			continue;
		}
		const { segment, data } = result.value;
		if (!data) continue;
		try {
			const formatted = segment.format(
				data,
				config.segments[segment.id],
				config.style,
			);
			if (formatted) {
				const rowNum = config.segments[segment.id]?.row ?? 1;
				if (!lineParts.has(rowNum)) lineParts.set(rowNum, []);
				lineParts.get(rowNum)!.push(formatted);
			}
		} catch (error) {
			if (DEBUG_STATUSLINE) {
				logSegmentError(segment.id, error);
			}
		}
	}

	const sortedLines = [...lineParts.entries()]
		.filter(([_, parts]) => parts.length > 0)
		.sort(([a], [b]) => a - b);

	return sortedLines
		.map(([_, parts]) => parts.join(config.style.separator))
		.join('\n');
}

/**
 * ANSI color codes for semantic colors
 */
export const SEMANTIC_COLORS = {
	good: '\x1b[32m', // Green
	warning: '\x1b[33m', // Yellow
	critical: '\x1b[31m', // Red
	neutral: '\x1b[36m', // Cyan
	reset: '\x1b[0m',
} as const;

/**
 * Helper to wrap text in brackets if enabled
 */
export function wrapBrackets(text: string, style: StyleConfig): string {
	return style.brackets ? `[${text}]` : text;
}

/**
 * Helper to apply semantic color if colors enabled
 */
export function applyColor(
	text: string,
	color: keyof typeof SEMANTIC_COLORS | undefined,
	style: StyleConfig,
): string {
	if (!style.colors || !color || color === 'reset') {
		return text;
	}
	return `${SEMANTIC_COLORS[color]}${text}${SEMANTIC_COLORS.reset}`;
}

// Auto-register all implemented segments
registerSegment(modelSegment);
registerSegment(gitSegment);
registerSegment(directorySegment);
registerSegment(contextSegment);
registerSegment(sessionSegment);
registerSegment(outputStyleSegment);
registerSegment(memorySegment);
registerSegment(modeSegment);
registerSegment(proxySegment);
registerSegment(usageSegment);
registerSegment(preferencesSegment);
registerSegment(codexSegment);
registerSegment(bridgeSegment);
