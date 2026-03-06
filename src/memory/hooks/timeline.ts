/**
 * Timeline reading for memory hooks.
 * Combines project + global TIMELINE.md files with truncation.
 * Uses only Node.js built-ins — no heavy deps.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Read and combine TIMELINE.md files from project and global scopes.
 * Returns combined timeline content truncated to maxLines, or null if none exist.
 */
export function getTimelineContent(
	projectCwd?: string,
	maxLines: number = 80,
): string | null {
	const lines: string[] = [];

	if (projectCwd) {
		const projectTimeline = join(
			projectCwd,
			'.claude',
			'mem',
			'TIMELINE.md',
		);
		if (existsSync(projectTimeline)) {
			try {
				const content = readFileSync(projectTimeline, 'utf-8').trim();
				if (content) lines.push(content);
			} catch {
				// ignore
			}
		}
	}

	const globalTimeline = join(
		homedir(),
		'.claude',
		'oh-my-claude',
		'memory',
		'TIMELINE.md',
	);
	if (existsSync(globalTimeline)) {
		try {
			const content = readFileSync(globalTimeline, 'utf-8').trim();
			if (content) {
				if (lines.length > 0) {
					lines.push('');
					lines.push('---');
					lines.push('# Global Memory Timeline');
					const globalLines = content.split('\n');
					const startIdx = globalLines.findIndex((l) =>
						l.startsWith('> '),
					);
					if (startIdx >= 0) {
						lines.push(...globalLines.slice(startIdx));
					} else {
						lines.push(content);
					}
				} else {
					lines.push(content);
				}
			}
		} catch {
			// ignore
		}
	}

	if (lines.length === 0) return null;

	const combined = lines.join('\n');
	const allLines = combined.split('\n');

	if (allLines.length > maxLines) {
		return allLines.slice(0, maxLines).join('\n') + '\n> ... truncated';
	}

	return combined;
}
