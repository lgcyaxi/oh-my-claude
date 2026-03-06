/**
 * Shared path/git utilities for memory hooks.
 * Uses only Node.js built-ins — no heavy deps (SQLite, embeddings, etc.).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const STATE_DIR = join(homedir(), '.claude', 'oh-my-claude', 'state');

export function shortHash(str: string): string {
	return createHash('sha256').update(str).digest('hex').slice(0, 8);
}

export function getStateFile(projectCwd?: string): string {
	const suffix = projectCwd ? `-${shortHash(projectCwd)}` : '';
	return join(STATE_DIR, `context-memory-state${suffix}.json`);
}

export function getSessionLogPath(projectCwd?: string): string {
	const suffix = projectCwd ? `-${shortHash(projectCwd)}` : '';
	return join(
		homedir(),
		'.claude',
		'oh-my-claude',
		'memory',
		'sessions',
		`active-session${suffix}.jsonl`,
	);
}

export function findGitRoot(fromDir: string): string | null {
	let dir = fromDir;
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
 * Resolve canonical (non-worktree) repo root.
 * In a worktree, .git is a file with "gitdir: ..." pointing to the main repo.
 *
 * Two variants exist in hooks:
 * - context-memory: returns projectRoot on error (never null)
 * - memory-awareness: returns null if .git missing or on error
 *
 * This implementation returns null on error for safety; callers that need
 * a guaranteed string can fall back to their original projectRoot.
 */
export function resolveCanonicalRoot(projectRoot: string): string | null {
	const gitPath = join(projectRoot, '.git');
	if (!existsSync(gitPath)) return null;

	try {
		const stat = statSync(gitPath);
		if (stat.isDirectory()) return projectRoot;

		const content = readFileSync(gitPath, 'utf-8').trim();
		const match = content.match(/^gitdir:\s*(.+)$/);
		if (!match) return null;

		const gitdir = match[1]!.trim();
		const normalized = gitdir.replace(/\\/g, '/');
		const worktreesIdx = normalized.indexOf('/.git/worktrees/');
		if (worktreesIdx === -1) return null;

		return gitdir.slice(0, worktreesIdx);
	} catch {
		return null;
	}
}
