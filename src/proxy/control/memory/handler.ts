/**
 * Memory request dispatcher and CRUD endpoint handlers
 */

import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { jsonResponse } from '../helpers';
import type { MemoryEntry } from './types';
import { GLOBAL_MEMORY_DIR, PROJECTS_DIR, resolveMemoryPath, findOmcProjectMemDirs } from './path';
import { parseFrontmatter, readMemoryFiles } from './io';
import {
	handleDailyOperation,
	handleCompactOperation,
	handleClearOperation,
	handleSummarizeOperation,
} from './ai-ops';

/* ── Route dispatcher ── */

export async function handleMemoryRequest(
	req: Request,
	path: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const subpath = path.replace(/^\/api\/memory/, '') || '/';

	// GET /api/memory — list all memories (global + project)
	if (req.method === 'GET' && (subpath === '/' || subpath === '')) {
		return handleListMemories(corsHeaders);
	}

	// POST /api/memory/operations/:action — execute memory operations
	if (req.method === 'POST' && subpath.startsWith('/operations/')) {
		const action = subpath.replace('/operations/', '');
		return handleMemoryOperation(req, action, corsHeaders);
	}

	// GET /api/memory/:scope/:id — read single memory
	// PUT /api/memory/:scope/:id — update memory content
	// DELETE /api/memory/:scope/:id — delete memory
	const parts = subpath.slice(1).split('/');
	const scope = parts[0] as string | undefined;
	// ID is everything after the scope segment
	const id = parts.slice(1).join('/');

	if (
		!scope ||
		!id ||
		!['global', 'project', 'omc-project'].includes(scope)
	) {
		return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
	}

	if (req.method === 'GET') {
		return handleGetMemory(scope, id, corsHeaders);
	}
	if (req.method === 'PUT') {
		return handleUpdateMemory(req, scope, id, corsHeaders);
	}
	if (req.method === 'DELETE') {
		return handleDeleteMemory(scope, id, corsHeaders);
	}

	return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
}

/* ── Endpoint handlers ── */

