import {
	getDefaultWriteScope,
	getProjectMemoryDir,
	getMemoryDir,
	resolveCanonicalRoot,
	regenerateTimelines,
} from '../../memory';
import { getConfiguredWriteScope } from '../shared/utils';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Best-effort timeline regeneration after any memory mutation */
export function afterMemoryMutation(projectRoot: string | undefined): void {
	try {
		regenerateTimelines(projectRoot);
	} catch {
		/* best-effort */
	}
}

/**
 * Index a newly created memory file into the SQLite FTS index.
 * Call after createMemory() to keep the index in sync.
 */
export async function indexNewMemory(
	memoryData: { id: string; type: string },
	scope: 'project' | 'global' | undefined,
	projectRoot: string | undefined,
	indexer: import('../../memory/indexer').MemoryIndexer | null,
): Promise<void> {
	if (!indexer?.isReady()) return;
	try {
		const actualScope =
			scope ??
			getDefaultWriteScope(projectRoot, getConfiguredWriteScope());
		const memDir =
			actualScope === 'project' && projectRoot
				? getProjectMemoryDir(projectRoot)
				: getMemoryDir();
		if (memDir) {
			const subdir = memoryData.type === 'session' ? 'sessions' : 'notes';
			const filePath = join(memDir, subdir, `${memoryData.id}.md`);
			await indexer.indexFile(filePath, actualScope, projectRoot);
			await indexer.flush();
		}
	} catch (e) {
		console.error('[oh-my-claude] Post-write indexing failed:', e);
	}
}

/**
 * Remove a deleted memory from the SQLite FTS index.
 * Call after deleteMemory() to keep the index in sync.
 */
export function removeFromIndex(
	id: string,
	projectRoot: string | undefined,
	indexer: import('../../memory/indexer').MemoryIndexer | null,
): void {
	if (!indexer?.isReady()) return;
	try {
		// Try both notes and sessions subdirs in both scopes
		for (const subdir of ['notes', 'sessions']) {
			if (projectRoot) {
				const projDir = getProjectMemoryDir(projectRoot);
				if (projDir)
					indexer.removeFile(join(projDir, subdir, `${id}.md`));
			}
			const globalDir = getMemoryDir();
			if (globalDir)
				indexer.removeFile(join(globalDir, subdir, `${id}.md`));
		}
	} catch {
		/* best-effort */
	}
}

/**
 * Build the list of memory directories to sync into the index.
 * When running from a worktree, also includes the canonical repo root's
 * memory directory so cross-worktree memories are visible.
 */
export function getSearchDirs(
	projectRoot: string | undefined,
): Array<{ path: string; scope: 'project' | 'global'; projectRoot?: string }> {
	const dirs: Array<{
		path: string;
		scope: 'project' | 'global';
		projectRoot?: string;
	}> = [];

	// Global memory directory
	const globalDir = getMemoryDir();
	dirs.push({ path: globalDir, scope: 'global' });

	// Project memory directory (if in a git repo)
	if (projectRoot) {
		const projectDir = getProjectMemoryDir(projectRoot);
		if (projectDir) {
			dirs.push({ path: projectDir, scope: 'project', projectRoot });
		}

		// If in a worktree, also sync the canonical repo root's memories
		const canonicalRoot = resolveCanonicalRoot(projectRoot);
		if (canonicalRoot && canonicalRoot !== projectRoot) {
			const canonicalMemDir = getProjectMemoryDir(canonicalRoot);
			if (canonicalMemDir && existsSync(canonicalMemDir)) {
				dirs.push({
					path: canonicalMemDir,
					scope: 'project',
					projectRoot: canonicalRoot,
				});
			}
		}
	}

	return dirs;
}
