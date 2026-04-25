#!/usr/bin/env node
/**
 * SessionStart auto-rotation hook.
 *
 * Purpose: stop the memory tree from growing forever. On every Claude
 * Code session boot we:
 *   1. Prune orphaned `active-session-<hash>.jsonl` files (zero-byte or
 *      stale beyond 24h) that accumulate one-per-cwd every time the
 *      Stop hook truncated instead of unlinking.
 *   2. Look for past-date session / auto-commit files and, when a
 *      single date has accumulated `>= thresholdFiles`, roll them up
 *      into a single `YYYY-MM-DD-daily-rollup.md` note, then delete
 *      the originals.
 *
 * Compaction path selection:
 *   - If the memory proxy is healthy AND `useLLMWhenAvailable`, call
 *     `/internal/complete` with `buildDailyNarrativePrompt` so the
 *     rollup is a coherent narrative.
 *   - Otherwise fall back to a deterministic concat rollup (no LLM) so
 *     rotation still happens when the user is offline / has no
 *     provider configured.
 *
 * Budget: `maxDatesPerRun` dates per SessionStart, wrapped in a 20s
 * wall-clock cap. We always return `{ decision: 'approve' }` so we
 * never block the session from starting.
 */

import {
	readFileSync,
	writeFileSync,
	readdirSync,
	unlinkSync,
	existsSync,
	mkdirSync,
	appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
	findGitRoot,
	resolveCanonicalRoot as resolveCanonicalRootBase,
	loadHookConfig,
	pruneEmptySessionLogs,
	isProxyHealthy,
	getControlPort,
} from '../../memory/hooks';
import { buildDailyNarrativePrompt } from '../../memory/ai-ops-shared';

// ── Types ────────────────────────────────────────────────────────────

interface SessionStartInput {
	session_id?: string;
	cwd?: string;
	hook_event_name?: string;
	source?: string;
	[key: string]: unknown;
}

interface HookResponse {
	decision: 'approve' | 'block';
	message?: string;
}

interface CandidateFile {
	scope: 'global' | 'project';
	subdir: 'sessions' | 'notes';
	dir: string;
	id: string;
	path: string;
	date: string;
}

interface ParsedMemoryFile {
	title?: string;
	created?: string;
	tags?: string[];
	body: string;
}

type RotationMode = 'ai' | 'fallback' | 'skipped';

// ── Constants ───────────────────────────────────────────────────────

const HOOK_WALL_CLOCK_MS = 20_000;
const PROXY_HEALTH_TIMEOUT_MS = 500;
const AI_CALL_TIMEOUT_MS = 45_000;

// ── Path helpers ─────────────────────────────────────────────────────

function getGlobalMemoryDir(): string {
	return join(homedir(), '.claude', 'oh-my-claude', 'memory');
}

function getProjectMemoryDir(projectCwd?: string): string | null {
	if (!projectCwd) return null;
	const gitRoot = findGitRoot(projectCwd);
	if (!gitRoot) return null;
	const canonical = resolveCanonicalRootBase(gitRoot) ?? gitRoot;
	return join(canonical, '.claude', 'mem');
}

function getAuditLogPath(): string {
	return join(getGlobalMemoryDir(), '.rotation-log.jsonl');
}

function appendAudit(entry: Record<string, unknown>): void {
	try {
		const dir = getGlobalMemoryDir();
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		appendFileSync(
			getAuditLogPath(),
			JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n',
			'utf-8',
		);
	} catch (e) {
		console.error('[auto-rotate] audit append failed:', e);
	}
}

// ── Date helpers ────────────────────────────────────────────────────

function localYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function extractDatePrefix(filename: string): string | null {
	const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
	return m ? m[1]! : null;
}

function daysBetween(olderDate: string, newerDate: string): number {
	const o = new Date(`${olderDate}T00:00:00`);
	const n = new Date(`${newerDate}T00:00:00`);
	const ms = n.getTime() - o.getTime();
	return Math.round(ms / (24 * 60 * 60 * 1000));
}

// ── File scanning ──────────────────────────────────────────────────

