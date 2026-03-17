/**
 * Session path utilities — directory scanning and project resolution
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ConversationEntry, SessionIndex } from './types';

export const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/** Check if a path looks like a valid absolute path (not a mangled folder name) */
export function looksLikeValidPath(p: string): boolean {
	// Windows: D:\... or C:\...
	if (/^[A-Z]:\\/.test(p)) return true;
	// Unix: /home/... or /Users/...
	if (p.startsWith('/')) return true;
	return false;
}

/**
 * Extract real project path from the first JSONL file's `cwd` field.
 * Folder names like "D--Github-blog" are ambiguous (can't distinguish
 * path separators from literal hyphens), so we read the actual cwd.
 */
export async function resolveProjectPath(folder: string): Promise<string> {
	const dirPath = join(PROJECTS_DIR, folder);
	try {
		const files = await readdir(dirPath);
		const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
		if (jsonlFiles.length === 0) return folder;

		// Try up to 5 JSONL files to find a cwd (some may be empty stubs)
		for (const jsonl of jsonlFiles.slice(0, 5)) {
			const rl = createInterface({
				input: createReadStream(join(dirPath, jsonl), {
					encoding: 'utf-8',
				}),
				crlfDelay: Infinity,
			});

			let linesRead = 0;
			for await (const line of rl) {
				if (!line.trim()) continue;
				linesRead++;
				try {
					const entry = JSON.parse(line) as ConversationEntry;
					if (entry.cwd) {
						rl.close();
						return entry.cwd;
					}
				} catch {
					// skip
				}
				if (linesRead >= 10) {
					rl.close();
					break;
				}
			}
		}
	} catch {
		// fallback
	}
	return folder;
}

/** Read and parse sessions-index.json for a project folder */
export async function readSessionIndex(
	folder: string,
): Promise<SessionIndex | null> {
	try {
		const indexPath = join(PROJECTS_DIR, folder, 'sessions-index.json');
		const raw = await readFile(indexPath, 'utf-8');
		return JSON.parse(raw) as SessionIndex;
	} catch {
		return null;
	}
}

/** Scan JSONL files in a project folder and return session IDs */
export async function scanJsonlFiles(
	folder: string,
): Promise<Array<{ sessionId: string; filePath: string; mtime: Date }>> {
	const dirPath = join(PROJECTS_DIR, folder);
	const entries = await readdir(dirPath);
	const results: Array<{
		sessionId: string;
		filePath: string;
		mtime: Date;
	}> = [];

	for (const name of entries) {
		if (!name.endsWith('.jsonl')) continue;
		const sessionId = name.replace('.jsonl', '');
		const filePath = join(dirPath, name);
		try {
			const st = await stat(filePath);
			results.push({ sessionId, filePath, mtime: st.mtime });
		} catch {
			// skip unreadable files
		}
	}

	return results;
}
