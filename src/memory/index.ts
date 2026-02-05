/**
 * Memory System - Barrel Export
 *
 * Markdown-first memory system for oh-my-claude.
 * Stores memories as human-readable markdown files with YAML frontmatter.
 * No external dependencies (no SQLite, no FTS5) — simple in-memory text search.
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