function scanScope(
	baseDir: string,
	scope: 'global' | 'project',
): CandidateFile[] {
	const out: CandidateFile[] = [];
	if (!existsSync(baseDir)) return out;

	for (const subdir of ['sessions', 'notes'] as const) {
		const dir = join(baseDir, subdir);
		if (!existsSync(dir)) continue;

		let entries: string[] = [];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}

		for (const name of entries) {
			if (!name.endsWith('.md')) continue;

			// Only candidates for rotation:
			//  - sessions/: any .md that has a YYYY-MM-DD prefix
			//  - notes/:    only `auto-commit-*` so we never touch a
			//               user-authored note.
			if (subdir === 'notes' && !name.startsWith('auto-commit-')) {
				continue;
			}

			const id = name.slice(0, -3);

			// Never rotate an already-rolled-up file or a prior summary.
			// These are produced by /omc-mem-compact, /omc-mem-summary,
			// /omc-mem-daily, or our own daily-rollup writer.
			if (
				id.includes('daily-rollup') ||
				id.includes('daily-narrative') ||
				id.includes('-summary-') ||
				id.includes('-compact-')
			) {
				continue;
			}

			const date = extractDatePrefix(name);
			if (!date) continue;

			out.push({
				scope,
				subdir,
				dir,
				id,
				path: join(dir, name),
				date,
			});
		}
	}
	return out;
}

function parseMemoryFile(md: string): ParsedMemoryFile {
	// Strip a UTF-8 BOM if present — PowerShell's `Set-Content -Encoding
	// utf8` (and some editors) prepend one, which would otherwise make
	// the `---` fence detection miss.
	if (md.charCodeAt(0) === 0xfeff) md = md.slice(1);

	if (!md.startsWith('---')) return { body: md };
	const end = md.indexOf('\n---', 3);
	if (end === -1) return { body: md };

	const fmRaw = md.slice(3, end).trim();
	const body = md.slice(end + 4).replace(/^\n+/, '');

	const title = fmRaw.match(/^title:\s*"?([^"\n]+?)"?$/m)?.[1]?.trim();
	const created = fmRaw.match(/^created:\s*"?([^"\n]+?)"?$/m)?.[1]?.trim();
	const tagLine = fmRaw.match(/^tags:\s*\[([^\]]*)\]/m)?.[1];
	const tags = tagLine
		? tagLine
				.split(',')
				.map((s) => s.trim().replace(/^["']|["']$/g, ''))
				.filter(Boolean)
		: [];
	return { title, created, tags, body };
}

// ── Grouping / selection ────────────────────────────────────────────

interface DateGroup {
	date: string;
	files: CandidateFile[];
	scope: 'global' | 'project' | 'mixed';
}

function groupByDate(files: CandidateFile[]): DateGroup[] {
	const byDate = new Map<string, CandidateFile[]>();
	for (const f of files) {
		const arr = byDate.get(f.date) ?? [];
		arr.push(f);
		byDate.set(f.date, arr);
	}

	const groups: DateGroup[] = [];
	for (const [date, groupFiles] of byDate.entries()) {
		const scopes = new Set(groupFiles.map((f) => f.scope));
		const scope =
			scopes.size === 1
				? (groupFiles[0]!.scope as 'global' | 'project')
				: ('mixed' as const);
		groups.push({ date, files: groupFiles, scope });
	}
	// Sort oldest date first so we make progress on the biggest backlog.
	groups.sort((a, b) => a.date.localeCompare(b.date));
	return groups;
}

// ── Rollup generation (AI path) ─────────────────────────────────────

async function callNarrativeAI(
	controlPort: number,
	prompt: string,
): Promise<{ content: string; provider: string } | null> {
	try {
		const resp = await fetch(
			`http://localhost:${controlPort}/internal/complete`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: [{ role: 'user', content: prompt }],
					temperature: 0.3,
					max_tokens: 4000,
				}),
				signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
			},
		);
		if (!resp.ok) {
			console.error(
				`[auto-rotate] /internal/complete returned ${resp.status}`,
			);
			return null;
		}
		const data = (await resp.json()) as {
			content?: string;
			provider?: string;
		};
		if (!data.content) return null;
		return {
			content: data.content,
			provider: data.provider ?? 'unknown',
		};
	} catch (e) {
		console.error('[auto-rotate] narrative AI call failed:', e);
		return null;
	}
}

// ── Rollup writing + archival ──────────────────────────────────────

function chooseWriteBaseDir(
	group: DateGroup,
	projectCwd?: string,
): string | null {
	// Mixed group: write to project scope if we have one, else global.
	// Project-only: write to project scope.
	// Global-only: write to global.
	const projectDir = getProjectMemoryDir(projectCwd);
	if (group.scope === 'global') return getGlobalMemoryDir();
	if (group.scope === 'project')
		return projectDir ?? getGlobalMemoryDir();
	return projectDir ?? getGlobalMemoryDir();
}

