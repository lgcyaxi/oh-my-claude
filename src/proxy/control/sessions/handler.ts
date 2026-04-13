/**
 * Session request dispatcher and CRUD endpoint handlers
 */

import { readdir, readFile, writeFile, stat, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { jsonResponse } from '../helpers';
import type { SessionIndex } from './types';
import {
	PROJECTS_DIR,
	looksLikeValidPath,
	resolveProjectPath,
	readSessionIndex,
	scanJsonlFiles,
} from './path';
import { extractQuickMeta, parseConversation, countMessages } from './parser';
import { handleAiRename } from './ai-rename';

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

	// DELETE /api/sessions/:folder — remove project folder (only if no real sessions)
	if (req.method === 'DELETE' && parts.length === 1) {
		return handleDeleteProject(folder, corsHeaders);
	}

	// DELETE /api/sessions/:folder/empty — bulk delete empty stub sessions
	if (req.method === 'DELETE' && parts.length === 2 && parts[1] === 'empty') {
		return handleCleanupEmpty(folder, corsHeaders);
	}

	// DELETE /api/sessions/:folder/old — delete sessions older than N days (default 15)
	if (req.method === 'DELETE' && parts.length === 2 && parts[1] === 'old') {
		const url = new URL(req.url, 'http://localhost');
		const days = parseInt(url.searchParams.get('days') ?? '15', 10);
		return handleCleanupOld(folder, days, corsHeaders);
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

	// POST /api/sessions/:folder/:id/ai-rename — AI-powered rename
	if (req.method === 'POST' && parts.length === 3 && parts[2] === 'ai-rename') {
		return handleAiRename(req, folder, sessionId, corsHeaders);
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

			// Count sessions (flat JSONL + directory-based + index-only)
			const sessionEntries = await scanJsonlFiles(entry.name);
			const index = await readSessionIndex(entry.name);

			// Count unique sessions from both disk and index
			const diskIds = new Set(sessionEntries.map((e) => e.sessionId));
			const indexOnlyCount = index
				? index.entries.filter((e) => !diskIds.has(e.sessionId)).length
				: 0;
			const totalCount = sessionEntries.length + indexOnlyCount;
			if (totalCount === 0) continue;

			// Get project path — prefer index (reliable) over directory name
			const candidatePath =
				index?.originalPath ?? index?.entries[0]?.projectPath;
			const projectPath =
				candidatePath && looksLikeValidPath(candidatePath)
					? candidatePath
					: (await resolveProjectPath(entry.name));

			// Use most recent mtime — from disk entries or index modified dates
			let latestMtime: Date;
			if (sessionEntries.length > 0) {
				latestMtime = sessionEntries.reduce(
					(max, f) => (f.mtime > max ? f.mtime : max),
					sessionEntries[0]!.mtime,
				);
			} else if (index && index.entries.length > 0) {
				// All sessions are index-only — use latest modified from index
				latestMtime = index.entries.reduce(
					(max, e) => {
						const d = new Date(e.modified);
						return d > max ? d : max;
					},
					new Date(index.entries[0]!.modified),
				);
			} else {
				latestMtime = new Date();
			}

			projects.push({
				folder: entry.name,
				projectPath,
				sessionCount: totalCount,
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
	// Scan both flat JSONL files and directory-based sessions
	let sessionEntries: import('./path').SessionFileEntry[];
	try {
		sessionEntries = await scanJsonlFiles(folder);
	} catch {
		return jsonResponse(
			{ error: 'Project folder not found' },
			404,
			corsHeaders,
		);
	}

	// Load index for enrichment (summaries, etc.)
	const index = await readSessionIndex(folder);
	const indexMap = new Map<string, import('./types').SessionIndexEntry>();
	if (index) {
		for (const e of index.entries) {
			indexMap.set(e.sessionId, e);
		}
	}

	// If no files on disk but index has entries, show index-only archive sessions
	if (sessionEntries.length === 0 && indexMap.size === 0) {
		return jsonResponse(
			{ error: 'No sessions found in project' },
			404,
			corsHeaders,
		);
	}

	// Build session list — index is primary for directory-based sessions
	const sessions: Array<{
		sessionId: string;
		firstPrompt: string;
		summary: string;
		messageCount: number;
		created: string;
		modified: string;
		gitBranch: string;
		isSidechain: boolean;
		isArchive: boolean;
	}> = [];

	for (const entry of sessionEntries) {
		const indexed = indexMap.get(entry.sessionId);

		if (indexed) {
			// Use pre-computed index data (works for both flat and directory sessions)
			sessions.push({
				sessionId: indexed.sessionId,
				firstPrompt: indexed.firstPrompt,
				summary: indexed.summary,
				messageCount: indexed.messageCount,
				created: indexed.created,
				modified: indexed.modified,
				gitBranch: indexed.gitBranch,
				isSidechain: indexed.isSidechain,
				isArchive: entry.isDirectory,
			});
		} else if (entry.filePath) {
			// Flat JSONL — extract basic metadata (fast: reads ~30 lines)
			const meta = await extractQuickMeta(entry.filePath, entry.mtime);
			if (meta) {
				sessions.push({
					sessionId: entry.sessionId,
					firstPrompt: meta.firstPrompt,
					summary: '',
					messageCount: meta.messageCount,
					created: meta.created,
					modified: meta.modified,
					gitBranch: meta.gitBranch,
					isSidechain: false,
					isArchive: false,
				});
			} else {
				sessions.push({
					sessionId: entry.sessionId,
					firstPrompt: '',
					summary: '',
					messageCount: 0,
					created: entry.mtime.toISOString(),
					modified: entry.mtime.toISOString(),
					gitBranch: '',
					isSidechain: false,
					isArchive: false,
				});
			}
		} else {
			// Directory-based session with no index entry — use directory mtime
			sessions.push({
				sessionId: entry.sessionId,
				firstPrompt: '',
				summary: '',
				messageCount: 0,
				created: entry.mtime.toISOString(),
				modified: entry.mtime.toISOString(),
				gitBranch: '',
				isSidechain: false,
				isArchive: true,
			});
		}
	}

	// Add index-only sessions (in index but no file/directory on disk)
	const onDiskIds = new Set(sessionEntries.map((e) => e.sessionId));
	for (const [id, indexed] of indexMap) {
		if (onDiskIds.has(id)) continue;
		sessions.push({
			sessionId: indexed.sessionId,
			firstPrompt: indexed.firstPrompt,
			summary: indexed.summary,
			messageCount: indexed.messageCount,
			created: indexed.created,
			modified: indexed.modified,
			gitBranch: indexed.gitBranch,
			isSidechain: indexed.isSidechain,
			isArchive: true,
		});
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
	const sessionDir = join(PROJECTS_DIR, folder, sessionId);

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

	// Try flat JSONL first
	if (existsSync(filePath)) {
		const entries = await parseConversation(filePath);
		return jsonResponse(
			{ sessionId, folder, meta, entries },
			200,
			corsHeaders,
		);
	}

	// Directory-based session — return metadata only (main conversation not on disk)
	if (existsSync(sessionDir)) {
		return jsonResponse(
			{
				sessionId,
				folder,
				meta,
				entries: [],
				isArchive: true,
				message: 'Session conversation data is managed by Claude Code and not available for replay.',
			},
			200,
			corsHeaders,
		);
	}

	return jsonResponse(
		{ error: 'Session not found' },
		404,
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

	// Fallback: try flat JSONL, then directory
	const filePath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
	const sessionDir = join(PROJECTS_DIR, folder, sessionId);

	if (existsSync(filePath)) {
		let fileMtime = new Date();
		try {
			fileMtime = (await stat(filePath)).mtime;
		} catch { /* use now */ }
		const meta = await extractQuickMeta(filePath, fileMtime);
		if (meta) {
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
	}

	// Directory-based session — return minimal metadata
	if (existsSync(sessionDir)) {
		let dirMtime = new Date();
		try {
			dirMtime = (await stat(sessionDir)).mtime;
		} catch { /* use now */ }
		return jsonResponse(
			{
				sessionId,
				summary: '',
				firstPrompt: '',
				messageCount: 0,
				created: dirMtime.toISOString(),
				modified: dirMtime.toISOString(),
				gitBranch: '',
				projectPath: await resolveProjectPath(folder),
				isSidechain: false,
				isArchive: true,
			},
			200,
			corsHeaders,
		);
	}

	return jsonResponse(
		{ error: 'Session not found' },
		404,
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

	// Verify session exists (flat JSONL or directory)
	const jsonlPath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
	const sessionDir = join(PROJECTS_DIR, folder, sessionId);
	const hasJsonl = existsSync(jsonlPath);
	const hasDir = existsSync(sessionDir);

	if (!hasJsonl && !hasDir) {
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
			let fileMtime = new Date();
			let meta: Awaited<ReturnType<typeof extractQuickMeta>> = null;
			if (hasJsonl) {
				fileMtime = (await stat(jsonlPath)).mtime;
				meta = await extractQuickMeta(jsonlPath, fileMtime);
			} else if (hasDir) {
				fileMtime = (await stat(sessionDir)).mtime;
			}
			const msgCount = hasJsonl ? await countMessages(jsonlPath) : 0;
			index.entries.push({
				sessionId,
				firstPrompt: meta?.firstPrompt ?? '',
				summary: newSummary,
				messageCount: msgCount,
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
		let fileMtime = new Date();
		let meta: Awaited<ReturnType<typeof extractQuickMeta>> = null;
		if (hasJsonl) {
			fileMtime = (await stat(jsonlPath)).mtime;
			meta = await extractQuickMeta(jsonlPath, fileMtime);
		} else if (hasDir) {
			fileMtime = (await stat(sessionDir)).mtime;
		}
		const msgCount = hasJsonl ? await countMessages(jsonlPath) : 0;
		const newIndex: SessionIndex = {
			version: 1,
			entries: [
				{
					sessionId,
					firstPrompt: meta?.firstPrompt ?? '',
					summary: newSummary,
					messageCount: msgCount,
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

/** DELETE /api/sessions/:folder/:id — delete session JSONL, directory, and/or index entry */
async function handleDeleteSession(
	folder: string,
	sessionId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const jsonlPath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
	const sessionDir = join(PROJECTS_DIR, folder, sessionId);
	const hasJsonl = existsSync(jsonlPath);
	const hasDir = existsSync(sessionDir);

	// Check if session exists on disk OR in the index
	let hasIndexEntry = false;
	if (!hasJsonl && !hasDir) {
		const index = await readSessionIndex(folder);
		hasIndexEntry = !!index?.entries.some((e) => e.sessionId === sessionId);
		if (!hasIndexEntry) {
			return jsonResponse({ error: 'Session not found' }, 404, corsHeaders);
		}
	}

	// Remove JSONL file if it exists
	if (hasJsonl) {
		try {
			await unlink(jsonlPath);
		} catch (error) {
			return jsonResponse(
				{ error: `Failed to delete: ${error}` },
				500,
				corsHeaders,
			);
		}
	}

	// Remove session directory (subagents, etc.) if it exists
	if (hasDir) {
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
		// For directory-only sessions without index data, treat as empty
		const meta = file.filePath ? await extractQuickMeta(file.filePath, file.mtime) : null;
		// Empty = no firstPrompt found in first 30 lines (or directory-only with no index)
		if (!meta || !meta.firstPrompt) {
			try {
				if (file.filePath) await unlink(file.filePath);
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

	// Clean up sessions-index.json: remove deleted entries + orphaned index-only entries
	try {
		const indexPath = join(PROJECTS_DIR, folder, 'sessions-index.json');
		const raw = await readFile(indexPath, 'utf-8');
		const index = JSON.parse(raw) as SessionIndex;
		const deletedSet = new Set(deleted);
		const onDiskIds = new Set(jsonlFiles.map((f) => f.sessionId));
		const before = index.entries.length;
		index.entries = index.entries.filter((e) => {
			// Remove explicitly deleted sessions
			if (deletedSet.has(e.sessionId)) return false;
			// Remove orphaned index-only entries with no firstPrompt (empty stubs)
			if (!onDiskIds.has(e.sessionId) && !e.firstPrompt) {
				deleted.push(e.sessionId);
				return false;
			}
			return true;
		});
		if (index.entries.length < before) {
			await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
		}
	} catch {
		// No index — fine
	}

	return jsonResponse(
		{ ok: true, deleted: deleted.length, sessionIds: deleted },
		200,
		corsHeaders,
	);
}

/** DELETE /api/sessions/:folder/old?days=15 — delete sessions older than N days */
async function handleCleanupOld(
	folder: string,
	days: number,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	// Compare by calendar date only (truncate to midnight) so "15 days" means 16+ calendar days ago
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const cutoff = today.getTime() - days * 86400000;
	const jsonlFiles = await scanJsonlFiles(folder);
	const deleted: string[] = [];

	for (const file of jsonlFiles) {
		const mday = new Date(file.mtime);
		mday.setHours(0, 0, 0, 0);
		if (mday.getTime() < cutoff) {
			try {
				if (file.filePath) await unlink(file.filePath);
				const sessionDir = join(PROJECTS_DIR, folder, file.sessionId);
				if (existsSync(sessionDir)) {
					await rm(sessionDir, { recursive: true });
				}
				deleted.push(file.sessionId);
			} catch { /* skip */ }
		}
	}

	// Clean up sessions-index.json: remove deleted entries + old index-only orphans
	try {
		const indexPath = join(PROJECTS_DIR, folder, 'sessions-index.json');
		const raw = await readFile(indexPath, 'utf-8');
		const index = JSON.parse(raw) as SessionIndex;
		const deletedSet = new Set(deleted);
		const onDiskIds = new Set(jsonlFiles.map((f) => f.sessionId));
		const before = index.entries.length;
		index.entries = index.entries.filter((e) => {
			if (deletedSet.has(e.sessionId)) return false;
			// Also remove old index-only orphans past cutoff
			if (!onDiskIds.has(e.sessionId)) {
				const mday = new Date(e.modified);
				mday.setHours(0, 0, 0, 0);
				if (mday.getTime() < cutoff) {
					deleted.push(e.sessionId);
					return false;
				}
			}
			return true;
		});
		if (index.entries.length < before) {
			await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
		}
	} catch { /* no index */ }

	return jsonResponse(
		{ ok: true, deleted: deleted.length, sessionIds: deleted, days },
		200,
		corsHeaders,
	);
}

/** DELETE /api/sessions/:folder — remove entire project folder */
async function handleDeleteProject(
	folder: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const dirPath = join(PROJECTS_DIR, folder);

	if (!existsSync(dirPath)) {
		return jsonResponse({ error: 'Project not found' }, 404, corsHeaders);
	}

	try {
		await rm(dirPath, { recursive: true });
		return jsonResponse({ ok: true, folder }, 200, corsHeaders);
	} catch (error) {
		return jsonResponse(
			{ error: `Failed to delete project: ${error}` },
			500,
			corsHeaders,
		);
	}
}
