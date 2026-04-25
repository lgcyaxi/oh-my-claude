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
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { cwd } from 'node:process';

import type {
	MemoryEntry,
	MemoryType,
	MemoryCategory,
	MemoryScope,
	MemoryStats,
	MemoryResult,
	MemoryListOptions,
	CreateMemoryInput,
} from './types';
import {
	parseMemoryFile,
	serializeMemoryFile,
	generateMemoryId,
	generateTitle,
	nowISO,
} from './parser';

// ---- Input normalization helpers ----

/**
 * Normalize tags/concepts input to string[].
 * AI models sometimes send a comma-separated string instead of an array,
 * or a JSON-stringified array like '["a","b"]'. Both cause character-level
 * splitting when later joined (e.g., "sidebar" → "s, i, d, e, b, a, r").
 */
function normalizeTags(input: unknown): string[] {
	if (!input) return [];
	if (Array.isArray(input)) {
		// Flatten: if any element is itself a comma-separated string, split it
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

// ---- Category inference ----

const CATEGORY_KEYWORDS: Record<MemoryCategory, string[]> = {
	architecture: [
		'architecture',
		'design',
		'data-flow',
		'component',
		'system',
		'structure',
		'diagram',
		'schema',
	],
	convention: [
		'convention',
		'standard',
		'naming',
		'style',
		'lint',
		'format',
		'code-style',
	],
	decision: [
		'decision',
		'adr',
		'trade-off',
		'tradeoff',
		'chose',
		'why',
		'rationale',
		'alternative',
	],
	debugging: [
		'debug',
		'bug',
		'fix',
		'error',
		'issue',
		'crash',
		'gotcha',
		'troubleshoot',
		'workaround',
	],
	workflow: [
		'workflow',
		'build',
		'deploy',
		'ci',
		'cd',
		'pipeline',
		'process',
		'release',
		'test',
	],
	pattern: [
		'pattern',
		'idiom',
		'recipe',
		'technique',
		'approach',
		'best-practice',
		'reusable',
	],
	reference: [
		'reference',
		'api',
		'doc',
		'config',
		'snippet',
		'example',
		'link',
		'cheatsheet',
	],
	session: ['session', 'auto-capture', 'session-end', 'context-threshold'],
	uncategorized: [],
};

/**
 * Infer a memory category from type, tags, and content keywords.
 * Returns undefined if no confident match — caller decides default.
 */
function inferCategory(
	type: MemoryType,
	tags: string[],
	content: string,
): MemoryCategory | undefined {
	if (type === 'session') return 'session';

	const lowerTags = tags.map((t) => t.toLowerCase());
	const lowerContent = content.toLowerCase().slice(0, 500);

	let bestCategory: MemoryCategory | undefined;
	let bestScore = 0;

	for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
		if (cat === 'uncategorized' || cat === 'session') continue;
		let score = 0;
		for (const kw of keywords) {
			if (lowerTags.some((t) => t.includes(kw))) score += 3;
			if (lowerContent.includes(kw)) score += 1;
		}
		if (score > bestScore) {
			bestScore = score;
			bestCategory = cat as MemoryCategory;
		}
	}

	return bestScore >= 2 ? bestCategory : undefined;
}

// ---- Memory ID validation (HIGH-11 beta.8) ----

/**
 * Raised when a caller passes a memory id that could escape the memory
 * directory (e.g. "../etc/passwd", "foo/bar", "con.md" on Windows) or
 * contain characters we'd rather not see on disk.
 *
 * We fail closed: untrusted AI tool input flows into id-based fs paths
 * via `getMemory` / `updateMemory` / `deleteMemory`, and there's no
 * legitimate reason to accept path separators, null bytes, or leading
 * dots in an id.
 */
export class MemoryIdInvalidError extends Error {
	readonly id: string;
	constructor(id: string, reason: string) {
		super(`Invalid memory id "${id}": ${reason}`);
		this.name = 'MemoryIdInvalidError';
		this.id = id;
	}
}

/** Upper bound on id length — arbitrary but comfortably longer than our
 *  generator ever produces (`generateMemoryId` outputs date-title slugs). */
const MEMORY_ID_MAX_LENGTH = 200;

/**
 * Canonical memory id shape.
 *
 * Accepts: letters, digits, underscore, dash, dot (for fraction-like
 * suffixes), colon (used by legacy chunk ids), plus the `/` forward slash
 * for rare nested suggestions — **but only if flanked by safe chars** —
 * explicitly rejected by the checks below. We keep the pattern strict and
 * tell users to rename if they hit the edge.
 */
const MEMORY_ID_PATTERN = /^[A-Za-z0-9_\-.:]+$/;

/**
 * Validate a memory id before using it in a filesystem path. Throws
 * {@link MemoryIdInvalidError} on any violation. Returns the id unchanged
 * so it can be used inline: `const safe = validateMemoryId(id);`.
 *
 * The rules intentionally overlap so we reject pathological input at the
 * earliest check:
 *  - Type check
 *  - Non-empty + length cap
 *  - No null bytes (guards against truncation-based bypasses)
 *  - No path separators or current/parent dir references
 *  - Whitelist regex (letters/digits/_-.: only)
 *  - No leading dot (reserved / dotfiles)
 */
export function validateMemoryId(id: unknown): string {
	if (typeof id !== 'string') {
		throw new MemoryIdInvalidError(String(id), 'must be a string');
	}
	if (id.length === 0) {
		throw new MemoryIdInvalidError(id, 'must be non-empty');
	}
	if (id.length > MEMORY_ID_MAX_LENGTH) {
		throw new MemoryIdInvalidError(
			id,
			`exceeds maximum length of ${MEMORY_ID_MAX_LENGTH}`,
		);
	}
	if (id.includes('\0')) {
		throw new MemoryIdInvalidError(id, 'must not contain null bytes');
	}
	if (id.includes('/') || id.includes('\\')) {
		throw new MemoryIdInvalidError(id, 'must not contain path separators');
	}
	if (id === '.' || id === '..' || id.startsWith('..')) {
		throw new MemoryIdInvalidError(
			id,
			'must not reference parent/current directory',
		);
	}
	if (id.startsWith('.')) {
		throw new MemoryIdInvalidError(id, 'must not start with a dot');
	}
	if (!MEMORY_ID_PATTERN.test(id)) {
		throw new MemoryIdInvalidError(
			id,
			'must match /^[A-Za-z0-9_\\-.:]+$/',
		);
	}
	return id;
}

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
		if (existsSync(join(dir, '.git'))) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) break; // Reached filesystem root
		dir = parent;
	}

	// Check root directory too
	if (existsSync(join(dir, '.git'))) {
		return dir;
	}

	return null;
}

