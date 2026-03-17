/**
 * Memory path utilities — directory resolution and project scanning
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export const GLOBAL_MEMORY_DIR = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'memory',
);
export const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/** Cache of project name → project root for omc memory resolution */
export const omcProjectRoots = new Map<string, string>();

/** Resolve omc-project memory path from ID like "omc/oh-my-claude/notes/some-note" */
export function resolveOmcProjectMemoryPath(id: string): string | null {
	// id format: "omc/<projectName>/<subdir>/<noteId>"
	const parts = id.split('/');
	if (parts.length < 4 || parts[0] !== 'omc') return null;
	const projectName = parts[1]!;
	const subdir = parts[2]!; // "notes" or "sessions"
	const noteId = parts.slice(3).join('/');

	const projectRoot = omcProjectRoots.get(projectName);
	if (!projectRoot) return null;

	return join(projectRoot, '.claude', 'mem', subdir, `${noteId}.md`);
}

/**
 * Try to extract cwd from a JSONL file by scanning first N lines.
 * Returns empty string if not found.
 */
async function extractCwdFromJsonl(filePath: string): Promise<string> {
	const rl = createInterface({
		input: createReadStream(filePath, { encoding: 'utf-8' }),
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
	return cwd;
}

/**
 * Find a JSONL file in a project directory.
 * Searches: root-level → UUID subdirectories → UUID/subagents/
 */
async function findJsonlFile(projDir: string): Promise<string | null> {
	const files = await readdir(projDir).catch(() => [] as string[]);

	// Check root-level jsonl files first
	const rootJsonl = files.find((n: string) => n.endsWith('.jsonl'));
	if (rootJsonl) return join(projDir, rootJsonl);

	// Check inside UUID subdirectories
	for (const name of files) {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) continue;
		const subDir = join(projDir, name);
		const subFiles = await readdir(subDir).catch(() => [] as string[]);

		// Direct jsonl in UUID dir
		const jsonl = subFiles.find((n: string) => n.endsWith('.jsonl'));
		if (jsonl) return join(subDir, jsonl);

		// Check subagents/ directory (newer Claude Code format)
		if (subFiles.includes('subagents')) {
			const agentFiles = await readdir(join(subDir, 'subagents')).catch(() => [] as string[]);
			const agentJsonl = agentFiles.find((n: string) => n.endsWith('.jsonl'));
			if (agentJsonl) return join(subDir, 'subagents', agentJsonl);
		}
	}

	return null;
}

/**
 * Resolve project cwd from a Claude project folder.
 * Strategy: extract cwd from JSONL session files (reliable, handles dashes in names).
 */
async function resolveProjectCwd(projDir: string): Promise<string> {
	const jsonlPath = await findJsonlFile(projDir);
	if (!jsonlPath) return '';
	return extractCwdFromJsonl(jsonlPath);
}

/** omc project-scoped memory directories: <projectRoot>/.claude/mem/notes/ */
export async function findOmcProjectMemDirs(): Promise<
	Array<{ dir: string; projectName: string; projectPath: string }>
> {
	const results: Array<{
		dir: string;
		projectName: string;
		projectPath: string;
	}> = [];
	try {
		const folders = await readdir(PROJECTS_DIR, { withFileTypes: true });
		for (const f of folders) {
			if (!f.isDirectory()) continue;
			const projDir = join(PROJECTS_DIR, f.name);

			const cwd = await resolveProjectCwd(projDir);
			if (!cwd) continue;

			const memBaseDir = join(cwd, '.claude', 'mem');
			if (existsSync(memBaseDir)) {
				const segments = cwd.replace(/\\/g, '/').split('/');
				const projName = segments[segments.length - 1] ?? f.name;
				omcProjectRoots.set(projName, cwd);

				// Scan both notes/ and sessions/ subdirectories
				for (const sub of ['notes', 'sessions']) {
					const subDir = join(memBaseDir, sub);
					if (existsSync(subDir)) {
						results.push({
							dir: subDir,
							projectName: projName,
							projectPath: cwd,
						});
					}
				}
			}
		}
	} catch {
		// ignore
	}
	return results;
}

/** Resolve memory ID to file path */
export function resolveMemoryPath(
	scope: string,
	id: string,
): string | null {
	if (scope === 'global') {
		// Check notes/ first, then sessions/
		const notesPath = join(GLOBAL_MEMORY_DIR, 'notes', `${id}.md`);
		if (existsSync(notesPath)) return notesPath;
		const sessionsPath = join(GLOBAL_MEMORY_DIR, 'sessions', `${id}.md`);
		if (existsSync(sessionsPath)) return sessionsPath;
		return notesPath; // default to notes/ for new files
	}

	if (scope === 'omc-project') {
		return resolveOmcProjectMemoryPath(id);
	}

	// Project: id is "folder/filename" or "folder/MEMORY"
	const slashIdx = id.indexOf('/');
	if (slashIdx === -1) return null;

	const folder = id.slice(0, slashIdx);
	const fileId = id.slice(slashIdx + 1);

	if (fileId === 'MEMORY') {
		return join(PROJECTS_DIR, folder, 'memory', 'MEMORY.md');
	}

	return join(PROJECTS_DIR, folder, 'memory', 'notes', `${fileId}.md`);
}
