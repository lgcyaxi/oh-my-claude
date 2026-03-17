/**
 * Memory file I/O — frontmatter parsing and file reading
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { MemoryEntry, MemoryEntryWithPath } from './types';

export function parseFrontmatter(raw: string): {
	meta: Record<string, unknown>;
	content: string;
} {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) return { meta: {}, content: raw };

	const meta: Record<string, unknown> = {};
	const yamlLines = match[1]!.split('\n');
	for (const line of yamlLines) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (kv) {
			const key = kv[1]!;
			let value: unknown = kv[2]!.trim();
			// Strip surrounding quotes from YAML string values
			if (
				typeof value === 'string' &&
				value.length >= 2 &&
				((value.startsWith('"') && value.endsWith('"')) ||
				 (value.startsWith("'") && value.endsWith("'")))
			) {
				value = (value as string).slice(1, -1);
			}
			// Parse arrays like [tag1, tag2]
			if (
				typeof value === 'string' &&
				value.startsWith('[') &&
				value.endsWith(']')
			) {
				value = value
					.slice(1, -1)
					.split(',')
					.map((s) => s.trim());
			}
			meta[key] = value;
		}
	}

	return { meta, content: match[2]!.trim() };
}

/** Read all .md files from a directory */
export async function readMemoryFiles(
	dir: string,
	scope: string,
): Promise<MemoryEntry[]> {
	if (!existsSync(dir)) return [];

	const files = await readdir(dir);
	const entries: MemoryEntry[] = [];

	for (const file of files) {
		if (!file.endsWith('.md')) continue;
		try {
			const raw = await readFile(join(dir, file), 'utf-8');
			const { meta, content } = parseFrontmatter(raw);

			// Extract title from first heading
			const titleMatch = content.match(/^#\s+(.+)$/m);
			const title = titleMatch
				? titleMatch[1]!
				: file.replace('.md', '');

			// Merge tags + concepts, filter boilerplate for display
			const boilerplateTags = new Set(['auto-capture', 'session-end', 'context-threshold']);
			const rawTags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
			const rawConcepts = Array.isArray(meta.concepts) ? (meta.concepts as string[]) : [];
			const cleanTags = [...rawTags, ...rawConcepts]
				.map((t) => String(t).trim())
				.filter((t) => t && !boilerplateTags.has(t));

			entries.push({
				id: file.replace('.md', ''),
				filename: file,
				scope,
				type: (meta.type as string) ?? 'note',
				tags: cleanTags,
				created: (meta.created as string) ?? '',
				title,
				content,
				raw,
			});
		} catch {
			// skip unreadable
		}
	}

	return entries.sort(
		(a, b) =>
			new Date(b.created || 0).getTime() -
			new Date(a.created || 0).getTime(),
	);
}

/** Read memory files with full content and file paths (for daily operation) */
export async function readMemoryFilesWithPaths(
	dir: string,
): Promise<MemoryEntryWithPath[]> {
	if (!existsSync(dir)) return [];
	const files = await readdir(dir);
	const entries: MemoryEntryWithPath[] = [];
	for (const file of files) {
		if (!file.endsWith('.md')) continue;
		try {
			const filePath = join(dir, file);
			const raw = await readFile(filePath, 'utf-8');
			const { meta, content } = parseFrontmatter(raw);
			const titleMatch = content.match(/^#\s+(.+)$/m);
			entries.push({
				id: file.replace('.md', ''),
				title: titleMatch ? titleMatch[1]! : file.replace('.md', ''),
				content, // FULL content — not truncated
				type: (meta.type as string) ?? 'note',
				created: (meta.created as string) ?? '',
				filePath,
				dir,
			});
		} catch { /* skip */ }
	}
	return entries;
}
