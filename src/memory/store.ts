/**
 * Memory Store
 *
 * CRUD operations for memory markdown files.
 * Storage layout:
 *   Project-specific: .claude/mem/
 *   Global: ~/.claude/oh-my-claude/memory/
 *   Both have:
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
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { cwd } from "node:process";

import type {
  MemoryEntry,
  MemoryType,
  MemoryScope,
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

// ---- Project detection helpers ----

/**
 * Find project root by looking for .git directory
 * Walks up from the given directory (or cwd()) until it finds .git or reaches root.
 *
 * @param fromDir - Explicit starting directory. Use this to avoid cwd() dependency.
 *                  Hooks should pass cwd from JSON input, MCP server should pass roots/list result.
 */
function findProjectRoot(fromDir?: string): string | null {
  let dir = fromDir ?? cwd();
  const root = dirname(dir);

  while (dir !== root) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // Reached filesystem root
    dir = parent;
  }

  // Check root directory too
  if (existsSync(join(dir, ".git"))) {
    return dir;
  }

  return null;
}

// ---- Directory helpers ----

/**
 * Get global memory storage directory
 */
export function getMemoryDir(): string {
  return join(homedir(), ".claude", "oh-my-claude", "memory");
}

/**
 * Get project memory directory (.claude/mem/)
 * Returns the path even if it doesn't exist yet (for write operations)
 * Returns null if not in a git repo
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function getProjectMemoryDir(projectRoot?: string): string | null {
  const root = projectRoot ?? findProjectRoot();
  if (!root) return null;

  return join(root, ".claude", "mem");
}

/**
 * Check if project memory directory exists
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function hasProjectMemory(projectRoot?: string): boolean {
  const dir = getProjectMemoryDir(projectRoot);
  return dir !== null && existsSync(dir);
}

/**
 * Get memory directories for a specific scope
 * Returns array of paths (project first for ranking priority)
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function getMemoryDirForScope(scope: MemoryScope, projectRoot?: string): string[] {
  const globalDir = getMemoryDir();
  const projectDir = getProjectMemoryDir(projectRoot);

  switch (scope) {
    case "project":
      return projectDir ? [projectDir] : [];
    case "global":
      return [globalDir];
    case "all":
      // Project first for ranking priority
      return projectDir ? [projectDir, globalDir] : [globalDir];
  }
}

/**
 * Determine default write scope based on environment
 * - If .claude/mem/ exists -> project
 * - If in git repo -> project (will create .claude/mem/)
 * - Otherwise -> global
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function getDefaultWriteScope(projectRoot?: string): "project" | "global" {
  if (hasProjectMemory(projectRoot)) return "project";
  if (findProjectRoot(projectRoot) !== null) return "project";
  return "global";
}

/**
 * Get subdirectory for a memory type within a base directory
 */
function getTypeDir(baseDir: string, type: MemoryType): string {
  const subdir = type === "session" ? "sessions" : "notes";
  return join(baseDir, subdir);
}

/**
 * Ensure memory directory structure exists for a scope
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function ensureMemoryDirs(scope?: MemoryScope, projectRoot?: string): void {
  const targetScope = scope ?? "all";

  if (targetScope === "project" || targetScope === "all") {
    const projectDir = getProjectMemoryDir(projectRoot);
    if (projectDir) {
      mkdirSync(join(projectDir, "sessions"), { recursive: true });
      mkdirSync(join(projectDir, "notes"), { recursive: true });
    }
  }

  if (targetScope === "global" || targetScope === "all") {
    const globalDir = getMemoryDir();
    mkdirSync(join(globalDir, "sessions"), { recursive: true });
    mkdirSync(join(globalDir, "notes"), { recursive: true });
  }
}

// ---- CRUD operations ----

/**
 * Create a new memory entry
 *
 * @param projectRoot - Explicit project root for project-scoped writes.
 *                      Avoids cwd() dependency when provided.
 */