function writeRollupFile(
	baseDir: string,
	date: string,
	body: string,
	sources: CandidateFile[],
	mode: RotationMode,
	provider?: string,
): string {
	const notesDir = join(baseDir, 'notes');
	mkdirSync(notesDir, { recursive: true });

	const id = `${date}-daily-rollup`;
	const filePath = join(notesDir, `${id}.md`);
	const now = new Date().toISOString();

	const tags = [
		'auto-rollup',
		mode === 'fallback' ? 'fallback' : 'narrative',
		`rotation-${date}`,
	];

	const sourceList = sources
		.map((s) => `- ${s.scope}:${s.subdir}/${s.id}`)
		.join('\n');

	const frontmatter = [
		'---',
		`title: "Daily rollup ${date}"`,
		`type: note`,
		`tags: [${tags.join(', ')}]`,
		`created: "${date}T00:00:00.000Z"`,
		`updated: "${now}"`,
		`rollupMode: ${mode}`,
		...(provider ? [`rollupProvider: ${provider}`] : []),
		'---',
		'',
		`> Auto-generated daily rollup of ${sources.length} memory file(s) from ${date}.`,
		`> Mode: ${mode}${provider ? ` (via ${provider})` : ''}.`,
		'',
		'### Source files (archived)',
		sourceList,
		'',
		'---',
		'',
	].join('\n');

	writeFileSync(filePath, frontmatter + body.trim() + '\n', 'utf-8');
	return filePath;
}

function archiveSources(sources: CandidateFile[]): {
	archived: number;
	errors: number;
} {
	let archived = 0;
	let errors = 0;
	for (const s of sources) {
		try {
			if (existsSync(s.path)) {
				unlinkSync(s.path);
				archived += 1;
			}
		} catch (e) {
			errors += 1;
			console.error('[auto-rotate] archive unlink failed:', s.path, e);
		}
	}
	return { archived, errors };
}

// ── Deterministic fallback ──────────────────────────────────────────

function buildDeterministicRollup(
	date: string,
	sources: CandidateFile[],
): string {
	const sections: string[] = [`## Daily rollup: ${date}`, ''];
	sections.push(
		'_Proxy was unreachable at rotation time; this is a raw concat of ' +
			'the source memories. Run `/omc-mem-summary` when a provider ' +
			'is available to upgrade this to a narrative._',
		'',
	);
	for (const src of sources) {
		let md: string;
		try {
			md = readFileSync(src.path, 'utf-8');
		} catch (e) {
			console.error(
				'[auto-rotate] could not read source for rollup:',
				src.path,
				e,
			);
			continue;
		}
		const parsed = parseMemoryFile(md);
		const title =
			parsed.title ??
			src.id
				.replace(/^session-/, '')
				.replace(/^auto-commit-/, 'commit ')
				.replace(/^context-save-/, 'checkpoint ');
		sections.push(`### ${title}`);
		sections.push('');
		if (parsed.created) {
			sections.push(`_created: ${parsed.created}_`);
			sections.push('');
		}
		sections.push(parsed.body.trim());
		sections.push('');
		sections.push('---');
		sections.push('');
	}
	return sections.join('\n');
}

// ── Narrative rollup (LLM) ──────────────────────────────────────────

function buildNarrativeEntries(
	sources: CandidateFile[],
): Array<{ title: string; content: string; created?: string }> {
	const entries: Array<{
		title: string;
		content: string;
		created?: string;
	}> = [];
	for (const src of sources) {
		let md = '';
		try {
			md = readFileSync(src.path, 'utf-8');
		} catch {
			continue;
		}
		const parsed = parseMemoryFile(md);
		entries.push({
			title: parsed.title ?? src.id,
			content: parsed.body.trim(),
			created: parsed.created,
		});
	}
	return entries;
}

// ── Orchestration ──────────────────────────────────────────────────

