import type { ToolContext, CallToolResult } from '../shared/types';
import {
	createMemory,
	getMemory,
	deleteMemory,
	listMemories,
	getMemoryStats,
	searchMemoriesEnvelope,
	getDefaultWriteScope,
	getProjectMemoryDir,
	getMemoryDir,
	hashContentSync,
	checkDuplicate,
	stripPrivateBlocks,
} from '../../memory';
import type { MemoryScope } from '../../memory';
import { getConfiguredWriteScope } from '../shared/utils';
import { indexNewMemory, afterMemoryMutation } from './helpers';
import { handleMemoryAiOp } from './ai-ops';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Normalize tags/concepts from MCP tool input.
 * AI models sometimes send a comma-separated string or JSON array string
 * instead of a proper string[]. Spreading a string with [...] iterates
 * characters, causing "sidebar" → ["s","i","d","e","b","a","r"].
 */
function normalizeInputTags(input: unknown): string[] {
	if (!input) return [];
	if (Array.isArray(input)) {
		// Flatten: handle elements that are themselves comma-separated
		return input
			.flatMap((item) =>
				typeof item === 'string'
					? item.split(',').map((s) => s.trim())
					: [],
			)
			.filter((s) => s.length > 0);
	}
	if (typeof input === 'string') {
		let trimmed = input.trim();
		// Strip surrounding quotes: '"sidebar, polling"' → 'sidebar, polling'
		if (
			(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'"))
		) {
			trimmed = trimmed.slice(1, -1).trim();
		}
		// Handle JSON array strings like '["agents", "reorganization"]'
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return parsed.filter(
						(s): s is string =>
							typeof s === 'string' && s.length > 0,
					);
				}
			} catch {
				// Not valid JSON, fall through to comma split
			}
		}
		// Plain comma-separated string: "sidebar, polling, sse"
		return trimmed
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}
	return [];
}