export function createMemory(input: CreateMemoryInput, projectRoot?: string): MemoryResult<MemoryEntry> {
  try {
    // Determine write scope
    const writeScope = input.scope === "all" ? getDefaultWriteScope(projectRoot) : (input.scope ?? getDefaultWriteScope(projectRoot));

    // Determine target directory
    let targetDir: string;
    if (writeScope === "project") {
      const projectDir = getProjectMemoryDir(projectRoot);
      if (!projectDir) {
        return {
          success: false,
          error: "No project directory found. Use scope: 'global' or initialize a git repo.",
        };
      }
      targetDir = projectDir;
    } else {
      targetDir = getMemoryDir();
    }

    // Ensure directories exist
    const type = input.type ?? "note";
    const subdir = type === "session" ? "sessions" : "notes";
    mkdirSync(join(targetDir, subdir), { recursive: true });

    const title = input.title || generateTitle(input.content);
    const now = nowISO();
    // Use provided createdAt for date prefix (compact preserves original dates)
    const createdAt = input.createdAt ?? now;
    const idDate = input.createdAt ? new Date(input.createdAt) : undefined;
    const id = generateMemoryId(title, idDate);

    const entry: MemoryEntry = {
      id,
      title,
      type,
      tags: input.tags ?? [],
      content: input.content,
      createdAt,
      updatedAt: now,
    };

    const dir = getTypeDir(targetDir, type);
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
 * Searches both project and global directories, both sessions/ and notes/
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function getMemory(id: string, scope: MemoryScope = "all", projectRoot?: string): MemoryResult<MemoryEntry> {
  try {
    const dirs = getMemoryDirForScope(scope, projectRoot);

    for (const baseDir of dirs) {
      for (const type of ["session", "note"] as MemoryType[]) {
        const filePath = join(getTypeDir(baseDir, type), `${id}.md`);
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, "utf-8");
          const entry = parseMemoryFile(id, raw);
          if (entry) {
            // Add scope metadata
            const projectDir = getProjectMemoryDir(projectRoot);
            (entry as any)._scope = baseDir === projectDir ? "project" : "global";
            (entry as any)._path = filePath;
            return { success: true, data: entry };
          }
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

    // Use the path from getMemory
    const filePath = (existing.data as any)._path;
    if (!filePath) {
      return { success: false, error: "Could not determine file path for memory" };
    }

    const markdown = serializeMemoryFile(entry);
    writeFileSync(filePath, markdown, "utf-8");

    return { success: true, data: entry };
  } catch (error) {
    return { success: false, error: `Failed to update memory: ${error}` };
  }
}

/**
 * Delete a memory by ID
 * Searches both project and global directories
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function deleteMemory(id: string, scope: MemoryScope = "all", projectRoot?: string): MemoryResult {
  try {
    const dirs = getMemoryDirForScope(scope, projectRoot);

    for (const baseDir of dirs) {
      for (const type of ["session", "note"] as MemoryType[]) {
        const filePath = join(getTypeDir(baseDir, type), `${id}.md`);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
          return { success: true };
        }
      }
    }
    return { success: false, error: `Memory "${id}" not found` };
  } catch (error) {
    return { success: false, error: `Failed to delete memory: ${error}` };
  }
}

/**
 * List all memories with optional filtering
 * Supports scope filtering and ranks project memories higher
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function listMemories(options?: MemoryListOptions, projectRoot?: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const types: MemoryType[] = options?.type ? [options.type] : ["session", "note"];
  const scope = options?.scope ?? "all";
  const dirs = getMemoryDirForScope(scope, projectRoot);
  const projectDir = getProjectMemoryDir(projectRoot);

  for (const baseDir of dirs) {
    const isProjectDir = baseDir === projectDir;

    for (const type of types) {
      const dir = getTypeDir(baseDir, type);
      if (!existsSync(dir)) continue;

      const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        try {
          const id = file.replace(".md", "");
          const raw = readFileSync(join(dir, file), "utf-8");
          const entry = parseMemoryFile(id, raw);
          if (entry) {
            // Add scope metadata
            (entry as any)._scope = isProjectDir ? "project" : "global";
            (entry as any)._path = join(dir, file);

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
  }

  // Sort by newest first, with project memories ranked higher for same timestamp
  entries.sort((a, b) => {
    const timeCompare = b.createdAt.localeCompare(a.createdAt);
    if (timeCompare !== 0) return timeCompare;
    // Project memories first for same timestamp
    const aScope = (a as any)._scope;
    const bScope = (b as any)._scope;
    if (aScope === "project" && bScope === "global") return -1;
    if (aScope === "global" && bScope === "project") return 1;
    return 0;
  });

  // Apply limit
  if (options?.limit && options.limit > 0) {
    return entries.slice(0, options.limit);
  }

  return entries;
}

/**
 * Get memory store statistics
 * Includes breakdown by scope (project vs global)
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function getMemoryStats(projectRoot?: string): MemoryStats {
  const projectDir = getProjectMemoryDir(projectRoot);

  const stats: MemoryStats = {
    total: 0,
    byType: { session: 0, note: 0 },
    byScope: { project: 0, global: 0 },
    totalSizeBytes: 0,
    storagePath: getMemoryDir(),
    projectPath: projectDir ?? undefined,
  };

  // Count global memories
  const globalDir = getMemoryDir();
  for (const type of ["session", "note"] as MemoryType[]) {
    const dir = getTypeDir(globalDir, type);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    stats.byType[type] += files.length;
    stats.byScope.global += files.length;
    stats.total += files.length;

    for (const file of files) {
      try {
        const st = statSync(join(dir, file));
        stats.totalSizeBytes += st.size;
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Count project memories if exists
  if (projectDir && existsSync(projectDir)) {
    for (const type of ["session", "note"] as MemoryType[]) {
      const dir = getTypeDir(projectDir, type);
      if (!existsSync(dir)) continue;

      const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      stats.byType[type] += files.length;
      stats.byScope.project += files.length;
      stats.total += files.length;

      for (const file of files) {
        try {
          const st = statSync(join(dir, file));
          stats.totalSizeBytes += st.size;
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  return stats;
}
