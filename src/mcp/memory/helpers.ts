import {
	getDefaultWriteScope,
	getProjectMemoryDir,
	getMemoryDir,
	resolveCanonicalRoot,
	regenerateTimelines,
} from '../../memory';
import type { EmbeddingProviderLike } from '../../memory/indexer';
import { loadConfig } from '../../shared/config/loader';
import { getConfiguredWriteScope } from '../shared/utils';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cached resolution of `memory.embedding.onWrite`. The config file is tiny
 * and rarely changes, but indexNewMemory runs on every remember so we avoid
 * redundant disk reads. Missing/corrupt config falls back to the default
 * (true) — matches the Zod default declared in schema.ts.
 */
let cachedEmbedOnWrite: boolean | null = null;
function readEmbedOnWriteFromConfig(): boolean {
	if (cachedEmbedOnWrite !== null) return cachedEmbedOnWrite;
	try {
		const cfg = loadConfig();
		cachedEmbedOnWrite = cfg.memory?.embedding?.onWrite !== false;
	} catch {
		cachedEmbedOnWrite = true;
	}
	return cachedEmbedOnWrite;
}

/** Best-effort timeline regeneration after any memory mutation */
export function afterMemoryMutation(projectRoot: string | undefined): void {
	try {
		regenerateTimelines(projectRoot);
	} catch (e) {
		console.error('[omc-memory] regenerateTimelines failed:', e);
	}
}

/**
 * Index a newly created memory file into the SQLite FTS index.
 * Call after createMemory() to keep the index in sync.
 *
 * When an embedding provider is supplied AND `memory.embedding.onWrite`
 * is enabled, the indexer also computes + caches vectors for every chunk
 * of this memory so hybrid search is "warm" on the very next query
 * (HIGH-9 beta.8). Absent a provider or with the knob disabled, this
 * falls through to the previous FTS-only behaviour.
 */
export async function indexNewMemory(
	memoryData: { id: string; type: string },
	scope: 'project' | 'global' | undefined,
	projectRoot: string | undefined,
	indexer: import('../../memory/indexer').MemoryIndexer | null,
	opts?: {
		embeddingProvider?: EmbeddingProviderLike | null;
		embedOnWrite?: boolean;
	},
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
		if (!memDir) return;
		const subdir = memoryData.type === 'session' ? 'sessions' : 'notes';
		const filePath = join(memDir, subdir, `${memoryData.id}.md`);

		const provider = opts?.embeddingProvider ?? null;
		const embedOnWrite =
			opts?.embedOnWrite !== undefined
				? opts.embedOnWrite
				: readEmbedOnWriteFromConfig();

		if (embedOnWrite && provider) {
			await indexer.indexMemoryWithEmbeddings(
				filePath,
				actualScope,
				projectRoot,
				provider,
			);
			return; // indexMemoryWithEmbeddings already flushes.
		}

		await indexer.indexFile(filePath, actualScope, projectRoot);
		await indexer.flush();
	} catch (e) {
		console.error('[oh-my-claude] Post-write indexing failed:', e);
	}
}

/**
 * Remove a deleted memory from the SQLite FTS index.
 * Call after deleteMemory() to keep the index in sync.
 *
 * NOTE: `indexer.removeFile` is async. Earlier versions fired it without
 * awaiting and skipped `flush()`, which left the `index.db` file out of
 * sync with disk until a later mutation flushed it. Callers should now
 * `await removeFromIndex(...)` to guarantee durability.
 */
export async function removeFromIndex(
	id: string,
	projectRoot: string | undefined,
	indexer: import('../../memory/indexer').MemoryIndexer | null,
): Promise<void> {
	if (!indexer?.isReady()) return;
	try {
		// Try both notes and sessions subdirs in both scopes.
		for (const subdir of ['notes', 'sessions']) {
			if (projectRoot) {
				const projDir = getProjectMemoryDir(projectRoot);
				if (projDir) {
					await indexer.removeFile(
						join(projDir, subdir, `${id}.md`),
					);
				}
			}
			const globalDir = getMemoryDir();
			if (globalDir) {
				await indexer.removeFile(join(globalDir, subdir, `${id}.md`));
			}
		}
		await indexer.flush();
	} catch (e) {
		console.error('[omc-memory] removeFromIndex failed:', e);
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
