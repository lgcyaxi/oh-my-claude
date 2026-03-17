/**
 * Preferences API for the web dashboard
 *
 * Storage: ~/.claude/oh-my-claude/preferences.json (global)
 *          .claude/preferences.json (project — not yet supported from dashboard)
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { jsonResponse } from './helpers';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const GLOBAL_PREFS_FILE = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'preferences.json',
);
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

interface Preference {
	id: string;
	title: string;
	content: string;
	tags?: string[];
	autoInject?: boolean;
	trigger?: {
		always?: boolean;
		keywords?: string[];
		categories?: string[];
	};
	scope?: string;
	createdAt?: string;
}

async function readPrefs(
	filePath: string = GLOBAL_PREFS_FILE,
): Promise<Record<string, Preference>> {
	if (!existsSync(filePath)) return {};
	try {
		const raw = await readFile(filePath, 'utf-8');
		return JSON.parse(raw) as Record<string, Preference>;
	} catch {
		return {};
	}
}

async function writePrefs(
	prefs: Record<string, Preference>,
	filePath: string = GLOBAL_PREFS_FILE,
): Promise<void> {
	await writeFile(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
}

/** Find project roots that have .claude/preferences.json */
async function findProjectPrefs(): Promise<
	Array<{ projectName: string; projectPath: string; filePath: string }>
> {
	const results: Array<{
		projectName: string;
		projectPath: string;
		filePath: string;
	}> = [];

	try {
		const folders = await readdir(PROJECTS_DIR, { withFileTypes: true });
		for (const f of folders) {
			if (!f.isDirectory()) continue;
			const projDir = join(PROJECTS_DIR, f.name);
			const files = await readdir(projDir).catch(() => []);
			const jsonl = files.find((n: string) => n.endsWith('.jsonl'));
			if (!jsonl) continue;

			// Quick extract cwd
			const rl = createInterface({
				input: createReadStream(join(projDir, jsonl), {
					encoding: 'utf-8',
				}),
				crlfDelay: Infinity,
			});

			let cwd = '';
			let lines = 0;
			for await (const line of rl) {
				if (!line.trim()) continue;
				lines++;
				try {
					const entry = JSON.parse(line);
					if (entry.cwd) {
						cwd = entry.cwd;
						rl.close();
						break;
					}
				} catch {
					// skip
				}
				if (lines >= 200) {
					rl.close();
					break;
				}
			}

			if (!cwd) continue;
			const prefsFile = join(cwd, '.claude', 'preferences.json');
			if (existsSync(prefsFile)) {
				const segments = cwd.replace(/\\/g, '/').split('/');
				results.push({
					projectName:
						segments[segments.length - 1] ?? f.name,
					projectPath: cwd,
					filePath: prefsFile,
				});
			}
		}
	} catch {
		// ignore
	}
	return results;
}

export async function handlePreferencesRequest(
	req: Request,
	path: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const subpath = path.replace(/^\/api\/preferences/, '') || '/';

	// GET /api/preferences — list all (global + project)
	if (req.method === 'GET' && (subpath === '/' || subpath === '')) {
		const globalPrefs = await readPrefs();
		const globalList = Object.entries(globalPrefs).map(([prefId, p]) => ({
			...p,
			id: prefId,
			scope: 'global',
		}));

		// Project preferences
		const projectList: Array<Preference & { scope: string; project: string }> = [];
		try {
			const projPrefs = await findProjectPrefs();
			for (const { projectName, filePath } of projPrefs) {
				const prefs = await readPrefs(filePath);
				for (const [prefId, p] of Object.entries(prefs)) {
					projectList.push({
						...p,
						id: prefId,
						scope: 'project',
						project: projectName,
					});
				}
			}
		} catch {
			// ignore
		}

		return jsonResponse(
			{ preferences: [...globalList, ...projectList] },
			200,
			corsHeaders,
		);
	}

	// POST /api/preferences — add new (supports projectPath for project-scoped)
	if (req.method === 'POST' && (subpath === '/' || subpath === '')) {
		let body: Partial<Preference> & { projectPath?: string };
		try {
			body = (await req.json()) as Partial<Preference> & {
				projectPath?: string;
			};
		} catch {
			return jsonResponse(
				{ error: 'Invalid JSON' },
				400,
				corsHeaders,
			);
		}

		if (!body.title || !body.content) {
			return jsonResponse(
				{ error: 'title and content required' },
				400,
				corsHeaders,
			);
		}

		const slug = body.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.slice(0, 50);
		const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
		const id = `pref-${date}-${slug}`;

		const pref: Preference = {
			id,
			title: body.title,
			content: body.content,
			tags: body.tags ?? [],
			autoInject: body.autoInject ?? true,
			trigger: body.trigger ?? { always: true },
			createdAt: new Date().toISOString(),
		};

		// Determine target file — project-scoped or global
		let targetFile = GLOBAL_PREFS_FILE;
		if (body.projectPath) {
			const projFile = join(body.projectPath, '.claude', 'preferences.json');
			// Ensure .claude dir exists
			const { mkdirSync } = await import('node:fs');
			mkdirSync(join(body.projectPath, '.claude'), { recursive: true });
			targetFile = projFile;
		}

		const prefs = await readPrefs(targetFile);
		prefs[id] = pref;
		await writePrefs(prefs, targetFile);

		return jsonResponse({ ok: true, preference: pref }, 201, corsHeaders);
	}

	// DELETE /api/preferences/:id
	const id = decodeURIComponent(subpath.slice(1));
	if (req.method === 'DELETE' && id) {
		const prefs = await readPrefs();
		if (!prefs[id]) {
			return jsonResponse(
				{ error: 'Preference not found' },
				404,
				corsHeaders,
			);
		}
		delete prefs[id];
		await writePrefs(prefs);
		return jsonResponse({ ok: true, id }, 200, corsHeaders);
	}

	// PUT /api/preferences/:id — update
	if (req.method === 'PUT' && id) {
		let body: Partial<Preference>;
		try {
			body = (await req.json()) as Partial<Preference>;
		} catch {
			return jsonResponse(
				{ error: 'Invalid JSON' },
				400,
				corsHeaders,
			);
		}

		const prefs = await readPrefs();
		if (!prefs[id]) {
			return jsonResponse(
				{ error: 'Preference not found' },
				404,
				corsHeaders,
			);
		}

		if (body.title !== undefined) prefs[id]!.title = body.title;
		if (body.content !== undefined) prefs[id]!.content = body.content;
		if (body.tags !== undefined) prefs[id]!.tags = body.tags;
		if (body.autoInject !== undefined)
			prefs[id]!.autoInject = body.autoInject;
		if (body.trigger !== undefined) prefs[id]!.trigger = body.trigger;

		await writePrefs(prefs);
		return jsonResponse(
			{ ok: true, preference: prefs[id] },
			200,
			corsHeaders,
		);
	}

	return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
}
