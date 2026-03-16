/**
 * Session management endpoints — browse Claude Code conversation history
 *
 * Data sources (layered):
 *   1. JSONL files: ~/.claude/projects/<folder>/<sessionId>.jsonl (primary, always present)
 *   2. sessions-index.json: pre-computed metadata (optional enrichment — summaries, counts)
 *
 * The index is maintained by Claude Code and may not cover all sessions,
 * so we scan JSONL files directly and enrich with index data when available.
 */

import { readdir, readFile, stat, writeFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { jsonResponse } from './helpers';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/* ── Types ── */

interface SessionIndexEntry {
	sessionId: string;
	firstPrompt: string;
	summary: string;
	messageCount: number;
	created: string;
	modified: string;
	gitBranch: string;
	projectPath: string;
	isSidechain: boolean;
}

interface SessionIndex {
	version: number;
	entries: SessionIndexEntry[];
	originalPath?: string;
}

interface ConversationEntry {
	type: string;
	uuid: string;
	timestamp: string;
	message?: {
		role: string;
		content: string | ContentBlock[];
		model?: string;
	};
	parentUuid?: string | null;
	isSidechain?: boolean;
	gitBranch?: string;
	cwd?: string;
}

interface ContentBlock {
	type: string;
	text?: string;
	thinking?: string;
	name?: string;
	input?: unknown;
	id?: string;
	content?: string | ContentBlock[];
	tool_use_id?: string;
}

/* ── Helpers ── */

/** Check if a path looks like a valid absolute path (not a mangled folder name) */
function looksLikeValidPath(p: string): boolean {
	// Windows: D:\... or C:\...
	if (/^[A-Z]:\\/.test(p)) return true;
	// Unix: /home/... or /Users/...
	if (p.startsWith('/')) return true;
	return false;
}

/**
 * Extract real project path from the first JSONL file's `cwd` field.
 * Folder names like "D--Github-blog" are ambiguous (can't distinguish
 * path separators from literal hyphens), so we read the actual cwd.
 */
async function resolveProjectPath(folder: string): Promise<string> {
	const dirPath = join(PROJECTS_DIR, folder);
	try {
		const files = await readdir(dirPath);
		const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
		if (jsonlFiles.length === 0) return folder;

		// Try up to 5 JSONL files to find a cwd (some may be empty stubs)
		for (const jsonl of jsonlFiles.slice(0, 5)) {
			const rl = createInterface({
				input: createReadStream(join(dirPath, jsonl), {
					encoding: 'utf-8',
				}),
				crlfDelay: Infinity,
			});

			let linesRead = 0;
			for await (const line of rl) {
				if (!line.trim()) continue;
				linesRead++;
				try {
					const entry = JSON.parse(line) as ConversationEntry;
					if (entry.cwd) {
						rl.close();
						return entry.cwd;
					}
				} catch {
					// skip
				}
				if (linesRead >= 10) {
					rl.close();
					break;
				}
			}
		}
	} catch {
		// fallback
	}
	return folder;
}

/** Read and parse sessions-index.json for a project folder */
async function readSessionIndex(
	folder: string,
): Promise<SessionIndex | null> {
	try {
		const indexPath = join(PROJECTS_DIR, folder, 'sessions-index.json');
		const raw = await readFile(indexPath, 'utf-8');
		return JSON.parse(raw) as SessionIndex;
	} catch {
		return null;
	}
}

/** Scan JSONL files in a project folder and return session IDs */
async function scanJsonlFiles(
	folder: string,
): Promise<Array<{ sessionId: string; filePath: string; mtime: Date }>> {
	const dirPath = join(PROJECTS_DIR, folder);
	const entries = await readdir(dirPath);
	const results: Array<{
		sessionId: string;
		filePath: string;
		mtime: Date;
	}> = [];

	for (const name of entries) {
		if (!name.endsWith('.jsonl')) continue;
		const sessionId = name.replace('.jsonl', '');
		const filePath = join(dirPath, name);
		try {
			const st = await stat(filePath);
			results.push({ sessionId, filePath, mtime: st.mtime });
		} catch {
			// skip unreadable files
		}
	}

	return results;
}

/**
 * Extract basic metadata by reading only the first ~30 lines of a JSONL file.
 * Uses file mtime for the modified timestamp (avoids full-file scan).
 */
async function extractQuickMeta(
	filePath: string,
	fileMtime: Date,
): Promise<{
	firstPrompt: string;
	created: string;
	modified: string;
	gitBranch: string;
	messageCount: number;
} | null> {
	try {
		const rl = createInterface({
			input: createReadStream(filePath, { encoding: 'utf-8' }),
			crlfDelay: Infinity,
		});

		let firstPrompt = '';
		let created = '';
		let gitBranch = '';
		let linesRead = 0;
		const MAX_LINES = 30;

		for await (const line of rl) {
			if (!line.trim()) continue;
			linesRead++;
			try {
				const entry = JSON.parse(line) as ConversationEntry;

				// Get created timestamp from first entry
				if (!created && entry.timestamp) {
					created = entry.timestamp;
				}

				// Get git branch from first entry that has it
				if (!gitBranch && entry.gitBranch) {
					gitBranch = entry.gitBranch;
				}

				// Get first user prompt
				if (
					entry.type === 'user' &&
					!firstPrompt &&
					entry.message
				) {
					const content = entry.message.content;
					if (typeof content === 'string') {
						firstPrompt = content.slice(0, 200);
					} else if (Array.isArray(content)) {
						const textBlock = content.find(
							(b) => b.type === 'text' && b.text,
						);
						if (textBlock?.text) {
							firstPrompt = textBlock.text.slice(0, 200);
						}
					}
				}
			} catch {
				// skip malformed
			}

			// Stop early once we have what we need or hit limit
			if (
				(firstPrompt && gitBranch && created) ||
				linesRead >= MAX_LINES
			) {
				rl.close();
				break;
			}
		}

		if (!created) return null;

		return {
			firstPrompt,
			created,
			modified: fileMtime.toISOString(),
			gitBranch,
			messageCount: 0, // unknown without full scan; UI will show "—"
		};
	} catch {
		return null;
	}
}

/** Parse JSONL file into conversation entries, filtering to renderable types */
async function parseConversation(
	filePath: string,
): Promise<ConversationEntry[]> {
	const entries: ConversationEntry[] = [];
	const renderableTypes = new Set(['user', 'assistant']);

	try {
		const rl = createInterface({
			input: createReadStream(filePath, { encoding: 'utf-8' }),
			crlfDelay: Infinity,
		});

		for await (const line of rl) {
			if (!line.trim()) continue;
			try {
				const entry = JSON.parse(line) as ConversationEntry;
				if (
					renderableTypes.has(entry.type) &&
					!entry.isSidechain
				) {
					entries.push(entry);
				}
			} catch {
				// skip malformed lines
			}
		}
	} catch {
		// file not found or unreadable
	}

	return entries;
}

/* ── Route dispatcher ── */

export async function handleSessionsRequest(
	req: Request,
	path: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	// Strip /api/sessions prefix
	const subpath = path.replace(/^\/api\/sessions/, '') || '/';

	// GET /api/sessions — list all projects
	if (req.method === 'GET' && (subpath === '/' || subpath === '')) {
		return handleListProjects(corsHeaders);
	}

	// Parse: /:folder, /:folder/:id, /:folder/:id/meta
	const parts = subpath.slice(1).split('/');
	const folder = decodeURIComponent(parts[0] ?? '');
	if (!folder)
		return jsonResponse({ error: 'Not found' }, 404, corsHeaders);

	if (req.method === 'GET' && parts.length === 1) {
		return handleListSessions(folder, corsHeaders);
	}

	// DELETE /api/sessions/:folder/empty — bulk delete empty stub sessions
	if (req.method === 'DELETE' && parts.length === 2 && parts[1] === 'empty') {
		return handleCleanupEmpty(folder, corsHeaders);
	}

	const sessionId = parts[1] ?? '';
	if (!sessionId)
		return jsonResponse({ error: 'Not found' }, 404, corsHeaders);

	if (req.method === 'GET' && parts.length === 2) {
		return handleGetConversation(folder, sessionId, corsHeaders);
	}

	if (req.method === 'GET' && parts.length === 3 && parts[2] === 'meta') {
		return handleGetSessionMeta(folder, sessionId, corsHeaders);
	}

	// PATCH /api/sessions/:folder/:id — rename session (update summary)
	if (req.method === 'PATCH' && parts.length === 2) {
		return handleRenameSession(req, folder, sessionId, corsHeaders);
	}

	// DELETE /api/sessions/:folder/:id — delete session
	if (req.method === 'DELETE' && parts.length === 2) {
		return handleDeleteSession(folder, sessionId, corsHeaders);
	}

	return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
}

/* ── Endpoint handlers ── */

async function handleListProjects(
	corsHeaders: Record<string, string>,
): Promise<Response> {
	try {
		const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
		const projects: Array<{
			folder: string;
			projectPath: string;
			sessionCount: number;
			lastModified: string | null;
		}> = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			// Count JSONL files (primary source)
			const jsonlFiles = await scanJsonlFiles(entry.name);
			if (jsonlFiles.length === 0) continue;

			// Get project path — prefer JSONL cwd (reliable) over index (may have bad paths)
			const index = await readSessionIndex(entry.name);
			const candidatePath =
				index?.originalPath ?? index?.entries[0]?.projectPath;
			const projectPath =
				candidatePath && looksLikeValidPath(candidatePath)
					? candidatePath
					: (await resolveProjectPath(entry.name));

			// Use most recent mtime from JSONL files
			const latestMtime = jsonlFiles.reduce(
				(max, f) => (f.mtime > max ? f.mtime : max),
				jsonlFiles[0]!.mtime,
			);

			projects.push({
				folder: entry.name,
				projectPath,
				sessionCount: jsonlFiles.length,
				lastModified: latestMtime.toISOString(),
			});
		}

		// Sort by last modified desc
		projects.sort((a, b) => {
			if (!a.lastModified) return 1;
			if (!b.lastModified) return -1;
			return (
				new Date(b.lastModified).getTime() -
				new Date(a.lastModified).getTime()
			);
		});

		return jsonResponse({ projects }, 200, corsHeaders);
	} catch (error) {
		return jsonResponse(
			{ error: 'Failed to scan projects', detail: String(error) },
			500,
			corsHeaders,
		);
	}
}

