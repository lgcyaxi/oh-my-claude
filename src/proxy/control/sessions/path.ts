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
 *
 * Checks both flat JSONL files at root and subagent JSONL inside session dirs.
 */
export async function resolveProjectPath(folder: string): Promise<string> {
	const dirPath = join(PROJECTS_DIR, folder);
	try {
		const entries = await readdir(dirPath, { withFileTypes: true });

		// Collect candidate JSONL paths: flat files first, then subagent files
		const candidates: string[] = [];
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith('.jsonl')) {
				candidates.push(join(dirPath, entry.name));
			}
		}
		// If no flat JSONL, try subagent JSONL inside session directories
		if (candidates.length === 0) {
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name === 'memory') continue;
				const subagentsDir = join(dirPath, entry.name, 'subagents');
				try {
					const subFiles = await readdir(subagentsDir);
					for (const sf of subFiles) {
						if (sf.endsWith('.jsonl')) {
							candidates.push(join(subagentsDir, sf));
							break; // one per session dir is enough
						}
					}
				} catch { /* no subagents dir */ }
				if (candidates.length >= 3) break;
			}
		}

		// Try up to 5 JSONL files to find a cwd
		for (const jsonlPath of candidates.slice(0, 5)) {
			const rl = createInterface({
				input: createReadStream(jsonlPath, { encoding: 'utf-8' }),
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

/** UUID v4 pattern for session directory names */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionFileEntry {
	sessionId: string;
	/** Path to the main JSONL file, or null for directory-only sessions */
	filePath: string | null;
	mtime: Date;
	/** true = directory-based session (may lack main conversation JSONL) */
	isDirectory: boolean;
}

/**
 * Scan sessions in a project folder — supports both formats:
 * - Legacy flat: {sessionId}.jsonl files at root
 * - Directory-based: {sessionId}/ directories (Claude Code 2.1+)
 */
export async function scanJsonlFiles(
	folder: string,
): Promise<SessionFileEntry[]> {
	const dirPath = join(PROJECTS_DIR, folder);
	const entries = await readdir(dirPath, { withFileTypes: true });
	const results: SessionFileEntry[] = [];
	const seenIds = new Set<string>();

	// Pass 1: flat JSONL files (active sessions)
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
		const sessionId = entry.name.replace('.jsonl', '');
		const filePath = join(dirPath, entry.name);
		try {
			const st = await stat(filePath);
			results.push({ sessionId, filePath, mtime: st.mtime, isDirectory: false });
			seenIds.add(sessionId);
		} catch {
			// skip unreadable files
		}
	}

	// Pass 2: UUID directories (directory-based sessions)
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (!UUID_RE.test(entry.name)) continue;
		if (entry.name === 'memory') continue; // skip special dirs
		if (seenIds.has(entry.name)) continue; // already found as flat JSONL

		const sessionDir = join(dirPath, entry.name);
		try {
			const st = await stat(sessionDir);
			results.push({
				sessionId: entry.name,
				filePath: null, // no main JSONL for directory-based sessions
				mtime: st.mtime,
				isDirectory: true,
			});
		} catch {
			// skip unreadable
		}
	}

	return results;
}