async function rotateGroup(
	group: DateGroup,
	opts: {
		projectCwd?: string;
		useLLM: boolean;
		controlPort: number | null;
		deadlineMs: number;
	},
): Promise<{ mode: RotationMode; path?: string; files: number }> {
	const baseDir = chooseWriteBaseDir(group, opts.projectCwd);
	if (!baseDir) {
		return { mode: 'skipped', files: group.files.length };
	}

	let body: string | null = null;
	let provider: string | undefined;
	let mode: RotationMode = 'fallback';

	if (
		opts.useLLM &&
		opts.controlPort !== null &&
		Date.now() < opts.deadlineMs
	) {
		const entries = buildNarrativeEntries(group.files);
		if (entries.length > 0) {
			const prompt = buildDailyNarrativePrompt(group.date, entries);
			const result = await callNarrativeAI(opts.controlPort, prompt);
			if (result) {
				body = result.content;
				provider = result.provider;
				mode = 'ai';
			}
		}
	}

	if (body === null) {
		body = buildDeterministicRollup(group.date, group.files);
		mode = 'fallback';
	}

	const path = writeRollupFile(
		baseDir,
		group.date,
		body,
		group.files,
		mode,
		provider,
	);
	const { archived, errors } = archiveSources(group.files);

	appendAudit({
		event: 'rotate',
		date: group.date,
		scope: group.scope,
		mode,
		provider: provider ?? null,
		files: group.files.length,
		archived,
		archiveErrors: errors,
		rollup: path,
	});

	return { mode, path, files: group.files.length };
}

async function runAutoRotate(input: SessionStartInput): Promise<void> {
	const projectCwd = input.cwd;
	const config = loadHookConfig().autoRotate;

	// Always prune empty session logs — cheap, fs-only.
	const pruned = pruneEmptySessionLogs({ currentCwd: projectCwd });
	if (pruned > 0) {
		appendAudit({ event: 'prune', pruned });
	}

	if (!config.enabled) return;

	const startedAt = Date.now();
	const deadlineMs = startedAt + HOOK_WALL_CLOCK_MS;

	// Scan both scopes.
	const candidates: CandidateFile[] = [];
	candidates.push(...scanScope(getGlobalMemoryDir(), 'global'));
	const projectDir = getProjectMemoryDir(projectCwd);
	if (projectDir) {
		candidates.push(...scanScope(projectDir, 'project'));
	}

	if (candidates.length === 0) return;

	// Filter by grace window and today.
	const today = localYYYYMMDD(new Date());
	const eligible = candidates.filter((f) => {
		if (f.date === today) return false;
		return daysBetween(f.date, today) >= config.graceDays + 1;
	});

	const groups = groupByDate(eligible).filter(
		(g) => g.files.length >= config.thresholdFiles,
	);

	if (groups.length === 0) return;

	// Check proxy health once. If it's down we still rotate via fallback.
	let controlPort: number | null = null;
	if (config.useLLMWhenAvailable) {
		const port = getControlPort();
		const healthy = await isProxyHealthy(port).catch(() => false);
		if (healthy) controlPort = port;
	}

	const toRotate = groups.slice(0, config.maxDatesPerRun);
	const deferred = groups.length - toRotate.length;

	for (const g of toRotate) {
		if (Date.now() > deadlineMs) {
			appendAudit({
				event: 'deadline',
				skipped: g.date,
				elapsedMs: Date.now() - startedAt,
			});
			break;
		}
		try {
			await rotateGroup(g, {
				projectCwd,
				useLLM: controlPort !== null,
				controlPort,
				deadlineMs,
			});
		} catch (e) {
			console.error(
				'[auto-rotate] group rotation failed:',
				g.date,
				e,
			);
			appendAudit({
				event: 'error',
				date: g.date,
				message: e instanceof Error ? e.message : String(e),
			});
		}
	}

	if (deferred > 0) {
		appendAudit({
			event: 'deferred',
			remainingDates: deferred,
			reason: 'maxDatesPerRun',
		});
	}
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
	let inputData = '';
	try {
		inputData = readFileSync(0, 'utf-8');
	} catch {
		emit({ decision: 'approve' });
		return;
	}

	let input: SessionStartInput = {};
	if (inputData.trim()) {
		try {
			input = JSON.parse(inputData);
		} catch {
			// Malformed input — still approve so we never block startup.
			emit({ decision: 'approve' });
			return;
		}
	}

	try {
		await runAutoRotate(input);
	} catch (e) {
		console.error('[auto-rotate] runAutoRotate failed:', e);
	}

	emit({ decision: 'approve' });
}

function emit(response: HookResponse): void {
	console.log(JSON.stringify(response));
}

main().catch((e) => {
	console.error('[auto-rotate] fatal:', e);
	emit({ decision: 'approve' });
});