async function handleListSessions(
	folder: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	// Scan JSONL files as primary source
	let jsonlFiles: Array<{
		sessionId: string;
		filePath: string;
		mtime: Date;
	}>;
	try {
		jsonlFiles = await scanJsonlFiles(folder);
	} catch {
		return jsonResponse(
			{ error: 'Project folder not found' },
			404,
			corsHeaders,
		);
	}

	if (jsonlFiles.length === 0) {
		return jsonResponse(
			{ error: 'No sessions found in project' },
			404,
			corsHeaders,
		);
	}

	// Load index for enrichment (summaries, etc.)
	const index = await readSessionIndex(folder);
	const indexMap = new Map<string, SessionIndexEntry>();
	if (index) {
		for (const e of index.entries) {
			indexMap.set(e.sessionId, e);
		}
	}

	// Build session list — use index metadata if available, otherwise extract from JSONL
	const sessions: Array<{
		sessionId: string;
		firstPrompt: string;
		summary: string;
		messageCount: number;
		created: string;
		modified: string;
		gitBranch: string;
		isSidechain: boolean;
	}> = [];

	for (const file of jsonlFiles) {
		const indexed = indexMap.get(file.sessionId);

		if (indexed) {
			// Use pre-computed index data
			sessions.push({
				sessionId: indexed.sessionId,
				firstPrompt: indexed.firstPrompt,
				summary: indexed.summary,
				messageCount: indexed.messageCount,
				created: indexed.created,
				modified: indexed.modified,
				gitBranch: indexed.gitBranch,
				isSidechain: indexed.isSidechain,
			});
		} else {
			// Extract basic metadata from JSONL (fast: reads ~30 lines)
			const meta = await extractQuickMeta(file.filePath, file.mtime);
			if (meta) {
				sessions.push({
					sessionId: file.sessionId,
					firstPrompt: meta.firstPrompt,
					summary: '',
					messageCount: meta.messageCount,
					created: meta.created,
					modified: meta.modified,
					gitBranch: meta.gitBranch,
					isSidechain: false,
				});
			} else {
				// File exists but couldn't extract metadata
				sessions.push({
					sessionId: file.sessionId,
					firstPrompt: '',
					summary: '',
					messageCount: 0,
					created: file.mtime.toISOString(),
					modified: file.mtime.toISOString(),
					gitBranch: '',
					isSidechain: false,
				});
			}
		}
	}

	// Sort by modified desc
	sessions.sort(
		(a, b) =>
			new Date(b.modified).getTime() - new Date(a.modified).getTime(),
	);

	const candidatePath =
		index?.originalPath ?? index?.entries[0]?.projectPath;
	const projectPath =
		candidatePath && looksLikeValidPath(candidatePath)
			? candidatePath
			: (await resolveProjectPath(folder));

	return jsonResponse(
		{ folder, projectPath, sessions },
		200,
		corsHeaders,
	);
}

