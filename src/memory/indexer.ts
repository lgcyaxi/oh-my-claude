/**
 * Memory Indexer
 *
 * SQLite-based index engine using sql.js-fts5 (WASM).
 * Markdown files remain the source of truth; this is a derivative index.
 *
 * Features:
 * - FTS5 BM25 keyword search with content table + trigger sync
 * - SHA-256 hash-based change detection (skip unchanged files)
 * - Markdown chunking (~400 tokens, 80 token overlap, heading-aware)
 * - Lazy initialization (DB created on first use)
 * - Can be deleted and rebuilt from markdown files at any time
 *
 * Schema (content table pattern):
 * - files: tracks indexed files with content hashes
 * - chunks: text segments for search (+ hidden rowid)
 * - chunks_fts: FTS5 virtual table (content=chunks, auto-synced via triggers)
 * - embedding_cache: cached vector embeddings keyed by (provider, model, chunk_hash)
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  type Stats,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { MemoryScope } from "./types";
import { parseMemoryFile } from "./parser";

// ---- Types ----

export interface IndexedFile {
  path: string;
  scope: MemoryScope;
  projectRoot: string | null;
  hash: string;
  mtime: number;
  size: number;
  title: string | null;
  type: string | null;
  tags: string | null;
  createdAt: string | null;
  potentialDuplicateOf: string | null;
}

export interface IndexedChunk {
  id: string;
  path: string;
  scope: MemoryScope;
  projectRoot: string | null;
  startLine: number;
  endLine: number;
  hash: string;
  text: string;
  updatedAt: number;
}

export interface FTSSearchResult {
  chunkId: string;
  path: string;
  scope: string;
  startLine: number;
  endLine: number;
  text: string;
  rank: number;
}

export interface ChunkingOptions {
  /** Target tokens per chunk (default: 400) */
  tokens: number;
  /** Overlap tokens between chunks (default: 80) */
  overlap: number;
}

export interface MemoryIndexerOptions {
  dbPath: string;
  chunking?: Partial<ChunkingOptions>;
}

// ---- Constants ----

const DEFAULT_CHUNKING: ChunkingOptions = {
  tokens: 400,
  overlap: 80,
};

const SCHEMA_VERSION = "1";

/** Approximate characters per token for estimation */
const CHARS_PER_TOKEN = 4;

/**
 * Schema DDL statements (executed individually for robustness).
 * Uses content table pattern: chunks_fts reads from chunks table,
 * triggers keep FTS5 index in sync automatically.
 */
const SCHEMA_STATEMENTS: string[] = [
  // Metadata
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  // File tracking (hash-based change detection)
  `CREATE TABLE IF NOT EXISTS files (
    path TEXT NOT NULL,
    scope TEXT NOT NULL,
    project_root TEXT,
    hash TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL,
    title TEXT,
    type TEXT,
    tags TEXT,
    created_at TEXT,
    potential_duplicate_of TEXT,
    PRIMARY KEY (path, scope)
  )`,

  // Chunks (text segments for search; has hidden rowid for FTS5 content table)
  `CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    scope TEXT NOT NULL,
    project_root TEXT,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    hash TEXT NOT NULL,
    text TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_scope ON chunks(scope)`,

  // FTS5 full-text index (content table pattern — reads text from chunks)
  `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text,
    content=chunks,
    content_rowid=rowid
  )`,

  // Triggers to keep FTS5 in sync with chunks table
  `CREATE TRIGGER IF NOT EXISTS chunks_fts_ins AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, text) VALUES(new.rowid, new.text);
  END`,

  `CREATE TRIGGER IF NOT EXISTS chunks_fts_del AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.rowid, old.text);
  END`,

  `CREATE TRIGGER IF NOT EXISTS chunks_fts_upd AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', old.rowid, old.text);
    INSERT INTO chunks_fts(rowid, text) VALUES(new.rowid, new.text);
  END`,

  // Embedding cache (avoid re-embedding unchanged chunks)
  `CREATE TABLE IF NOT EXISTS embedding_cache (
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    hash TEXT NOT NULL,
    embedding TEXT NOT NULL,
    dims INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (provider, model, hash)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_embedding_cache_updated ON embedding_cache(updated_at)`,
];

// ---- MemoryIndexer Class ----