export async function handleMemoryTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolContext,
): Promise<CallToolResult | undefined> {
	const cachedProjectRoot = ctx.getProjectRoot();

	switch (name) {
		case 'remember': {
			const {
				content,
				title,
				type,
				category,
				tags,
				concepts,
				files,
				scope,
			} = args as {
				content: string;
				title?: string;
				type?: 'note' | 'session';
				category?: import('../../memory/types').MemoryCategory;
				tags?: string[];
				concepts?: string[];
				files?: string[];
				scope?: 'project' | 'global';
			};

			if (!content) {
				return {
					content: [
						{ type: 'text', text: 'Error: content is required' },
					],
					isError: true,
				};
			}

			// Initialize indexer for dedup check
			const { indexer, embeddingProvider } = await ctx.ensureIndexer();

			// Dedup check: skip exact duplicates, tag near-duplicates
			const contentHash = hashContentSync(content);
			const dedupResult = await checkDuplicate(
				content,
				contentHash,
				indexer,
				embeddingProvider,
			);

			if (dedupResult.isDuplicate) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								stored: false,
								reason: 'exact_duplicate',
								existingId: dedupResult.exactMatch,
								message: `Exact duplicate of existing memory "${dedupResult.exactMatch}". Skipped.`,
							}),
						},
					],
				};
			}

			// Add near-duplicate tag if similar memories found.
			// Normalize tags at input boundary: AI models sometimes send a string
			// instead of string[], and [...string] would spread into characters.
			const normalizedTags = normalizeInputTags(tags);
			const memTags = [...normalizedTags];
			let nearDupeInfo:
				| { existingId: string; similarity: number }
				| undefined;
			if (dedupResult.nearDuplicates.length > 0) {
				const top = dedupResult.nearDuplicates[0]!;
				memTags.push(`potential-duplicate:${top.id}`);
				nearDupeInfo = {
					existingId: top.id,
					similarity: top.similarity,
				};
			}

			const result = createMemory(
				{
					content,
					title,
					type,
					category,
					tags: memTags,
					concepts: normalizeInputTags(concepts),
					files,
					scope,
				},
				cachedProjectRoot,
			);
			if (!result.success) {
				return {
					content: [{ type: 'text', text: `Error: ${result.error}` }],
					isError: true,
				};
			}

			// Index the new file (+ eagerly embed chunks when available)
			if (result.data) {
				await indexNewMemory(
					result.data,
					scope,
					cachedProjectRoot,
					indexer,
					{ embeddingProvider },
				);
			}

			// Regenerate timeline after remember
			afterMemoryMutation(cachedProjectRoot);

			const actualScope =
				scope ??
				getDefaultWriteScope(
					cachedProjectRoot,
					getConfiguredWriteScope(),
				);
			const reason = nearDupeInfo ? 'near_duplicate_tagged' : 'created';

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							stored: true,
							id: result.data!.id,
							title: result.data!.title,
							type: result.data!.type,
							...(result.data!.category && {
								category: result.data!.category,
							}),
							tags: result.data!.tags,
							...(result.data!.concepts &&
								result.data!.concepts.length > 0 && {
									concepts: result.data!.concepts,
								}),
							...(result.data!.files &&
								result.data!.files.length > 0 && {
									files: result.data!.files,
								}),
							scope: actualScope,
							reason,
							...(nearDupeInfo && {
								nearDuplicate: nearDupeInfo,
							}),
						}),
					},
				],
			};
		}

		case 'recall': {
			const { query, type, category, tags, concepts, limit, scope } =
				args as {
					query?: string;
					type?: 'note' | 'session';
					category?: import('../../memory/types').MemoryCategory;
					tags?: string[];
					concepts?: string[];
					limit?: number;
					scope?: MemoryScope;
				};

			// Initialize indexer for tiered search
			const { indexer, embeddingProvider } = await ctx.ensureIndexer();

			const envelope = await searchMemoriesEnvelope(
				{
					query,
					type,
					category,
					tags,
					concepts,
					limit: limit ?? 5,
					sort: 'relevance',
					scope: scope ?? 'all',
				},
				cachedProjectRoot,
				{
					indexer,
					embeddingProvider,
				},
			);
			const results = envelope.results;

			// HIGH-10 (beta.8): Report the tier that actually ran, not just
			// what we were capable of. When capability=hybrid but the
			// embedding cache was empty we fall through to FTS5; the
			// envelope now captures that distinction so the client
			// (statusline, dashboard, compact flows) knows when embeddings
			// haven't been backfilled yet.
			const searchTier = envelope.executedTier;

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							count: results.length,
							searchTier,
							memories: results.map((r) => ({
								id: r.entry.id,
								title: r.entry.title,
								type: r.entry.type,
								...(r.entry.category && {
									category: r.entry.category,
								}),
								tags: r.entry.tags,
								...(r.entry.concepts &&
									r.entry.concepts.length > 0 && {
										concepts: r.entry.concepts,
									}),
								score: r.score,
								snippet:
									r.snippet ??
									r.entry.content.slice(0, 300) +
										(r.entry.content.length > 300
											? '...'
											: ''),
								chunkLocation: r.chunkLocation,
								scope: (r.entry as any)._scope,
								createdAt: r.entry.createdAt,
							})),
						}),
					},
				],
			};
		}

		case 'get_memory': {
			const { id, scope } = args as { id: string; scope?: MemoryScope };

			if (!id) {
				return {
					content: [{ type: 'text', text: 'Error: id is required' }],
					isError: true,
				};
			}

			const memResult = getMemory(id, scope ?? 'all', cachedProjectRoot);
			if (!memResult.success || !memResult.data) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								found: false,
								error: memResult.error ?? 'Memory not found',
							}),
						},
					],
					isError: true,
				};
			}

			const entry = memResult.data;
			// Strip private blocks from returned content
			const cleanContent = stripPrivateBlocks(entry.content);
			const totalLines = cleanContent.split('\n').length;

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							id: entry.id,
							title: entry.title,
							type: entry.type,
							...(entry.category && { category: entry.category }),
							tags: entry.tags,
							...(entry.concepts &&
								entry.concepts.length > 0 && {
									concepts: entry.concepts,
								}),
							...(entry.files &&
								entry.files.length > 0 && {
									files: entry.files,
								}),
							content: cleanContent,
							totalLines,
							scope: (entry as any)._scope,
							createdAt: entry.createdAt,
							updatedAt: entry.updatedAt,
						}),
					},
				],
			};
		}

		case 'forget': {
			const { id, scope } = args as { id: string; scope?: MemoryScope };

			if (!id) {
				return {
					content: [{ type: 'text', text: 'Error: id is required' }],
					isError: true,
				};
			}

			// Find the memory first to get file path for index cleanup
			const memToDelete = getMemory(
				id,
				scope ?? 'all',
				cachedProjectRoot,
			);
			const result = deleteMemory(id, scope ?? 'all', cachedProjectRoot);

			// Ensure indexer is ready for cleanup
			const { indexer } = await ctx.ensureIndexer();

			// Clean up index entries if deletion succeeded
			let indexCleaned = false;
			if (result.success && indexer?.isReady()) {
				try {
					// Determine file path from memory scope and ID
					const entry = memToDelete.data;
					if (entry) {
						const entryScope = (entry as any)._scope as
							| string
							| undefined;
						const subdir =
							entry.type === 'session' ? 'sessions' : 'notes';

						if (entryScope === 'project' && cachedProjectRoot) {
							const projDir =
								getProjectMemoryDir(cachedProjectRoot);
							if (projDir) {
								await indexer.removeFile(
									join(projDir, subdir, `${id}.md`),
								);
								indexCleaned = true;
							}
						} else {
							await indexer.removeFile(
								join(getMemoryDir(), subdir, `${id}.md`),
							);
							indexCleaned = true;
						}

						if (indexCleaned) await indexer.flush();
					}
				} catch (e) {
					console.error(
						'[oh-my-claude] Index cleanup after forget failed:',
						e,
					);
				}
			}

			// Regenerate timeline after forget
			afterMemoryMutation(cachedProjectRoot);

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							deleted: result.success,
							indexCleaned,
							...(result.error && { error: result.error }),
						}),
					},
				],
				...(result.success ? {} : { isError: true }),
			};
		}

		case 'list_memories': {
			const { type, limit, after, before, scope } = args as {
				type?: 'note' | 'session';
				limit?: number;
				after?: string;
				before?: string;
				scope?: MemoryScope;
			};

			const entries = listMemories(
				{
					type,
					limit: limit ?? 20,
					after,
					before,
					scope: scope ?? 'all',
				},
				cachedProjectRoot,
			);

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							count: entries.length,
							memories: entries.map((e) => ({
								id: e.id,
								title: e.title,
								type: e.type,
								...(e.category && { category: e.category }),
								tags: e.tags,
								createdAt: e.createdAt,
								updatedAt: e.updatedAt,
								scope: (e as any)._scope,
								preview:
									e.content.slice(0, 200) +
									(e.content.length > 200 ? '...' : ''),
							})),
						}),
					},
				],
			};
		}

		case 'memory_status': {
			const stats = getMemoryStats(cachedProjectRoot);
			const projectDir = getProjectMemoryDir(cachedProjectRoot);

			// Ensure indexer is ready for accurate status reporting
			const { indexer, embeddingProvider } = await ctx.ensureIndexer();

			// Get index status if indexer is available
			let indexStatus: Record<string, any> | undefined;
			if (indexer?.isReady()) {
				try {
					const idxStats = await indexer.getStats();
					const dbPath = join(
						homedir(),
						'.claude',
						'oh-my-claude',
						'memory',
						'index.db',
					);
					const capabilityTier = embeddingProvider
						? 'hybrid'
						: 'fts5';

					indexStatus = {
						initialized: true,
						dbPath,
						...idxStats,
						embeddingProvider: embeddingProvider
							? `${embeddingProvider.name}/${embeddingProvider.model}`
							: null,
						// HIGH-10 (beta.8): Distinguish capability (can do hybrid
						// if queried) from executed tier (what ran per query,
						// reported in `recall` responses). `searchTier` is kept
						// as an alias of `capabilityTier` for backwards compat.
						capabilityTier,
						searchTier: capabilityTier,
					};
				} catch {
					indexStatus = { initialized: false };
				}
			} else {
				indexStatus = {
					initialized: false,
					capabilityTier: 'legacy',
					searchTier: 'legacy',
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							...stats,
							projectMemoryAvailable: projectDir !== null,
							defaultWriteScope: getDefaultWriteScope(
								cachedProjectRoot,
								getConfiguredWriteScope(),
							),
							indexStatus,
							tokenUsage: indexer?.isReady()
								? indexer.getTokenStats()
								: null,
						}),
					},
				],
			};
		}

		case 'compact_memories':
		case 'clear_memories':
		case 'summarize_memories':
			return handleMemoryAiOp(name, args, ctx, cachedProjectRoot);

		default:
			return undefined;
	}
}
