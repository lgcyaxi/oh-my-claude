/**
 * Memory query — collect entries across scopes
 */

import { join } from 'node:path';
import type { MemoryEntryWithPath } from './types';
import { GLOBAL_MEMORY_DIR, findOmcProjectMemDirs } from './path';
import { readMemoryFiles, readMemoryFilesWithPaths } from './io';

/** Special marker to scan global memories only */
export const GLOBAL_SCOPE = '__global__';

/** Collect all memory entries (with optional project filter) */
export async function collectMemoryEntries(
	targetProject: string | undefined,
	fullContent: boolean,
): Promise<MemoryEntryWithPath[]> {
	const all: MemoryEntryWithPath[] = [];
	const globalOnly = targetProject === GLOBAL_SCOPE;

	// Scan omc project memories (skip if global-only)
	if (!globalOnly) {
		const omcDirs = await findOmcProjectMemDirs();
		for (const { dir, projectPath: pp } of omcDirs) {
			if (targetProject && pp !== targetProject) continue;
			if (fullContent) {
				all.push(...await readMemoryFilesWithPaths(dir));
			} else {
				const entries = await readMemoryFiles(dir, 'global');
				for (const e of entries) {
					all.push({
						id: e.id,
						title: e.title,
						content: e.content.slice(0, 300),
						type: e.type,
						created: e.created,
						filePath: join(dir.replace(/\\/g, '/').includes('/sessions') ? dir : dir, `${e.id}.md`),
						dir,
					});
				}
			}
		}
	}

	// Scan global memories when no project filter or global-only
	if (!targetProject || globalOnly) {
		for (const sub of ['notes', 'sessions']) {
			const dir = join(GLOBAL_MEMORY_DIR, sub);
			if (fullContent) {
				all.push(...await readMemoryFilesWithPaths(dir));
			} else {
				const entries = await readMemoryFiles(dir, 'global');
				for (const e of entries) {
					all.push({
						id: e.id,
						title: e.title,
						content: e.content.slice(0, 300),
						type: e.type,
						created: e.created,
						filePath: join(dir, `${e.id}.md`),
						dir,
					});
				}
			}
		}
	}

	return all;
}
