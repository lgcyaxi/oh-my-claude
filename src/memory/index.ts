/**
 * Memory System - Barrel Export
 *
 * Markdown-first memory system for oh-my-claude.
 * Stores memories as human-readable markdown files with YAML frontmatter.
 * SQLite (sql.js-fts5 WASM) provides a derivative index for FTS5 + vector search.
 * Markdown files remain the source of truth — the index can be deleted and rebuilt.
 */

// Types
export type {
	MemoryType,
	MemoryScope,
	MemoryCategory,
	MemoryEntry,
	MemoryFrontmatter,
	MemoryStorageInfo,
	MemorySearchOptions,
	MemoryListOptions,
	MemoryStats,
	MemoryResult,
	CreateMemoryInput,
	SearchTier,
	ChunkLocation,
	MemoryIndexStatus,
} from './types';

// Store (CRUD + project detection)
export {
	getMemoryDir,
	getProjectMemoryDir,
	getClaudeNativeMemoryDir,
	hasProjectMemory,
	getMemoryDirForScope,
	getDefaultWriteScope,
	ensureMemoryDirs,
	createMemory,
	getMemory,
	updateMemory,
	deleteMemory,
	listMemories,
	getMemoryStats,
	resolveCanonicalRoot,
} from './store';

// Parser
export {
	parseMemoryFile,
	serializeMemoryFile,
	generateMemoryId,
	generateTitle,
	nowISO,
	stripPrivateBlocks,
	formatLocalYYYYMMDD,
} from './parser';

// Search
export { searchMemories } from './search';
export type { SearchResult } from './search';

// Indexer (SQLite + FTS5)
export {
	MemoryIndexer,
	chunkMarkdown,
	hashContent,
	hashContentSync,
	findWasmPath,
} from './indexer';
export type {
	IndexedFile,
	IndexedChunk,
	FTSSearchResult,
	ChunkingOptions,
	MemoryIndexerOptions,
	TokenStats,
} from './indexer';

// Embeddings
export {
	createCustomEmbeddingProvider,
	createZhiPuEmbeddingProvider,
	resolveEmbeddingProvider,
	cosineSimilarity,
} from './embeddings';
export type { EmbeddingProvider, EmbeddingConfig } from './embeddings';

// Hybrid Search
export { mergeHybridResults, DEFAULT_HYBRID_WEIGHTS } from './hybrid-search';
export type {
	VectorSearchResult,
	MergedSearchResult,
	HybridSearchWeights,
} from './hybrid-search';

// Deduplication
export { checkDuplicate, DEFAULT_DEDUP_CONFIG } from './dedup';
export type { DedupResult, NearDuplicate, DedupConfig } from './dedup';

// AI Client (proxy-routed)
export { callMemoryAI } from './ai-client';
export type { MemoryAIResponse } from './ai-client';

// AI Ops Shared (prompt builders, JSON parsing, merge utilities)
export {
	parseAIJsonResult,
	mergeMemoryContent,
	deduplicateTags,
	resolveLatestDate,
	buildCompactAnalyzePrompt,
	buildClearAnalyzePrompt,
	buildSummarizeAnalyzePrompt,
	buildDailyNarrativePrompt,
	BOILERPLATE_TAGS,
} from './ai-ops-shared';
export type { MemorySummaryEntry } from './ai-ops-shared';

// Timeline
export {
	generateTimeline,
	writeTimeline,
	readTimeline,
	regenerateTimelines,
} from './timeline';
export type { TimelineOptions } from './timeline';

// Hook utilities (lightweight, Node.js built-ins only — no SQLite/WASM)
// Hooks import directly from './hooks' to avoid pulling heavy deps.
// Re-export select utilities that are useful outside hooks.
export { getTimelineContent, logUserPrompt, getControlPort } from './hooks';
export type { HookConfig, ContextMemoryState } from './hooks';
