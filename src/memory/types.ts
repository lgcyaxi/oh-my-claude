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
}

/**
 * Memory store statistics
 */
export interface MemoryStats {
  /** Total memory count */
  total: number;
  /** Count by type */
  byType: Record<MemoryType, number>;
  /** Total size in bytes across all memory files */
  totalSizeBytes: number;
  /** Storage directory path */
  storagePath: string;
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
}
