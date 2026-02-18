/**
 * Memory System Type Definitions
 *
 * Defines the core types for oh-my-claude's markdown-first memory system.
 * All memories are stored as human-readable markdown files with YAML frontmatter.
 */

/**
 * Memory types.
 * - session: Auto-archived session summaries
 * - note: User-created persistent memories (patterns, conventions, decisions)
 */
export type MemoryType = "session" | "note";

/**
 * Memory storage scope
 * - project: .claude/mem/ under project root
 * - global: ~/.claude/oh-my-claude/memory/
 * - all: search both (project-first ranking)
 */
export type MemoryScope = "project" | "global" | "all";

/**
 * Memory storage location info
 */
export interface MemoryStorageInfo {
  scope: MemoryScope;
  path: string;
  isProjectMemory: boolean;
}

/**
 * Core memory entry (parsed from markdown file)
 */
export interface MemoryEntry {
  /** Unique identifier (derived from filename without extension) */
  id: string;
  /** Display title */
  title: string;
  /** Memory type */
  type: MemoryType;
  /** Tags for categorization and search */
  tags: string[];
  /** Markdown body content */
  content: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
}

/**
 * YAML frontmatter fields for memory markdown files
 */
export interface MemoryFrontmatter {
  title: string;
  type: MemoryType;
  tags: string[];
  created: string;
  updated: string;
}

/**
 * Options for searching memories
 */
export interface MemorySearchOptions {
  /** Text query to match against title, content, and tags */
  query?: string;
  /** Filter by memory type */
  type?: MemoryType;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Maximum results to return */
  limit?: number;
  /** Sort order */
  sort?: "newest" | "oldest" | "relevance";
  /** Storage scope to search (default: all) */
  scope?: MemoryScope;
}

/**
 * Options for listing memories
 */
export interface MemoryListOptions {
  /** Filter by memory type */
  type?: MemoryType;
  /** Filter by date range (ISO 8601) */
  after?: string;
  /** Filter by date range (ISO 8601) */
  before?: string;
  /** Maximum results to return */
  limit?: number;
  /** Storage scope to list (default: all) */
  scope?: MemoryScope;
}

/**
 * Memory store statistics
 */
export interface MemoryStats {
  /** Total memory count */
  total: number;
  /** Count by type */
  byType: Record<MemoryType, number>;
  /** Count by scope (project vs global) */
  byScope: Record<"project" | "global", number>;
  /** Total size in bytes across all memory files */
  totalSizeBytes: number;
  /** Global storage directory path */
  storagePath: string;
  /** Project storage directory path (if in a git repo) */
  projectPath?: string;
}

/**
 * Search tier indicating which search backend was used
 */
export type SearchTier = "hybrid" | "fts5" | "legacy";

/**
 * Chunk location within a memory file
 */
export interface ChunkLocation {
  file: string;
  startLine: number;
  endLine: number;
}

/**
 * Index status metadata for a memory entry
 */
export interface MemoryIndexStatus {
  contentHash: string;
  chunksIndexed: number;
  embeddingsReady: boolean;
  potentialDuplicateOf?: string;
}

/**
 * Result of a memory operation
 */
export interface MemoryResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Input for creating a new memory
 */
export interface CreateMemoryInput {
  /** Memory content (markdown) */
  content: string;
  /** Optional title (auto-generated from content if not provided) */
  title?: string;
  /** Memory type (defaults to "note") */
  type?: MemoryType;
  /** Tags for categorization */
  tags?: string[];
  /** Storage scope (default: project if in git repo, otherwise global) */
  scope?: MemoryScope;
  /** Override creation date (used by compact to preserve original date context) */
  createdAt?: string;
}