async function handleListMemories(
	corsHeaders: Record<string, string>,
): Promise<Response> {
	// Global memories (both notes/ and sessions/)
	const globalNotes = await readMemoryFiles(
		join(GLOBAL_MEMORY_DIR, 'notes'),
		'global',
	);
	const globalSessions = await readMemoryFiles(
		join(GLOBAL_MEMORY_DIR, 'sessions'),
		'global',
	);
	// Filter session .jsonl files (only .md)
	const globalEntries = [
		...globalNotes,
		...globalSessions,
	];

	// Project memories — scan all project folders for memory/notes/
	const projectEntries: Array<MemoryEntry & { project: string }> = [];
	try {
		const projects = await readdir(PROJECTS_DIR, { withFileTypes: true });
		for (const proj of projects) {
			if (!proj.isDirectory()) continue;
			const memDir = join(PROJECTS_DIR, proj.name, 'memory');
			if (!existsSync(memDir)) continue;

			// Check for MEMORY.md (auto-memory index)
			const memoryMdPath = join(memDir, 'MEMORY.md');
			if (existsSync(memoryMdPath)) {
				try {
					const raw = await readFile(memoryMdPath, 'utf-8');
					const titleMatch = raw.match(/^#\s+(.+)$/m);
					projectEntries.push({
						id: `${proj.name}/MEMORY`,
						filename: 'MEMORY.md',
						scope: 'project',
						type: 'index',
						tags: [],
						created: '',
						title: titleMatch
							? titleMatch[1]!
							: `${proj.name} Memory`,
						content: raw,
						raw,
						project: proj.name,
					});
				} catch {
					// skip
				}
			}

			// Check for notes/ subdirectory
			const notesDir = join(memDir, 'notes');
			if (existsSync(notesDir)) {
				const notes = await readMemoryFiles(notesDir, 'project');
				for (const note of notes) {
					projectEntries.push({
						...note,
						id: `${proj.name}/${note.id}`,
						project: proj.name,
					});
				}
			}
		}
	} catch {
		// Projects dir might not exist
	}

	// omc project-scoped memories (.claude/mem/notes/ inside project roots)
	const omcProjectEntries: Array<MemoryEntry & { project: string; projectPath: string }> = [];
	try {
		const omcDirs = await findOmcProjectMemDirs();
		for (const { dir, projectName, projectPath: projPath } of omcDirs) {
			// Extract subdirectory name (notes or sessions) from path
			const subdir = dir.replace(/\\/g, '/').split('/').pop() ?? 'notes';
			const notes = await readMemoryFiles(dir, 'omc-project' as 'global');
			for (const note of notes) {
				omcProjectEntries.push({
					...note,
					scope: 'omc-project' as 'global',
					id: `omc/${projectName}/${subdir}/${note.id}`,
					project: projectName,
					projectPath: projPath,
				});
			}
		}
	} catch {
		// ignore
	}

	// Strip full content for listing (keep snippet only)
	const strip = (entries: MemoryEntry[]) =>
		entries.map((e) => ({
			...e,
			content: e.content.slice(0, 200),
			raw: '', // don't send full raw in listing
		}));

	return jsonResponse(
		{
			global: strip(globalEntries),
			project: strip(projectEntries),
			omcProject: strip(omcProjectEntries),
			total:
				globalEntries.length +
				projectEntries.length +
				omcProjectEntries.length,
		},
		200,
		corsHeaders,
	);
}

async function handleGetMemory(
	scope: string,
	id: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const filePath = resolveMemoryPath(scope, id);
	if (!filePath || !existsSync(filePath)) {
		return jsonResponse({ error: 'Memory not found' }, 404, corsHeaders);
	}

	const raw = await readFile(filePath, 'utf-8');
	const { meta, content } = parseFrontmatter(raw);
	const titleMatch = content.match(/^#\s+(.+)$/m);

	return jsonResponse(
		{
			id,
			scope,
			type: meta.type ?? 'note',
			tags: meta.tags ?? [],
			created: meta.created ?? '',
			title: titleMatch ? titleMatch[1] : id,
			content,
			raw,
		},
		200,
		corsHeaders,
	);
}

async function handleUpdateMemory(
	req: Request,
	scope: string,
	id: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const filePath = resolveMemoryPath(scope, id);
	if (!filePath) {
		return jsonResponse(
			{ error: 'Invalid memory path' },
			400,
			corsHeaders,
		);
	}

	let body: { content?: string };
	try {
		body = (await req.json()) as { content?: string };
	} catch {
		return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
	}

	if (typeof body.content !== 'string') {
		return jsonResponse(
			{ error: 'content field required' },
			400,
			corsHeaders,
		);
	}

	try {
		await writeFile(filePath, body.content, 'utf-8');
		return jsonResponse({ ok: true, id, scope }, 200, corsHeaders);
	} catch (error) {
		return jsonResponse(
			{ error: `Write failed: ${error}` },
			500,
			corsHeaders,
		);
	}
}

async function handleDeleteMemory(
	scope: string,
	id: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const filePath = resolveMemoryPath(scope, id);
	if (!filePath || !existsSync(filePath)) {
		return jsonResponse({ error: 'Memory not found' }, 404, corsHeaders);
	}

	try {
		await unlink(filePath);
		return jsonResponse({ ok: true, id, scope }, 200, corsHeaders);
	} catch (error) {
		return jsonResponse(
			{ error: `Delete failed: ${error}` },
			500,
			corsHeaders,
		);
	}
}

/**
 * POST /api/memory/operations/:action
 * Execute memory operations via the AI provider:
 *   - compact: AI-analyze and merge similar memories
 *   - summarize: Generate timeline summary from date range
 *   - clear: AI-identify outdated/redundant memories for deletion
 *   - daily: Group session notes by date, summarize with full detail, write narrative, delete originals
 */
async function handleMemoryOperation(
	req: Request,
	action: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (!['compact', 'summarize', 'clear', 'daily'].includes(action)) {
		return jsonResponse(
			{ error: `Unknown action: ${action}` },
			400,
			corsHeaders,
		);
	}

	let body: Record<string, unknown> = {};
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch {
		// empty body is fine
	}

	const controlPort = new URL(req.url).port || '18920';
	const targetProject = typeof body.projectPath === 'string' ? body.projectPath : undefined;

	// Daily gets its own dedicated handler
	if (action === 'daily') {
		return handleDailyOperation(controlPort, body, targetProject, corsHeaders);
	}

	const mode = typeof body.mode === 'string' ? body.mode : 'analyze';

	if (action === 'compact') {
		return handleCompactOperation(controlPort, body, targetProject, mode, corsHeaders);
	} else if (action === 'clear') {
		return handleClearOperation(controlPort, body, targetProject, mode, corsHeaders);
	} else if (action === 'summarize') {
		return handleSummarizeOperation(controlPort, body, targetProject, mode, corsHeaders);
	}

	return jsonResponse({ error: `Unknown action: ${action}` }, 400, corsHeaders);
}
