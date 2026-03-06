/**
 * Memory segment - shows memory store counts with global/project breakdown
 *
 * Display formats:
 * - No project: `mem:5G` (global only)
 * - With project: `mem:12P/5G` (project/global breakdown)
 * - With token stats: `mem:12P/5G tk:3/2` (embedding calls / search queries)
 *
 * Uses getMemoryStats() from the memory module.
 * Reads token stats from ~/.claude/oh-my-claude/memory/token-stats.json if available.
 */

import { existsSync, readFileSync } from 'node:fs';
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
import { getMemoryStats } from '../../memory';

/**
 * Find project root from cwd by walking up to find .git
 */
function findProjectRoot(cwd: string): string | null {
	let dir = cwd;
	while (true) {
		if (existsSync(join(dir, '.git'))) {
			return dir;
		}
		const parent = join(dir, '..');
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

/**
 * Read token stats from the persisted file (written by indexer on flush)
 */
function readTokenStats(): {
	embeddingCalls: number;
	searchQueries: number;
} | null {
	try {
		const statsPath = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'memory',
			'token-stats.json',
		);
		if (!existsSync(statsPath)) return null;
		const raw = readFileSync(statsPath, 'utf-8');
		const data = JSON.parse(raw);
		if (
			typeof data.embeddingCalls === 'number' &&
			typeof data.searchQueries === 'number'
		) {
			return {
				embeddingCalls: data.embeddingCalls,
				searchQueries: data.searchQueries,
			};
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Collect memory data
 */
async function collectMemoryData(
	context: SegmentContext,
): Promise<SegmentData | null> {
	try {
		const projectRoot = findProjectRoot(context.cwd) ?? undefined;
		const stats = getMemoryStats(projectRoot);
		const { project, global: glob } = stats.byScope;

		// Format: mem:12P/5G (both), mem:5G (global only), mem:12P (project only)
		let display: string;
		if (project > 0 && glob > 0) {
			display = `mem:${project}P/${glob}G`;
		} else if (project > 0) {
			display = `mem:${project}P`;
		} else if (glob > 0) {
			display = `mem:${glob}G`;
		} else {
			display = 'mem:0';
		}

		// Append token stats if available
		const tokenStats = readTokenStats();
		if (
			tokenStats &&
			(tokenStats.embeddingCalls > 0 || tokenStats.searchQueries > 0)
		) {
			display += ` tk:${tokenStats.embeddingCalls}/${tokenStats.searchQueries}`;
		}

		return {
			primary: display,
			metadata: {
				total: String(stats.total),
				project: String(project),
				global: String(glob),
				notes: String(stats.byType.note),
				sessions: String(stats.byType.session),
			},
			color: stats.total > 0 ? 'good' : 'neutral',
		};
	} catch {
		return null;
	}
}

/**
 * Format memory segment for display
 */
function formatMemorySegment(
	data: SegmentData,
	_config: SegmentConfig,
	style: StyleConfig,
): string {
	const colored = applyColor(data.primary, data.color, style);
	return wrapBrackets(colored, style);
}

export const memorySegment: Segment = {
	id: 'memory',
	collect: collectMemoryData,
	format: formatMemorySegment,
};
