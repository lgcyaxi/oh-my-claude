import type { ToolContext, CallToolResult } from '../shared/types';
import {
	createMemory,
	getMemory,
	deleteMemory,
	listMemories,
	getDefaultWriteScope,
	callMemoryAI,
	parseAIJsonResult,
	mergeMemoryContent,
	deduplicateTags,
	resolveLatestDate,
	buildCompactAnalyzePrompt,
	buildClearAnalyzePrompt,
	buildSummarizeAnalyzePrompt,
} from '../../memory';
import type { MemoryScope } from '../../memory';
import { parseStringArray, getConfiguredWriteScope } from '../shared/utils';
import {
	indexNewMemory,
	removeFromIndex,
	afterMemoryMutation,
} from './helpers';

export async function handleMemoryAiOp(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolContext,
	cachedProjectRoot: string | undefined,
): Promise<CallToolResult | undefined> {
	switch (name) {
		case 'compact_memories': {
			const { mode, scope, groups, targetScope, type } = args as {
				mode: 'analyze' | 'execute';
				scope?: MemoryScope;
				groups?: Array<{ ids: string[]; title: string }>;
				targetScope?: 'project' | 'global';
				type?: 'note' | 'session' | 'all'; // Filter by memory type (default: "note")
			};

			// Default to notes only for compact (use /omc-mem-daily for sessions)
			const typeFilter = type ?? 'note';

			if (mode === 'analyze') {
				// Get memories to analyze, filtered by type
				const allEntries = listMemories(
					{ scope: scope ?? 'all' },
					cachedProjectRoot,
				);
				const entries =
					typeFilter === 'all'
						? allEntries
						: allEntries.filter((e) => e.type === typeFilter);

				if (entries.length < 2) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									analyzed: true,
									groups: [],
									message: `Not enough ${typeFilter === 'all' ? '' : typeFilter + ' '}memories to compact (need at least 2)`,
									typeFilter,
								}),
							},
						],
					};
				}

				// Prepare memory summaries for AI analysis
				const memorySummaries = entries.map((e) => ({
					id: e.id,
					title: e.title,
					type: e.type,
					tags: e.tags,
					preview: e.content.slice(0, 300),
					scope: (e as any)._scope,
				}));

				const analysisPrompt = buildCompactAnalyzePrompt(memorySummaries, typeFilter);

				let analysisResult: any = null;
				let usedProvider: string | null = null;

				try {
					const aiResponse = await callMemoryAI(analysisPrompt, {
						temperature: 0.1,
					});
					analysisResult = parseAIJsonResult(aiResponse.content);
					usedProvider = aiResponse.provider;
				} catch (error) {
					console.error(
						'[omc-memory] compact analyze AI call failed:',
						error,
					);
				}

				if (!analysisResult) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									analyzed: false,
									error: 'Failed to analyze memories. Proxy AI unavailable.',
								}),
							},
						],
						isError: true,
					};
				}

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								analyzed: true,
								provider: usedProvider,
								totalMemories: entries.length,
								suggestedGroups: analysisResult.groups || [],
								ungrouped: analysisResult.ungrouped || [],
								message:
									"Review the suggested groups and call compact_memories with mode='execute' to merge.",
							}),
						},
					],
				};
			} else if (mode === 'execute') {
				// Execute the merge for confirmed groups
				if (!groups || groups.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									executed: false,
									error: "No groups provided. Use mode='analyze' first to get suggestions.",
								}),
							},
						],
						isError: true,
					};
				}

				const { indexer, embeddingProvider } = await ctx.ensureIndexer();

				const results: Array<{
					group: string;
					success: boolean;
					newId?: string;
					error?: string;
					deleteErrors?: string[];
				}> = [];

				for (const group of groups) {
					try {
						// Fetch all memories in the group
						const memories = group.ids
							.map((id) =>
								getMemory(id, 'all', cachedProjectRoot),
							)
							.filter((r) => r.success && r.data)
							.map((r) => r.data!);

						if (memories.length < 2) {
							results.push({
								group: group.title,
								success: false,
								error: 'Not enough valid memories in group',
							});
							continue;
						}

						const mergedContent = mergeMemoryContent(memories);
						const mergedTags = deduplicateTags(memories.map((m) => m.tags));
						const latestCreatedAt = resolveLatestDate(memories.map((m) => m.createdAt));

						// Create new merged memory
						const createResult = createMemory(
							{
								title: group.title,
								content: mergedContent,
								tags: mergedTags,
								type: 'note',
								createdAt: latestCreatedAt,
								scope:
									targetScope ??
									getDefaultWriteScope(
										cachedProjectRoot,
										getConfiguredWriteScope(),
									),
							},
							cachedProjectRoot,
						);

						if (!createResult.success) {
							results.push({
								group: group.title,
								success: false,
								error: createResult.error,
							});
							continue;
						}

						// Index the new merged file (+ embed chunks eagerly)
						await indexNewMemory(
							{ id: createResult.data!.id, type: 'note' },
							targetScope ??
								getDefaultWriteScope(
									cachedProjectRoot,
									getConfiguredWriteScope(),
								),
							cachedProjectRoot,
							indexer,
							{ embeddingProvider },
						);

						// Delete original memories and remove from index.
						// Only strip the index row if the file delete actually
						// succeeded, so we never leave phantom FTS rows
						// pointing at on-disk files (and vice versa).
						const deleteErrors: string[] = [];
						for (const memory of memories) {
							const del = deleteMemory(
								memory.id,
								'all',
								cachedProjectRoot,
							);
							if (del.success) {
								await removeFromIndex(
									memory.id,
									cachedProjectRoot,
									indexer,
								);
							} else {
								deleteErrors.push(
									`${memory.id}: ${del.error ?? 'unknown'}`,
								);
							}
						}

						results.push({
							group: group.title,
							success: true,
							newId: createResult.data!.id,
							...(deleteErrors.length > 0
								? { deleteErrors }
								: {}),
						});
					} catch (error) {
						results.push({
							group: group.title,
							success: false,
							error:
								error instanceof Error
									? error.message
									: String(error),
						});
					}
				}

				// Regenerate timeline after compact
				afterMemoryMutation(cachedProjectRoot);

				const successful = results.filter((r) => r.success).length;
				const failed = results.filter((r) => !r.success).length;

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								executed: true,
								successful,
								failed,
								results,
								message: `Compacted ${successful} group(s)${failed > 0 ? `, ${failed} failed` : ''}`,
							}),
						},
					],
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							error: "Invalid mode. Use 'analyze' or 'execute'.",
						}),
					},
				],
				isError: true,
			};
		}

		case 'clear_memories': {
			const { mode, scope, ids } = args as {
				mode: 'analyze' | 'execute';
				scope?: MemoryScope;
				ids?: string[];
			};

			// Parse ids properly - MCP sometimes passes arrays as JSON strings
			const parsedIds = parseStringArray(ids);

			if (mode === 'analyze') {
				const entries = listMemories(
					{ scope: scope ?? 'all' },
					cachedProjectRoot,
				);

				if (entries.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									analyzed: true,
									candidates: [],
									message: 'No memories found to analyze.',
								}),
							},
						],
					};
				}

				// Prepare memory summaries for AI analysis
				const memorySummaries = entries.map((e) => ({
					id: e.id,
					title: e.title,
					type: e.type,
					tags: e.tags,
					createdAt: e.createdAt,
					updatedAt: e.updatedAt,
					preview: e.content.slice(0, 300),
					scope: (e as any)._scope,
				}));

				const analysisPrompt = buildClearAnalyzePrompt(memorySummaries);

				let analysisResult: any = null;
				let usedProvider: string | null = null;

				try {
					const aiResponse = await callMemoryAI(analysisPrompt, {
						temperature: 0.1,
					});
					analysisResult = parseAIJsonResult(aiResponse.content);
					usedProvider = aiResponse.provider;
				} catch (error) {
					console.error(
						'[omc-memory] clear analyze AI call failed:',
						error,
					);
				}

				if (!analysisResult) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									analyzed: false,
									error: 'Failed to analyze memories. Proxy AI unavailable.',
								}),
							},
						],
						isError: true,
					};
				}

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								analyzed: true,
								provider: usedProvider,
								totalMemories: entries.length,
								candidates: analysisResult.candidates || [],
								keep: analysisResult.keep || [],
								message:
									"Review the deletion candidates and call clear_memories with mode='execute' and ids=[...] to delete.",
							}),
						},
					],
				};
			} else if (mode === 'execute') {
				if (!ids || ids.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									executed: false,
									error: "No IDs provided. Use mode='analyze' first to get candidates.",
								}),
							},
						],
						isError: true,
					};
				}

				// Clean up index if available
				const { indexer } = await ctx.ensureIndexer();

				const results: Array<{
					id: string;
					success: boolean;
					title?: string;
					error?: string;
				}> = [];

				for (const id of parsedIds) {
					try {
						// Get memory info before deletion for reporting
						const memResult = getMemory(
							id,
							'all',
							cachedProjectRoot,
						);
						const title = memResult.data?.title ?? id;
						const createdAt =
							memResult.data?.createdAt ??
							new Date().toISOString();
						const type = memResult.data?.type ?? 'note';
						const memScope =
							(memResult.data as any)?._scope ?? 'project';

						const deleteResult = deleteMemory(
							id,
							'all',
							cachedProjectRoot,
						);
						if (deleteResult.success) {
							// Save cleared entry for Timeline (preserves "what was done" without content/tags)
							try {
								const { saveClearedEntry } =
									await import('../../memory/timeline');
								saveClearedEntry(
									{
										id,
										title,
										createdAt,
										clearedAt: new Date().toISOString(),
										type: type as 'note' | 'session',
									},
									memScope as 'project' | 'global',
									cachedProjectRoot,
								);
							} catch (e) {
								console.error(
									'[omc-memory] saveClearedEntry failed:',
									e,
								);
							}

							// Clean index entry
							await removeFromIndex(
								id,
								cachedProjectRoot,
								indexer,
							);
							results.push({ id, success: true, title });
						} else {
							results.push({
								id,
								success: false,
								title,
								error: deleteResult.error,
							});
						}
					} catch (error) {
						results.push({
							id,
							success: false,
							error:
								error instanceof Error
									? error.message
									: String(error),
						});
					}
				}

				// Regenerate timeline after clear
				afterMemoryMutation(cachedProjectRoot);

				const deleted = results.filter((r) => r.success).length;
				const failed = results.filter((r) => !r.success).length;

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								executed: true,
								deleted,
								failed,
								results,
								message: `Cleared ${deleted} memory(s)${failed > 0 ? `, ${failed} failed` : ''}`,
							}),
						},
					],
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							error: "Invalid mode. Use 'analyze' or 'execute'.",
						}),
					},
				],
				isError: true,
			};
		}

		case 'summarize_memories': {
			const {
				mode,
				days,
				after,
				before,
				scope,
				summary,
				title,
				tags: executeTags,
				archiveOriginals,
				originalIds,
				targetScope,
				type,
				narrative,
				dateRange,
				outputType,
				createdAt: explicitCreatedAt,
			} = args as {
				mode: 'analyze' | 'execute';
				days?: number;
				after?: string;
				before?: string;
				scope?: MemoryScope;
				summary?: string;
				title?: string;
				tags?: string[];
				archiveOriginals?: boolean;
				originalIds?: string[];
				targetScope?: 'project' | 'global';
				type?: 'note' | 'session' | 'all'; // Filter by memory type
				narrative?: boolean; // Use narrative format for daily consolidation
				dateRange?: { start: string; end: string }; // Specific date range for daily narrative
				outputType?: 'note' | 'session'; // Memory type for the saved summary
				createdAt?: string; // Override date used in memory ID
			};

			// Parse originalIds properly - MCP sometimes passes arrays as JSON strings
			const parsedOriginalIds = parseStringArray(originalIds);

			if (mode === 'analyze') {
				// Calculate date range
				const now = new Date();
				let endDate: string;
				let startDate: string;

				// Support specific date range for daily narrative mode
				if (dateRange) {
					startDate = dateRange.start;
					endDate = dateRange.end;
				} else if (after) {
					startDate = after;
					endDate = before ?? now.toISOString();
				} else {
					const daysBack = days ?? 7;
					const start = new Date(now);
					start.setDate(start.getDate() - daysBack);
					startDate = start.toISOString();
					endDate = before ?? now.toISOString();
				}

				const allEntries = listMemories(
					{
						scope: scope ?? 'all',
						after: startDate,
						before: endDate,
					},
					cachedProjectRoot,
				);

				// Filter by type if specified
				const typeFilter = type ?? 'all';
				const entries =
					typeFilter === 'all'
						? allEntries
						: allEntries.filter((e) => e.type === typeFilter);

				if (entries.length === 0) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									analyzed: true,
									summary: null,
									message: `No ${typeFilter === 'all' ? '' : typeFilter + ' '}memories found in the specified date range (${startDate.slice(0, 10)} to ${endDate.slice(0, 10)}).`,
									typeFilter,
								}),
							},
						],
					};
				}

				// Prepare full memories for AI summarization
				const memoryDetails = entries.map((e) => ({
					id: e.id,
					title: e.title,
					type: e.type,
					tags: e.tags,
					createdAt: e.createdAt,
					content: e.content.slice(0, 1000),
					scope: (e as any)._scope,
				}));

				const dateRangeLabel = `${startDate.slice(0, 10)} to ${endDate.slice(0, 10)}`;
				const allOriginalTags = new Set<string>();
				for (const m of memoryDetails) {
					if (m.tags) for (const t of m.tags) allOriginalTags.add(t);
				}

				const summarizePrompt = buildSummarizeAnalyzePrompt(
					memoryDetails,
					dateRangeLabel,
					allOriginalTags,
					narrative,
				);

				let summaryResult: any = null;
				let usedProvider: string | null = null;

				try {
					const aiResponse = await callMemoryAI(summarizePrompt, {
						temperature: 0.3,
					});
					summaryResult = parseAIJsonResult(aiResponse.content);
					usedProvider = aiResponse.provider;
				} catch (error) {
					console.error(
						'[omc-memory] summarize analyze AI call failed:',
						error,
					);
				}

				if (!summaryResult) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									analyzed: false,
									error: 'Failed to summarize memories. Proxy AI unavailable.',
								}),
							},
						],
						isError: true,
					};
				}

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								analyzed: true,
								provider: usedProvider,
								dateRange: dateRangeLabel,
								memoriesIncluded: entries.length,
								originalIds: entries.map((e) => e.id),
								suggestedTitle:
									summaryResult.title ||
									`Summary: ${dateRangeLabel}`,
								suggestedSummary: summaryResult.summary || '',
								suggestedTags: summaryResult.tags || [],
								message:
									"Review the summary preview. Call summarize_memories with mode='execute' to save it.",
							}),
						},
					],
				};
			} else if (mode === 'execute') {
				if (!summary) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									executed: false,
									error: "No summary text provided. Use mode='analyze' first.",
								}),
							},
						],
						isError: true,
					};
				}

				// Create the summary memory with keyword-rich tags for retrieval
				const summaryTags =
					executeTags && executeTags.length > 0
						? executeTags
						: ['summary', 'timeline'];

				// Resolve createdAt: explicit param > auto-detect from title > now
				let resolvedCreatedAt = explicitCreatedAt;
				if (!resolvedCreatedAt && title) {
					// Auto-detect date from title like "Daily Narrative: 2026-02-14"
					const dateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
					if (dateMatch) {
						resolvedCreatedAt = `${dateMatch[1]}T00:00:00.000Z`;
					}
				}

				const { indexer, embeddingProvider } = await ctx.ensureIndexer();

				const createResult = createMemory(
					{
						title: title ?? 'Timeline Summary',
						content: summary,
						tags: summaryTags,
						type: outputType ?? 'note',
						scope:
							targetScope ??
							getDefaultWriteScope(
								cachedProjectRoot,
								getConfiguredWriteScope(),
							),
						...(resolvedCreatedAt
							? { createdAt: resolvedCreatedAt }
							: {}),
					},
					cachedProjectRoot,
				);

				if (!createResult.success) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									executed: false,
									error:
										createResult.error ??
										'Failed to create summary memory',
								}),
							},
						],
						isError: true,
					};
				}

				// Index the new summary file (+ embed chunks eagerly)
				if (createResult.data) {
					await indexNewMemory(
						{
							id: createResult.data.id,
							type: createResult.data.type,
						},
						targetScope ??
							getDefaultWriteScope(
								cachedProjectRoot,
								getConfiguredWriteScope(),
							),
						cachedProjectRoot,
						indexer,
						{ embeddingProvider },
					);
				}

				let archivedCount = 0;
				let archiveErrors = 0;

				// Delete original memories after saving summary (default: true)
				const shouldArchive = archiveOriginals !== false;
				if (shouldArchive && parsedOriginalIds.length > 0) {
					for (const id of parsedOriginalIds) {
						try {
							const deleteResult = deleteMemory(
								id,
								'all',
								cachedProjectRoot,
							);
							if (deleteResult.success) {
								await removeFromIndex(
									id,
									cachedProjectRoot,
									indexer,
								);
								archivedCount++;
							} else {
								archiveErrors++;
								console.error(
									'[omc-memory] summarize archive: delete failed for',
									id,
									deleteResult.error,
								);
							}
						} catch (e) {
							archiveErrors++;
							console.error(
								'[omc-memory] summarize archive exception for',
								id,
								e,
							);
						}
					}
				}

				// Regenerate timeline after summarize
				afterMemoryMutation(cachedProjectRoot);

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								executed: true,
								summaryId: createResult.data!.id,
								summaryTitle: title ?? 'Timeline Summary',
								tags: summaryTags,
								archived: shouldArchive ? archivedCount : 0,
								archiveErrors,
								message: `Summary saved${shouldArchive ? `. Deleted ${archivedCount} original memories` : ''}`,
							}),
						},
					],
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							error: "Invalid mode. Use 'analyze' or 'execute'.",
						}),
					},
				],
				isError: true,
			};
		}

		default:
			return undefined;
	}
}