export class MemoryIndexer {
  private db: any = null;
  private initialized = false;
  private dirty = false;
  private options: MemoryIndexerOptions;
  private chunkingOptions: ChunkingOptions;

  constructor(options: MemoryIndexerOptions) {
    this.options = options;
    this.chunkingOptions = {
      ...DEFAULT_CHUNKING,
      ...options.chunking,
    };
  }

  /**
   * Initialize the SQLite database (lazy — call before first use).
   * Loads sql.js-fts5 WASM, opens/creates database, runs schema migration.
   * On failure, the indexer stays uninitialized (Tier 3 legacy fallback).
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to keep WASM loading lazy
      const sqlJsModule = await import("sql.js-fts5");
      const initSqlJs = sqlJsModule.default ?? sqlJsModule;

      // Use wasmBinary (pre-read file) instead of locateFile to avoid
      // Bun treating Windows file paths as URLs (ConnectionRefused error)
      const wasmPath = this.findWasmFile("sql-wasm.wasm");
      const initOptions: Record<string, any> = {};
      if (wasmPath && existsSync(wasmPath)) {
        initOptions.wasmBinary = readFileSync(wasmPath);
      } else {
        // Fallback: let sql.js try its default resolution
        initOptions.locateFile = (file: string) => this.findWasmFile(file);
      }

      const SQL = await initSqlJs(initOptions);

      // Load existing DB or create new
      if (existsSync(this.options.dbPath)) {
        const data = readFileSync(this.options.dbPath);
        this.db = new SQL.Database(new Uint8Array(data));
      } else {
        mkdirSync(dirname(this.options.dbPath), { recursive: true });
        this.db = new SQL.Database();
      }

      this.createSchema();
      this.initialized = true;
    } catch (error) {
      console.error("[indexer] Failed to initialize SQLite:", error);
      this.initialized = false;
      this.db = null;
    }
  }

  /**
   * Locate the sql-wasm.wasm file across multiple search paths.
   * Searches: node_modules (dev), install dirs, alongside script (bundled).
   */
  private findWasmFile(filename: string): string {
    const candidates: string[] = [];

    // 1. node_modules resolution (dev mode / unbundled)
    try {
      const resolved = require.resolve(`sql.js-fts5/dist/${filename}`);
      if (resolved) candidates.push(resolved);
    } catch {
      // Not in node_modules — try createRequire for ESM
      try {
        const { createRequire } = require("node:module");
        const r = createRequire(import.meta.url);
        const resolved = r.resolve(`sql.js-fts5/dist/${filename}`);
        if (resolved) candidates.push(resolved);
      } catch {
        // ignore
      }
    }

    // 2. oh-my-claude install directories
    const omcDir = join(homedir(), ".claude", "oh-my-claude");
    candidates.push(join(omcDir, "mcp", filename));
    candidates.push(join(omcDir, "wasm", filename));

    // 3. Next to the DB file (custom deployment)
    candidates.push(join(dirname(this.options.dbPath), filename));

    for (const p of candidates) {
      if (p && existsSync(p)) return p;
    }

    // Fallback: let sql.js try its default resolution
    return filename;
  }

  /**
   * Create or migrate the database schema.
   */
  private createSchema(): void {
    // Check if schema is already at current version
    try {
      const result = this.db.exec(
        "SELECT value FROM meta WHERE key = 'schema_version'"
      );
      if (
        result.length > 0 &&
        result[0].values.length > 0 &&
        result[0].values[0][0] === SCHEMA_VERSION
      ) {
        return; // Up to date
      }
    } catch {
      // meta table doesn't exist yet — need full schema creation
    }

    // Execute each DDL statement individually
    for (const stmt of SCHEMA_STATEMENTS) {
      try {
        this.db.run(stmt);
      } catch (e: any) {
        // Skip "already exists" errors (safe for idempotent schema)
        if (!e.message?.includes("already exists")) {
          console.error(`[indexer] Schema DDL error: ${e.message}`);
        }
      }
    }

    this.db.run(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
      [SCHEMA_VERSION]
    );
    this.dirty = true;
  }

  // ---- Query Helpers ----

