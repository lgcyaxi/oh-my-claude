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
} from "./types";

// Store (CRUD)
export {
  getMemoryDir,
  getProjectMemoryDir,
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
} from "./store";

// Parser
export {
  parseMemoryFile,
  serializeMemoryFile,
  generateMemoryId,
  generateTitle,
  nowISO,
} from "./parser";

// Search
export { searchMemories } from "./search";
export type { SearchResult } from "./search";

// Indexer (SQLite + FTS5)
export { MemoryIndexer, chunkMarkdown, hashContent, hashContentSync, findWasmPath } from "./indexer";
export type {
  IndexedFile,
  IndexedChunk,
  FTSSearchResult,
  ChunkingOptions,
  MemoryIndexerOptions,
} from "./indexer";

// Embeddings
export {
  createCustomEmbeddingProvider,
  createZhiPuEmbeddingProvider,
  resolveEmbeddingProvider,
  cosineSimilarity,
} from "./embeddings";
export type {
  EmbeddingProvider,
  EmbeddingConfig,
} from "./embeddings";

// Hybrid Search
export { mergeHybridResults, DEFAULT_HYBRID_WEIGHTS } from "./hybrid-search";
export type {
  VectorSearchResult,
  MergedSearchResult,
  HybridSearchWeights,
} from "./hybrid-search";

// Deduplication
export { checkDuplicate, DEFAULT_DEDUP_CONFIG } from "./dedup";
export type {
  DedupResult,
  NearDuplicate,
  DedupConfig,
} from "./dedup";

// Timeline
export { generateTimeline, writeTimeline, readTimeline, regenerateTimelines } from "./timeline";
export type { TimelineOptions } from "./timeline";