async function handleGetConversation(
	folder: string,
	sessionId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const filePath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);

	if (!existsSync(filePath)) {
		return jsonResponse(
			{ error: 'Session not found' },
			404,
			corsHeaders,
		);
	}

	const entries = await parseConversation(filePath);

	// Get metadata from index if available
	const index = await readSessionIndex(folder);
	const indexEntry = index?.entries.find(
		(e) => e.sessionId === sessionId,
	);

	const meta = indexEntry
		? {
				summary: indexEntry.summary,
				firstPrompt: indexEntry.firstPrompt,
				messageCount: indexEntry.messageCount,
				created: indexEntry.created,
				modified: indexEntry.modified,
				gitBranch: indexEntry.gitBranch,
			}
		: null;

	return jsonResponse(
		{ sessionId, folder, meta, entries },
		200,
		corsHeaders,
	);
}

async function handleGetSessionMeta(
	folder: string,
	sessionId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	// Try index first
	const index = await readSessionIndex(folder);
	const indexEntry = index?.entries.find(
		(e) => e.sessionId === sessionId,
	);

	if (indexEntry) {
		return jsonResponse(
			{
				sessionId: indexEntry.sessionId,
				summary: indexEntry.summary,
				firstPrompt: indexEntry.firstPrompt,
				messageCount: indexEntry.messageCount,
				created: indexEntry.created,
				modified: indexEntry.modified,
				gitBranch: indexEntry.gitBranch,
				projectPath: indexEntry.projectPath,
				isSidechain: indexEntry.isSidechain,
			},
			200,
			corsHeaders,
		);
	}

	// Fallback: extract from JSONL
	const filePath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
	let fileMtime = new Date();
	try {
		fileMtime = (await stat(filePath)).mtime;
	} catch { /* use now */ }
	const meta = await extractQuickMeta(filePath, fileMtime);
	if (!meta) {
		return jsonResponse(
			{ error: 'Session not found' },
			404,
			corsHeaders,
		);
	}

	return jsonResponse(
		{
			sessionId,
			summary: '',
			firstPrompt: meta.firstPrompt,
			messageCount: meta.messageCount,
			created: meta.created,
			modified: meta.modified,
			gitBranch: meta.gitBranch,
			projectPath: await resolveProjectPath(folder),
			isSidechain: false,
		},
		200,
		corsHeaders,
	);
}