  private queryAll(
    sql: string,
    params: any[] = []
  ): Record<string, any>[] {
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  private queryOne(
    sql: string,
    params: any[] = []
  ): Record<string, any> | null {
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    let row: Record<string, any> | null = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  // ---- Core Operations ----

  /**
   * Sync markdown files into the index.
   * Scans directories, compares hashes, indexes changed files, removes stale entries.
   */
  async syncFiles(
    memoryDirs: Array<{
      path: string;
      scope: MemoryScope;
      projectRoot?: string;
    }>
  ): Promise<{
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
  }> {
    await this.init();
    if (!this.db) return { added: 0, updated: 0, removed: 0, unchanged: 0 };

    let added = 0;
    let updated = 0;
    let removed = 0;
    let unchanged = 0;
    const seenPaths = new Set<string>();

    for (const dir of memoryDirs) {
      if (!existsSync(dir.path)) continue;

      const scope: "project" | "global" =
        dir.scope === "all" ? "project" : (dir.scope as "project" | "global");

      for (const subdir of ["notes", "sessions"]) {
        const fullDir = join(dir.path, subdir);
        if (!existsSync(fullDir)) continue;

        let files: string[];
        try {
          files = readdirSync(fullDir).filter((f) => f.endsWith(".md"));
        } catch {
          continue;
        }

        for (const file of files) {
          const filePath = join(fullDir, file);
          seenPaths.add(filePath);

          try {
            const content = readFileSync(filePath, "utf-8");
            const hash = hashContentSync(content);
            const stats = statSync(filePath);

            // Check if already indexed with same hash
            const existing = this.queryOne(
              "SELECT hash FROM files WHERE path = ? AND scope = ?",
              [filePath, scope]
            );

            if (existing && existing.hash === hash) {
              unchanged++;
              continue;
            }

            // Index or re-index this file
            this.indexFileInternal(
              filePath,
              content,
              hash,
              stats,
              scope,
              dir.projectRoot
            );

            if (existing) {
              updated++;
            } else {
              added++;
            }
          } catch (e) {
            console.error(`[indexer] Error indexing ${filePath}:`, e);
          }
        }
      }
    }

    // Remove stale entries (files no longer on disk)
    const allIndexed = this.queryAll("SELECT path, scope FROM files");
    for (const row of allIndexed) {
      if (!seenPaths.has(row.path as string)) {
        this.removeFileInternal(row.path as string);
        removed++;
      }
    }

    if (added > 0 || updated > 0 || removed > 0) {
      this.dirty = true;
    }

    return { added, updated, removed, unchanged };
  }

  /**
   * Internal: index a single file with pre-computed data
   */
  private indexFileInternal(
    filePath: string,
    content: string,
    hash: string,
    stats: Stats,
    scope: "project" | "global",
    projectRoot?: string
  ): void {
    // Parse frontmatter for metadata
    const id = basename(filePath, ".md");
    const parsed = parseMemoryFile(id, content);

    // Remove old entries for this file (triggers clean FTS5)
    this.db.run("DELETE FROM chunks WHERE path = ?", [filePath]);
    this.db.run("DELETE FROM files WHERE path = ?", [filePath]);

    // Insert file record
    this.db.run(
      `INSERT INTO files (path, scope, project_root, hash, mtime, size, title, type, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        filePath,
        scope,
        projectRoot ?? null,
        hash,
        stats.mtimeMs,
        stats.size,
        parsed?.title ?? null,
        parsed?.type ?? null,
        parsed?.tags ? JSON.stringify(parsed.tags) : null,
        parsed?.createdAt ?? null,
      ]
    );

    // Chunk content and insert (triggers auto-sync to FTS5)
    const bodyContent = parsed?.content ?? content;
    const chunks = chunkMarkdown(bodyContent, this.chunkingOptions);
    const now = Date.now();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const chunkHash = hashContentSync(chunk.text);
      const chunkId = `${hash.slice(0, 12)}:${i}`;

      this.db.run(
        `INSERT OR REPLACE INTO chunks (id, path, scope, project_root, start_line, end_line, hash, text, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chunkId,
          filePath,
          scope,
          projectRoot ?? null,
          chunk.startLine,
          chunk.endLine,
          chunkHash,
          chunk.text,
          now,
        ]
      );
    }

    this.dirty = true;
  }

  /**
   * Index a single file (public API)
   */
  async indexFile(
    filePath: string,
    scope: MemoryScope,
    projectRoot?: string
  ): Promise<void> {
    await this.init();
    if (!this.db || !existsSync(filePath)) return;

    const content = readFileSync(filePath, "utf-8");
    const hash = hashContentSync(content);
    const stats = statSync(filePath);
    const resolvedScope: "project" | "global" =
      scope === "all" ? "project" : (scope as "project" | "global");

    this.indexFileInternal(filePath, content, hash, stats, resolvedScope, projectRoot);
  }

  /**
   * Internal: remove a file from the index (triggers clean FTS5)
   */
  private removeFileInternal(filePath: string): void {
    this.db.run("DELETE FROM chunks WHERE path = ?", [filePath]);
    this.db.run("DELETE FROM files WHERE path = ?", [filePath]);
    this.dirty = true;
  }

  /**
   * Remove a file from the index (public API)
   */
  async removeFile(filePath: string): Promise<void> {
    await this.init();
    if (!this.db) return;
    this.removeFileInternal(filePath);
  }

  /**
   * FTS5 BM25 search returning ranked chunks.
   * Queries the FTS5 index and joins to chunks table for metadata.
   */
  async searchFTS(
    query: string,
    limit: number = 10,
    scope?: MemoryScope,
    projectRoot?: string
  ): Promise<FTSSearchResult[]> {
    await this.init();
    if (!this.db) return [];

    const sanitized = sanitizeFTSQuery(query);
    if (!sanitized) return [];

    try {
      // Get matching rowids with BM25 rank from FTS5
      const ftsRows = this.queryAll(
        "SELECT rowid, rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?",
        [sanitized, limit * 3] // extra for post-filtering
      );

      if (ftsRows.length === 0) return [];

      const results: FTSSearchResult[] = [];
      for (const fts of ftsRows) {
        const chunk = this.queryOne(
          "SELECT id, path, scope, project_root, start_line, end_line, text FROM chunks WHERE rowid = ?",
          [fts.rowid]
        );
        if (!chunk) continue;

        // Filter by scope
        if (scope && scope !== "all" && chunk.scope !== scope) continue;
        if (
          projectRoot &&
          chunk.scope === "project" &&
          chunk.project_root !== projectRoot
        )
          continue;

        results.push({
          chunkId: chunk.id as string,
          path: chunk.path as string,
          scope: chunk.scope as string,
          startLine: chunk.start_line as number,
          endLine: chunk.end_line as number,
          text: chunk.text as string,
          rank: fts.rank as number,
        });

        if (results.length >= limit) break;
      }

      return results;
    } catch (e) {
      console.error("[indexer] FTS search error:", e);
      return [];
    }
  }

  /**
   * Get file record by content hash (for dedup checks)
   */
  async getFileByHash(hash: string): Promise<IndexedFile | null> {
    await this.init();
    if (!this.db) return null;

    const row = this.queryOne("SELECT * FROM files WHERE hash = ?", [hash]);
    if (!row) return null;

    return {
      path: row.path as string,
      scope: row.scope as MemoryScope,
      projectRoot: row.project_root as string | null,
      hash: row.hash as string,
      mtime: row.mtime as number,
      size: row.size as number,
      title: row.title as string | null,
      type: row.type as string | null,
      tags: row.tags as string | null,
      createdAt: row.created_at as string | null,
      potentialDuplicateOf: row.potential_duplicate_of as string | null,
    };
  }

  /**
   * Get all chunk embeddings from cache for vector search.
   * Returns a map of chunkId → embedding vector.
   */
  async getEmbeddings(
    provider: string,
    model: string
  ): Promise<Map<string, number[]>> {
    await this.init();
    if (!this.db) return new Map();

    const rows = this.queryAll(
      `SELECT c.id as chunk_id, ec.embedding
       FROM embedding_cache ec
       JOIN chunks c ON c.hash = ec.hash
       WHERE ec.provider = ? AND ec.model = ?`,
      [provider, model]
    );

    const map = new Map<string, number[]>();
    for (const row of rows) {
      try {
        const vec = JSON.parse(row.embedding as string) as number[];
        map.set(row.chunk_id as string, vec);
      } catch {
        // Skip malformed embeddings
      }
    }

    return map;
  }

  /**
   * Store an embedding in the cache
   */
  async cacheEmbedding(
    provider: string,
    model: string,
    chunkHash: string,
    embedding: number[]
  ): Promise<void> {
    await this.init();
    if (!this.db) return;

    this.db.run(
      `INSERT OR REPLACE INTO embedding_cache (provider, model, hash, embedding, dims, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        provider,
        model,
        chunkHash,
        JSON.stringify(embedding),
        embedding.length,
        Date.now(),
      ]
    );
    this.dirty = true;
  }

  /**
   * Get chunks that don't have cached embeddings yet
   */
  async getChunksWithoutEmbeddings(
    provider: string,
    model: string
  ): Promise<Array<{ id: string; hash: string; text: string }>> {
    await this.init();
    if (!this.db) return [];

    return this.queryAll(
      `SELECT c.id, c.hash, c.text FROM chunks c
       WHERE c.hash NOT IN (
         SELECT ec.hash FROM embedding_cache ec
         WHERE ec.provider = ? AND ec.model = ?
       )`,
      [provider, model]
    ) as Array<{ id: string; hash: string; text: string }>;
  }

  /**
   * Check if the indexer is initialized and functional
   */
  isReady(): boolean {
    return this.initialized && this.db !== null;
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{
    filesIndexed: number;
    chunksIndexed: number;
    ftsAvailable: boolean;
    dbSizeBytes: number;
  }> {
    if (!this.isReady()) {
      return {
        filesIndexed: 0,
        chunksIndexed: 0,
        ftsAvailable: false,
        dbSizeBytes: 0,
      };
    }

    const fileCount = this.queryOne("SELECT COUNT(*) as cnt FROM files");
    const chunkCount = this.queryOne("SELECT COUNT(*) as cnt FROM chunks");

    let dbSize = 0;
    try {
      if (existsSync(this.options.dbPath)) {
        dbSize = statSync(this.options.dbPath).size;
      }
    } catch {
      // ignore
    }

    return {
      filesIndexed: (fileCount?.cnt as number) ?? 0,
      chunksIndexed: (chunkCount?.cnt as number) ?? 0,
      ftsAvailable: true,
      dbSizeBytes: dbSize,
    };
  }

  /**
   * Persist the in-memory database to disk
   */
  async flush(): Promise<void> {
    if (!this.db || !this.dirty) return;

    try {
      const data: Uint8Array = this.db.export();
      mkdirSync(dirname(this.options.dbPath), { recursive: true });
      writeFileSync(this.options.dbPath, Buffer.from(data));
      this.dirty = false;
    } catch (error) {
      console.error("[indexer] Failed to flush DB to disk:", error);
    }
  }

  /**
   * Close the database connection (flushes first)
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.flush();
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.dirty = false;
    }
  }
}

// ---- WASM Resolution (Public) ----

/**
 * Find the sql-wasm.wasm file across standard locations.
 * Used by both the MemoryIndexer and the doctor/fix-mem CLI.
 * Returns the resolved path or null if not found.
 */
export function findWasmPath(): string | null {
  const filename = "sql-wasm.wasm";
  const candidates: string[] = [];

  // 1. node_modules resolution (dev mode)
  try {
    const resolved = require.resolve(`sql.js-fts5/dist/${filename}`);
    if (resolved) candidates.push(resolved);
  } catch {
    try {
      const { createRequire } = require("node:module");
      const r = createRequire(import.meta.url);
      const resolved = r.resolve(`sql.js-fts5/dist/${filename}`);
      if (resolved) candidates.push(resolved);
    } catch {
      // ignore
    }
  }

  // 2. oh-my-claude install directories
  const omcDir = join(homedir(), ".claude", "oh-my-claude");
  candidates.push(join(omcDir, "mcp", filename));
  candidates.push(join(omcDir, "wasm", filename));

  // 3. Next to the default DB file
  candidates.push(join(omcDir, "memory", filename));

  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }

  return null;
}

// ---- Chunking Helpers ----

/**
 * Split markdown content into overlapping chunks.
 * Respects heading boundaries where possible.
 *
 * Algorithm:
 * 1. If content fits in one chunk, return as-is
 * 2. Walk lines, accumulating into chunks
 * 3. Split at headings (if enough content accumulated) or at token limit
 * 4. Apply overlap by including trailing lines from previous chunk
 * 5. Merge very small tails into the last chunk
 */
export function chunkMarkdown(
  content: string,
  options: ChunkingOptions = DEFAULT_CHUNKING
): Array<{ text: string; startLine: number; endLine: number }> {
  if (!content.trim()) return [];

  const lines = content.split("\n");
  const targetChars = options.tokens * CHARS_PER_TOKEN;
  const overlapChars = options.overlap * CHARS_PER_TOKEN;
  const headingPattern = /^#{1,6}\s/;

  // Small content: return as single chunk
  if (content.length <= targetChars * 1.3) {
    return [{ text: content, startLine: 1, endLine: lines.length }];
  }

  const chunks: Array<{
    text: string;
    startLine: number;
    endLine: number;
  }> = [];
  let currentLines: string[] = [];
  let currentStartLine = 1;
  let currentCharCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // Split at headings if we have substantial content
    if (
      headingPattern.test(line) &&
      currentLines.length > 0 &&
      currentCharCount > targetChars * 0.3
    ) {
      chunks.push({
        text: currentLines.join("\n"),
        startLine: currentStartLine,
        endLine: lineNum - 1,
      });

      // Start new chunk with overlap from previous
      const overlapLines = getOverlapLines(currentLines, overlapChars);
      currentStartLine = lineNum - overlapLines.length;
      currentLines = [...overlapLines, line];
      currentCharCount = currentLines.join("\n").length;
      continue;
    }

    currentLines.push(line);
    currentCharCount += line.length + 1; // +1 for newline

    // Split when exceeding target size
    if (currentCharCount >= targetChars) {
      chunks.push({
        text: currentLines.join("\n"),
        startLine: currentStartLine,
        endLine: lineNum,
      });

      // Start new chunk with overlap
      const overlapLines = getOverlapLines(currentLines, overlapChars);
      currentStartLine = lineNum - overlapLines.length + 1;
      currentLines = [...overlapLines];
      currentCharCount = currentLines.join("\n").length;
    }
  }

  // Flush remaining lines
  if (currentLines.length > 0) {
    if (chunks.length > 0 && currentCharCount < targetChars * 0.15) {
      // Very small tail: merge into last chunk
      const last = chunks[chunks.length - 1]!;
      last.text += "\n" + currentLines.join("\n");
      last.endLine = currentStartLine + currentLines.length - 1;
    } else {
      chunks.push({
        text: currentLines.join("\n"),
        startLine: currentStartLine,
        endLine: currentStartLine + currentLines.length - 1,
      });
    }
  }

  return chunks.length > 0
    ? chunks
    : [{ text: content, startLine: 1, endLine: lines.length }];
}

/**
 * Get trailing lines from a chunk for overlap with next chunk
 */
function getOverlapLines(
  lines: string[],
  targetOverlapChars: number
): string[] {
  if (targetOverlapChars <= 0 || lines.length === 0) return [];

  let charCount = 0;
  let startIdx = lines.length;

  for (let i = lines.length - 1; i >= 0; i--) {
    charCount += lines[i]!.length + 1;
    startIdx = i;
    if (charCount >= targetOverlapChars) break;
  }

  return lines.slice(startIdx);
}

// ---- FTS5 Query Sanitization ----

/**
 * Sanitize a user query for safe FTS5 MATCH usage.
 * Strips special characters that could cause FTS5 syntax errors.
 */
function sanitizeFTSQuery(query: string): string {
  const cleaned = query
    .replace(/[*"(){}[\]^~\\:!@#$%&+\-|<>=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) return "";

  // Join tokens with OR so any matching term produces results.
  // FTS5 default is implicit AND which is too strict for recall queries
  // (e.g., "omc ulw ultrawork permissions" would require ALL 4 tokens).
  const tokens = cleaned.split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return "";
  if (tokens.length === 1) return tokens[0]!;
  return tokens.join(" OR ");
}

// ---- Hashing ----

/**
 * Compute SHA-256 hash of content (async)
 */
export async function hashContent(content: string): Promise<string> {
  return hashContentSync(content);
}

/**
 * Compute SHA-256 hash of content (sync)
 */
export function hashContentSync(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}