/**
 * Resolve the canonical (non-worktree) repo root from any git directory.
 *
 * In a worktree, `.git` is a file containing `gitdir: /path/to/.git/worktrees/<name>`.
 * We follow this pointer to find the main repo root.
 * In a normal repo, `.git` is a directory — returns the same path.
 * Returns null if not in a git repo.
 *
 * @param projectRoot - The git root (may be a worktree). If omitted, uses findProjectRoot().
 */
export function resolveCanonicalRoot(projectRoot?: string): string | null {
	const root = projectRoot ?? findProjectRoot();
	if (!root) return null;

	const gitPath = join(root, '.git');
	if (!existsSync(gitPath)) return null;

	try {
		const stat = statSync(gitPath);
		if (stat.isDirectory()) return root; // Already canonical

		// .git is a file → worktree pointer: "gitdir: /path/to/.git/worktrees/name"
		const content = readFileSync(gitPath, 'utf-8').trim();
		const match = content.match(/^gitdir:\s*(.+)$/);
		if (!match) return null;

		const gitdir = match[1]!.trim();
		// Walk up from gitdir to find the main .git dir
		// Pattern: {repo}/.git/worktrees/{name} → extract {repo}
		const normalized = gitdir.replace(/\\/g, '/');
		const worktreesIdx = normalized.indexOf('/.git/worktrees/');
		if (worktreesIdx === -1) return null;

		return gitdir.slice(0, worktreesIdx);
	} catch {
		return null;
	}
}

// ---- Directory helpers ----

/**
 * Get global memory storage directory
 */
export function getMemoryDir(): string {
	return join(homedir(), '.claude', 'oh-my-claude', 'memory');
}

/**
 * Get Claude's native memory directory for the current project.
 * Claude Code stores memories in ~/.claude/projects/<project-hash>/memory/
 * Returns null if not in a project or directory doesn't exist.
 */
