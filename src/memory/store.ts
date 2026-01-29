/**
 * Memory Store
 *
 * CRUD operations for memory markdown files.
 * Storage layout:
 *   ~/.claude/oh-my-claude/memory/
 *   ├── sessions/   # Auto-archived session summaries
 *   └── notes/      # User-created persistent memories
 *
 * Each memory is a .md file with YAML frontmatter.
 * The filename (without .md) is the memory ID.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type {
  MemoryEntry,
  MemoryType,
  MemoryStats,
  MemoryResult,
  MemoryListOptions,
  CreateMemoryInput,
} from "./types";
import {
  parseMemoryFile,
  serializeMemoryFile,
  generateMemoryId,
  generateTitle,
  nowISO,
} from "./parser";

// ---- Directory helpers ----

/**
 * Root memory storage directory
 */
export function getMemoryDir(): string {
  return join(homedir(), ".claude", "oh-my-claude", "memory");
}

/**
 * Get subdirectory for a memory type
 */
function getTypeDir(type: MemoryType): string {
  const subdir = type === "session" ? "sessions" : "notes";
  return join(getMemoryDir(), subdir);
}

/**
 * Ensure the memory directory structure exists
 */
export function ensureMemoryDirs(): void {
  const root = getMemoryDir();
  mkdirSync(join(root, "sessions"), { recursive: true });
  mkdirSync(join(root, "notes"), { recursive: true });
}

// ---- CRUD operations ----

/**
 * Create a new memory entry
 */
export function createMemory(input: CreateMemoryInput): MemoryResult<MemoryEntry> {
  try {
    ensureMemoryDirs();

    const type = input.type ?? "note";
    const title = input.title || generateTitle(input.content);
    const now = nowISO();
    const id = generateMemoryId(title);

    const entry: MemoryEntry = {
      id,
      title,
      type,
      tags: input.tags ?? [],
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };

    const dir = getTypeDir(type);
    const filePath = join(dir, `${id}.md`);

    // Avoid ID collision by appending a counter
    let finalPath = filePath;
    let finalId = id;
    let counter = 1;
    while (existsSync(finalPath)) {
      finalId = `${id}-${counter}`;
      finalPath = join(dir, `${finalId}.md`);
      counter++;
    }
    entry.id = finalId;

    const markdown = serializeMemoryFile(entry);
    writeFileSync(finalPath, markdown, "utf-8");

    return { success: true, data: entry };
  } catch (error) {
    return { success: false, error: `Failed to create memory: ${error}` };
  }
}

/**
 * Read a single memory by ID
 * Searches both sessions/ and notes/ directories
 */
export function getMemory(id: string): MemoryResult<MemoryEntry> {
  try {
    for (const type of ["session", "note"] as MemoryType[]) {
      const filePath = join(getTypeDir(type), `${id}.md`);
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf-8");
        const entry = parseMemoryFile(id, raw);
        if (entry) {
          return { success: true, data: entry };
        }
      }
    }
    return { success: false, error: `Memory "${id}" not found` };
  } catch (error) {
    return { success: false, error: `Failed to read memory: ${error}` };
  }
}

/**
 * Update an existing memory entry
 */
export function updateMemory(
  id: string,
  updates: Partial<Pick<MemoryEntry, "title" | "content" | "tags">>
): MemoryResult<MemoryEntry> {
  try {
    const existing = getMemory(id);
    if (!existing.success || !existing.data) {
      return { success: false, error: existing.error ?? `Memory "${id}" not found` };
    }

    const entry = { ...existing.data };
    if (updates.title !== undefined) entry.title = updates.title;
    if (updates.content !== undefined) entry.content = updates.content;
    if (updates.tags !== undefined) entry.tags = updates.tags;
    entry.updatedAt = nowISO();

    const filePath = join(getTypeDir(entry.type), `${id}.md`);
    const markdown = serializeMemoryFile(entry);
    writeFileSync(filePath, markdown, "utf-8");

    return { success: true, data: entry };
  } catch (error) {
    return { success: false, error: `Failed to update memory: ${error}` };
  }
}

/**
 * Delete a memory by ID
 */
export function deleteMemory(id: string): MemoryResult {
  try {
    for (const type of ["session", "note"] as MemoryType[]) {
      const filePath = join(getTypeDir(type), `${id}.md`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        return { success: true };
      }
    }
    return { success: false, error: `Memory "${id}" not found` };
  } catch (error) {
    return { success: false, error: `Failed to delete memory: ${error}` };
  }
}

/**
 * List all memories with optional filtering
 */
export function listMemories(options?: MemoryListOptions): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const types: MemoryType[] = options?.type ? [options.type] : ["session", "note"];

  for (const type of types) {
    const dir = getTypeDir(type);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const id = file.replace(".md", "");
        const raw = readFileSync(join(dir, file), "utf-8");
        const entry = parseMemoryFile(id, raw);
        if (entry) {
          // Apply date filters
          if (options?.after && entry.createdAt < options.after) continue;
          if (options?.before && entry.createdAt > options.before) continue;
          entries.push(entry);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Sort by newest first
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Apply limit
  if (options?.limit && options.limit > 0) {
    return entries.slice(0, options.limit);
  }

  return entries;
}

/**
 * Get memory store statistics
 */
export function getMemoryStats(): MemoryStats {
  const stats: MemoryStats = {
    total: 0,
    byType: { session: 0, note: 0 },
    totalSizeBytes: 0,
    storagePath: getMemoryDir(),
  };

  for (const type of ["session", "note"] as MemoryType[]) {
    const dir = getTypeDir(type);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    stats.byType[type] = files.length;
    stats.total += files.length;

    for (const file of files) {
      try {
        const st = statSync(join(dir, file));
        stats.totalSizeBytes += st.size;
      } catch {
        // Skip
      }
    }
  }

  return stats;
}
