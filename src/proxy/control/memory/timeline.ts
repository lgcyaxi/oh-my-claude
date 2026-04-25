/**
 * Lightweight timeline regenerator for the dashboard.
 * Scans notes/ and sessions/ directories, reads frontmatter,
 * and writes TIMELINE.md at the mem root (.claude/mem/TIMELINE.md).
 *
 * This is a simplified version of src/memory/timeline.ts that doesn't
 * depend on the full memory system (SQLite, FTS5, etc.).
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseFrontmatter } from './io';
import { formatLocalYYYYMMDD } from '../../../memory/parser';

export async function regenerateTimeline(memRoot: string): Promise<void> {
	const entries: Array<{
		title: string;
		type: string;
		tags: string[];
		created: string;
	}> = [];

	const boilerplate = new Set(['auto-capture', 'session-end', 'context-threshold']);
	for (const sub of ['notes', 'sessions']) {
		const dir = join(memRoot, sub);
		if (!existsSync(dir)) continue;
		const files = await readdir(dir);
		for (const file of files) {
			if (!file.endsWith('.md') || file === 'TIMELINE.md') continue;
			try {
				const raw = await readFile(join(dir, file), 'utf-8');
				const { meta, content } = parseFrontmatter(raw);
				const titleMatch = content.match(/^#?\s*(.+)$/m);
				// Merge tags + concepts, filter boilerplate
				const rawTags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
				const rawConcepts = Array.isArray(meta.concepts) ? (meta.concepts as string[]) : [];
				const tags = [...rawTags, ...rawConcepts]
					.map((t) => String(t).trim())
					.filter((t) => t && !boilerplate.has(t));
				entries.push({
					title: titleMatch ? titleMatch[1]!.slice(0, 80) : file.replace('.md', ''),
					type: (meta.type as string) ?? 'note',
					tags,
					created: (meta.created as string) ?? '',
				});
			} catch { /* skip */ }
		}
	}

	// Sort by created date descending
	entries.sort((a, b) => (b.created || '').localeCompare(a.created || ''));

	const now = new Date();
	const todayStr = formatLocalYYYYMMDD(now);
	const lines = [
		'# Memory Timeline',
		`> ${entries.length} memories | Updated: ${now.toISOString()}`,
		'',
	];

	// Group by date
	const byDate = new Map<string, typeof entries>();
	for (const e of entries) {
		const date = e.created.slice(0, 10) || 'unknown';
		const group = byDate.get(date) ?? [];
		group.push(e);
		byDate.set(date, group);
	}

	const dates = [...byDate.keys()].sort().reverse();
	for (const date of dates) {
		const group = byDate.get(date)!;
		const label = date === todayStr ? `Today (${date})` : date;
		lines.push(`## ${label}`);
		for (const e of group) {
			const time = e.created.slice(11, 16) || '';
			const tagStr = e.tags.length > 0 ? ` \`${e.tags.join(', ')}\`` : '';
			lines.push(`- ${time} [${e.type}] **${e.title}**${tagStr}`);
		}
		lines.push('');
	}

	// Cap at 120 lines
	const maxLines = 120;
	if (lines.length > maxLines) {
		const truncated = lines.slice(0, maxLines - 1);
		truncated.push(`\n> ... truncated (${lines.length - maxLines + 1} lines omitted)`);
		await writeFile(join(memRoot, 'TIMELINE.md'), truncated.join('\n'), 'utf-8');
	} else {
		await writeFile(join(memRoot, 'TIMELINE.md'), lines.join('\n'), 'utf-8');
	}
}