export function getClaudeNativeMemoryDir(projectRoot?: string): string | null {
	if (!projectRoot) return null;
	const claudeProjectsDir = join(homedir(), '.claude', 'projects');
	if (!existsSync(claudeProjectsDir)) return null;

	// Claude uses the full project path with slashes replaced
	const projectKey = projectRoot.replace(/\//g, '-').replace(/^-/, '');
	const nativeDir = join(claudeProjectsDir, projectKey, 'memory');
	if (existsSync(nativeDir)) return nativeDir;

	return null;
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

	return join(root, '.claude', 'mem');
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
export function getMemoryDirForScope(
	scope: MemoryScope,
	projectRoot?: string,
): string[] {
	const globalDir = getMemoryDir();
	const projectDir = getProjectMemoryDir(projectRoot);

	switch (scope) {
		case 'project':
			return projectDir ? [projectDir] : [];
		case 'global':
			return [globalDir];
		case 'all':
			// Project first for ranking priority
			return projectDir ? [projectDir, globalDir] : [globalDir];
	}
}

/**
 * Determine default write scope.
 *
 * Priority:
 * 1. configuredScope from oh-my-claude.json memory.defaultWriteScope
 *    - "project" / "global" → use directly
 *    - "auto" / undefined → fall through to auto-detect
 * 2. Auto-detect: project if in git repo, otherwise global
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 * @param configuredScope - Value from config memory.defaultWriteScope (passed by caller).
 */
export function getDefaultWriteScope(
	projectRoot?: string,
	configuredScope?: string,
): 'project' | 'global' {
	// Explicit config override (not "auto")
	if (configuredScope === 'project' || configuredScope === 'global') {
		return configuredScope;
	}

	// Auto-detect
	if (hasProjectMemory(projectRoot)) return 'project';
	if (findProjectRoot(projectRoot) !== null) return 'project';
	return 'global';
}

/**
 * Get subdirectory for a memory type within a base directory
 */
function getTypeDir(baseDir: string, type: MemoryType): string {
	const subdir = type === 'session' ? 'sessions' : 'notes';
	return join(baseDir, subdir);
}

/**
 * Ensure memory directory structure exists for a scope
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function ensureMemoryDirs(
	scope?: MemoryScope,
	projectRoot?: string,
): void {
	const targetScope = scope ?? 'all';

	if (targetScope === 'project' || targetScope === 'all') {
		const projectDir = getProjectMemoryDir(projectRoot);
		if (projectDir) {
			mkdirSync(join(projectDir, 'sessions'), { recursive: true });
			mkdirSync(join(projectDir, 'notes'), { recursive: true });
		}
	}

	if (targetScope === 'global' || targetScope === 'all') {
		const globalDir = getMemoryDir();
		mkdirSync(join(globalDir, 'sessions'), { recursive: true });
		mkdirSync(join(globalDir, 'notes'), { recursive: true });
	}
}

// ---- CRUD operations ----

/**
 * Create a new memory entry
 *
 * @param projectRoot - Explicit project root for project-scoped writes.
 *                      Avoids cwd() dependency when provided.
 */
export function createMemory(
	input: CreateMemoryInput,
	projectRoot?: string,
): MemoryResult<MemoryEntry> {
	try {
		// Determine write scope
		const writeScope =
			input.scope === 'all'
				? getDefaultWriteScope(projectRoot)
				: (input.scope ?? getDefaultWriteScope(projectRoot));

		// Determine target directory
		let targetDir: string;
		if (writeScope === 'project') {
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
		const type = input.type ?? 'note';
		const subdir = type === 'session' ? 'sessions' : 'notes';
		mkdirSync(join(targetDir, subdir), { recursive: true });

		const title = input.title || generateTitle(input.content);
		const now = nowISO();
		// Use provided createdAt for date prefix (compact preserves original dates)
		const createdAt = input.createdAt ?? now;
		const idDate = input.createdAt ? new Date(input.createdAt) : undefined;
		// generateMemoryId should produce safe ids, but validate defensively —
		// a future refactor that slips in user content would otherwise escape
		// the memory directory on disk.
		const id = validateMemoryId(generateMemoryId(title, idDate));

		const category =
			input.category ??
			inferCategory(type, normalizeTags(input.tags), input.content);

		const entry: MemoryEntry = {
			id,
			title,
			type,
			...(category && { category }),
			tags: normalizeTags(input.tags),
			...(input.concepts &&
				input.concepts.length > 0 && {
					concepts: normalizeTags(input.concepts),
				}),
			...(input.files &&
				input.files.length > 0 && { files: input.files }),
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
		writeFileSync(finalPath, markdown, 'utf-8');

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
export function getMemory(
	id: string,
	scope: MemoryScope = 'all',
	projectRoot?: string,
): MemoryResult<MemoryEntry> {
	try {
		const safeId = validateMemoryId(id);
		const dirs = getMemoryDirForScope(scope, projectRoot);

		for (const baseDir of dirs) {
			for (const type of ['session', 'note'] as MemoryType[]) {
				const filePath = join(
					getTypeDir(baseDir, type),
					`${safeId}.md`,
				);
				if (existsSync(filePath)) {
					const raw = readFileSync(filePath, 'utf-8');
					const entry = parseMemoryFile(safeId, raw);
					if (entry) {
						// Add scope metadata
						const projectDir = getProjectMemoryDir(projectRoot);
						(entry as any)._scope =
							baseDir === projectDir ? 'project' : 'global';
						(entry as any)._path = filePath;
						return { success: true, data: entry };
					}
				}
			}
		}
		return { success: false, error: `Memory "${safeId}" not found` };
	} catch (error) {
		if (error instanceof MemoryIdInvalidError) {
			return { success: false, error: error.message };
		}
		return { success: false, error: `Failed to read memory: ${error}` };
	}
}

/**
 * Update an existing memory entry
 */
export function updateMemory(
	id: string,
	updates: Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags'>>,
	projectRoot?: string,
): MemoryResult<MemoryEntry> {
	try {
		const safeId = validateMemoryId(id);
		const existing = getMemory(safeId, 'all', projectRoot);
		if (!existing.success || !existing.data) {
			return {
				success: false,
				error: existing.error ?? `Memory "${safeId}" not found`,
			};
		}

		const entry = { ...existing.data };
		if (updates.title !== undefined) entry.title = updates.title;
		if (updates.content !== undefined) entry.content = updates.content;
		if (updates.tags !== undefined) entry.tags = updates.tags;
		entry.updatedAt = nowISO();

		// Use the path from getMemory
		const filePath = (existing.data as any)._path;
		if (!filePath) {
			return {
				success: false,
				error: 'Could not determine file path for memory',
			};
		}

		const markdown = serializeMemoryFile(entry);
		writeFileSync(filePath, markdown, 'utf-8');

		return { success: true, data: entry };
	} catch (error) {
		if (error instanceof MemoryIdInvalidError) {
			return { success: false, error: error.message };
		}
		return { success: false, error: `Failed to update memory: ${error}` };
	}
}

/**
 * Delete a memory by ID
 * Searches both project and global directories
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function deleteMemory(
	id: string,
	scope: MemoryScope = 'all',
	projectRoot?: string,
): MemoryResult {
	try {
		const safeId = validateMemoryId(id);
		const dirs = getMemoryDirForScope(scope, projectRoot);

		for (const baseDir of dirs) {
			for (const type of ['session', 'note'] as MemoryType[]) {
				const filePath = join(
					getTypeDir(baseDir, type),
					`${safeId}.md`,
				);
				if (existsSync(filePath)) {
					unlinkSync(filePath);
					return { success: true };
				}
			}
		}
		return { success: false, error: `Memory "${safeId}" not found` };
	} catch (error) {
		if (error instanceof MemoryIdInvalidError) {
			return { success: false, error: error.message };
		}
		return { success: false, error: `Failed to delete memory: ${error}` };
	}
}

/**
 * List all memories with optional filtering
 * Supports scope filtering and ranks project memories higher
 *
 * @param projectRoot - Explicit project root. Avoids cwd() dependency when provided.
 */
export function listMemories(
	options?: MemoryListOptions,
	projectRoot?: string,
): MemoryEntry[] {
	const entries: MemoryEntry[] = [];
	const types: MemoryType[] = options?.type
		? [options.type]
		: ['session', 'note'];
	const scope = options?.scope ?? 'all';
	const dirs = getMemoryDirForScope(scope, projectRoot);
	const projectDir = getProjectMemoryDir(projectRoot);

	for (const baseDir of dirs) {
		const isProjectDir = baseDir === projectDir;

		for (const type of types) {
			const dir = getTypeDir(baseDir, type);
			if (!existsSync(dir)) continue;

			const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
			for (const file of files) {
				try {
					const id = file.replace('.md', '');
					const raw = readFileSync(join(dir, file), 'utf-8');
					const entry = parseMemoryFile(id, raw);
					if (entry) {
						// Add scope metadata
						(entry as any)._scope = isProjectDir
							? 'project'
							: 'global';
						(entry as any)._path = join(dir, file);

						// Apply date filters
						if (options?.after && entry.createdAt < options.after)
							continue;
						if (options?.before && entry.createdAt > options.before)
							continue;
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
		if (aScope === 'project' && bScope === 'global') return -1;
		if (aScope === 'global' && bScope === 'project') return 1;
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
	for (const type of ['session', 'note'] as MemoryType[]) {
		const dir = getTypeDir(globalDir, type);
		if (!existsSync(dir)) continue;

		const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
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
		for (const type of ['session', 'note'] as MemoryType[]) {
			const dir = getTypeDir(projectDir, type);
			if (!existsSync(dir)) continue;

			const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
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