/** PATCH /api/sessions/:folder/:id — rename session (update summary) */
async function handleRenameSession(
	req: Request,
	folder: string,
	sessionId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	let body: { summary?: string };
	try {
		body = (await req.json()) as { summary?: string };
	} catch {
		return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
	}

	if (!body.summary || typeof body.summary !== 'string') {
		return jsonResponse(
			{ error: 'Missing or invalid "summary" field' },
			400,
			corsHeaders,
		);
	}

	const newSummary = body.summary.trim();
	if (!newSummary) {
		return jsonResponse(
			{ error: 'Summary cannot be empty' },
			400,
			corsHeaders,
		);
	}

	// Verify session JSONL exists
	const jsonlPath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
	if (!existsSync(jsonlPath)) {
		return jsonResponse(
			{ error: 'Session not found' },
			404,
			corsHeaders,
		);
	}

	// Update sessions-index.json
	const indexPath = join(PROJECTS_DIR, folder, 'sessions-index.json');

	try {
		const raw = await readFile(indexPath, 'utf-8');
		const index = JSON.parse(raw) as SessionIndex;
		const entry = index.entries.find((e) => e.sessionId === sessionId);

		if (entry) {
			entry.summary = newSummary;
		} else {
			// Session not in index — add a minimal entry
			const fileMtime = (await stat(jsonlPath)).mtime;
			const meta = await extractQuickMeta(jsonlPath, fileMtime);
			index.entries.push({
				sessionId,
				firstPrompt: meta?.firstPrompt ?? '',
				summary: newSummary,
				messageCount: meta?.messageCount ?? 0,
				created: meta?.created ?? fileMtime.toISOString(),
				modified: fileMtime.toISOString(),
				gitBranch: meta?.gitBranch ?? '',
				projectPath: index.originalPath ?? await resolveProjectPath(folder),
				isSidechain: false,
			});
		}

		await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
	} catch {
		// No index file — create one with this single entry
		const fileMtime = (await stat(jsonlPath)).mtime;
		const meta = await extractQuickMeta(jsonlPath, fileMtime);
		const newIndex: SessionIndex = {
			version: 1,
			entries: [
				{
					sessionId,
					firstPrompt: meta?.firstPrompt ?? '',
					summary: newSummary,
					messageCount: meta?.messageCount ?? 0,
					created: meta?.created ?? fileMtime.toISOString(),
					modified: fileMtime.toISOString(),
					gitBranch: meta?.gitBranch ?? '',
					projectPath: await resolveProjectPath(folder),
					isSidechain: false,
				},
			],
		};
		await writeFile(
			indexPath,
			JSON.stringify(newIndex, null, 2),
			'utf-8',
		);
	}

	return jsonResponse(
		{ ok: true, sessionId, summary: newSummary },
		200,
		corsHeaders,
	);
}

/** DELETE /api/sessions/:folder/:id — delete session JSONL and remove from index */
async function handleDeleteSession(
	folder: string,
	sessionId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const jsonlPath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
	const sessionDir = join(PROJECTS_DIR, folder, sessionId);

	if (!existsSync(jsonlPath)) {
		return jsonResponse({ error: 'Session not found' }, 404, corsHeaders);
	}

	// Remove JSONL file
	try {
		await unlink(jsonlPath);
	} catch (error) {
		return jsonResponse(
			{ error: `Failed to delete: ${error}` },
			500,
			corsHeaders,
		);
	}

	// Remove session directory (subagents, etc.) if it exists
	if (existsSync(sessionDir)) {
		try {
			await rm(sessionDir, { recursive: true });
		} catch {
			// Non-critical
		}
	}

	// Remove from sessions-index.json if present
	try {
		const indexPath = join(PROJECTS_DIR, folder, 'sessions-index.json');
		const raw = await readFile(indexPath, 'utf-8');
		const index = JSON.parse(raw) as SessionIndex;
		const before = index.entries.length;
		index.entries = index.entries.filter(
			(e) => e.sessionId !== sessionId,
		);
		if (index.entries.length < before) {
			await writeFile(
				indexPath,
				JSON.stringify(index, null, 2),
				'utf-8',
			);
		}
	} catch {
		// No index or parse error — JSONL already deleted, good enough
	}

	return jsonResponse({ ok: true, sessionId }, 200, corsHeaders);
}

/** DELETE /api/sessions/:folder/empty — bulk delete empty stub sessions */
async function handleCleanupEmpty(
	folder: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const jsonlFiles = await scanJsonlFiles(folder);
	const deleted: string[] = [];

	for (const file of jsonlFiles) {
		const meta = await extractQuickMeta(file.filePath, file.mtime);
		// Empty = no firstPrompt found in first 30 lines
		if (!meta || !meta.firstPrompt) {
			try {
				await unlink(file.filePath);
				// Also remove session directory if exists
				const sessionDir = join(
					PROJECTS_DIR,
					folder,
					file.sessionId,
				);
				if (existsSync(sessionDir)) {
					await rm(sessionDir, { recursive: true });
				}
				deleted.push(file.sessionId);
			} catch {
				// skip failures
			}
		}
	}

	// Clean up sessions-index.json
	if (deleted.length > 0) {
		try {
			const indexPath = join(
				PROJECTS_DIR,
				folder,
				'sessions-index.json',
			);
			const raw = await readFile(indexPath, 'utf-8');
			const index = JSON.parse(raw) as SessionIndex;
			const deletedSet = new Set(deleted);
			const before = index.entries.length;
			index.entries = index.entries.filter(
				(e) => !deletedSet.has(e.sessionId),
			);
			if (index.entries.length < before) {
				await writeFile(
					indexPath,
					JSON.stringify(index, null, 2),
					'utf-8',
				);
			}
		} catch {
			// No index — fine
		}
	}

	return jsonResponse(
		{ ok: true, deleted: deleted.length, sessionIds: deleted },
		200,
		corsHeaders,
	);
}
