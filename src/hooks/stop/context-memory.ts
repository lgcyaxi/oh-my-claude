#!/usr/bin/env node
/**
 * Unified Context-Memory Hook (PostToolUse + Stop)
 *
 * Single session writer that handles both mid-session checkpoints and
 * session-end capture. Replaces the previous dual-writer setup
 * (context-memory + auto-memory) that produced duplicate summaries.
 *
 * Triggers:
 * - PostToolUse: Fires after each tool call. Saves when session log
 *   exceeds a configurable threshold (~100KB). Only saves delta since
 *   last checkpoint.
 * - Stop: Fires at session end. Has access to transcript + todos from
 *   StopInput. Only summarizes DELTA since last save. Clears the
 *   project-scoped session log.
 *
 * All file paths are project-scoped via `cwd` from hook JSON input
 * to avoid multi-instance contamination.
 */

import {
	readFileSync,
	existsSync,
	writeFileSync,
	mkdirSync,
	statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

// ---- Input types for different hook events ----

interface PostToolUseInput {
	tool?: string;
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	tool_response?: string;
	conversation_id?: string;
	cwd?: string;
	hook_event_name?: string;
}

interface StopInput {
	reason?: string;
	conversation_id?: string;
	transcript?: string;
	transcript_path?: string;
	last_assistant_message?: string;
	stop_hook_active?: boolean;
	todos?: Array<{
		content: string;
		status: 'pending' | 'in_progress' | 'completed';
	}>;
	cwd?: string;
	hook_event_name?: string;
}

type HookInput = PostToolUseInput & StopInput;

interface HookResponse {
	decision: 'approve' | 'block';
	reason?: string;
	message?: string;
	additionalContext?: string;
	suppressOutput?: boolean;
}

// ---- Proxy-based AI client ----

const DEFAULT_CONTROL_PORT = 18911;

function getControlPort(): number {
	const env =
		process.env.OMC_CONTROL_PORT || process.env.OMC_PROXY_CONTROL_PORT;
	if (env) {
		const parsed = parseInt(env, 10);
		if (!isNaN(parsed)) return parsed;
	}
	return DEFAULT_CONTROL_PORT;
}

async function isProxyHealthy(controlPort: number): Promise<boolean> {
	try {
		const resp = await fetch(`http://localhost:${controlPort}/health`, {
			signal: AbortSignal.timeout(500),
		});
		if (!resp.ok) return false;
		const data = (await resp.json()) as { status?: string };
		return data.status === 'ok';
	} catch {
		return false;
	}
}

/**
 * Auto-spawn the proxy if not running. Session-scoped: tracked PID is killed on Stop.
 * Returns the control port to use, or null if proxy couldn't start.
 */
async function ensureProxy(projectCwd?: string): Promise<number | null> {
	const controlPort = getControlPort();

	if (await isProxyHealthy(controlPort)) {
		return controlPort;
	}

	// Proxy not running — try to auto-spawn
	try {
		const proxyScript = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'dist',
			'proxy',
			'server.js',
		);
		if (!existsSync(proxyScript)) {
			console.error(
				'[context-memory] Proxy script not found, cannot auto-spawn',
			);
			return null;
		}

		// Resolve bun path
		let bunPath = 'bun';
		try {
			const { execSync } = await import('node:child_process');
			bunPath = execSync('which bun', {
				encoding: 'utf-8',
				timeout: 3000,
				stdio: ['ignore', 'pipe', 'ignore'],
			}).trim();
		} catch {
			/* use default */
		}

		const { spawn: spawnProcess } = await import('node:child_process');
		const child = spawnProcess(
			bunPath,
			[
				'run',
				proxyScript,
				'--port',
				'18910',
				'--control-port',
				String(controlPort),
			],
			{
				detached: process.platform !== 'win32',
				stdio: ['ignore', 'ignore', 'ignore'],
				env: { ...process.env },
				windowsHide: true,
			},
		);
		child.unref();

		const pid = child.pid;
		if (!pid) {
			console.error('[context-memory] Failed to spawn proxy (no PID)');
			return null;
		}

		// Track PID for cleanup on Stop
		const sessionHash = projectCwd ? shortHash(projectCwd) : 'global';
		const sessionsDir = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'sessions',
			sessionHash,
		);
		mkdirSync(sessionsDir, { recursive: true });
		writeFileSync(
			join(sessionsDir, 'auto-proxy.json'),
			JSON.stringify({
				pid,
				autoSpawned: true,
				startedAt: new Date().toISOString(),
			}),
			'utf-8',
		);

		// Wait for proxy to become healthy (up to 3s)
		for (let i = 0; i < 15; i++) {
			await new Promise((resolve) => setTimeout(resolve, 200));
			if (await isProxyHealthy(controlPort)) {
				console.error(
					`[context-memory] Auto-spawned proxy (PID ${pid}) on port ${controlPort}`,
				);
				return controlPort;
			}
		}

		console.error(
			'[context-memory] Auto-spawned proxy but health check timed out',
		);
		return null;
	} catch (error) {
		console.error('[context-memory] Failed to auto-spawn proxy:', error);
		return null;
	}
}

/**
 * Kill the auto-spawned proxy on session end.
 */
function cleanupAutoProxy(projectCwd?: string): void {
	try {
		const sessionHash = projectCwd ? shortHash(projectCwd) : 'global';
		const autoProxyFile = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'sessions',
			sessionHash,
			'auto-proxy.json',
		);
		if (!existsSync(autoProxyFile)) return;

		const data = JSON.parse(readFileSync(autoProxyFile, 'utf-8')) as {
			pid?: number;
			autoSpawned?: boolean;
		};

		if (data.autoSpawned && data.pid) {
			try {
				process.kill(data.pid, 'SIGTERM');
				console.error(
					`[context-memory] Killed auto-spawned proxy (PID ${data.pid})`,
				);
			} catch {
				// Already dead
			}
		}

		// Clean up the tracking file
		const { unlinkSync } = require('node:fs') as typeof import('node:fs');
		unlinkSync(autoProxyFile);
	} catch {
		// Best-effort
	}
}

/**
 * Call the proxy's /internal/complete endpoint for memory AI operations.
 * Falls back to null if proxy is unavailable (caller decides what to do).
 */
async function callMemoryAI(
	context: string,
	prompt: string,
	controlPort: number,
): Promise<{ text: string; provider: string } | null> {
	try {
		const resp = await fetch(
			`http://localhost:${controlPort}/internal/complete`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: [
						{
							role: 'user',
							content: `${prompt}\n\n---\n\nSession context:\n${context}`,
						},
					],
					temperature: 0.1,
					max_tokens: 1024,
				}),
				signal: AbortSignal.timeout(60_000),
			},
		);

		if (!resp.ok) {
			console.error(
				`[context-memory] /internal/complete returned ${resp.status}`,
			);
			return null;
		}

		const data = (await resp.json()) as {
			content?: string;
			provider?: string;
		};
		if (data.content) {
			return { text: data.content, provider: data.provider ?? 'unknown' };
		}
		return null;
	} catch (error) {
		console.error('[context-memory] callMemoryAI failed:', error);
		return null;
	}
}

// ---- Constants ----

const DEFAULT_SESSION_LOG_THRESHOLD_KB = 40;
const STATE_DIR = join(homedir(), '.claude', 'oh-my-claude', 'state');

const CHECKPOINT_PROMPT = `You are a session summarizer. Extract KEY LEARNINGS from this coding session.

Output in this exact format:

CONCEPTS: concept1, concept2, concept3
FILES: path/to/file1.ts, path/to/file2.ts

---

- **Decision**: [what was decided and WHY]
- **Pattern**: [any convention or pattern discovered]
- **Problem/Solution**: [problem → solution]
- **Preference**: [any user preference expressed]

Rules:
- CONCEPTS: 3-7 semantic concepts (e.g., authentication, error-handling, proxy-config)
- FILES: Only files actually read or modified (extract from tool log)
- Body: Bullet points, specific and actionable, 200-400 words max
- Skip trivial details and boilerplate
- Do NOT include step-by-step implementation details (code is in git)`;

const SESSION_END_PROMPT = `You are a session summarizer. This session is ending. Extract KEY LEARNINGS from the RECENT activity (since any previous checkpoint).

Output in this exact format:

CONCEPTS: concept1, concept2, concept3
FILES: path/to/file1.ts, path/to/file2.ts

---

- **Decision**: [what was decided and WHY]
- **Pattern**: [any convention or pattern discovered]
- **Problem/Solution**: [problem → solution]
- **Preference**: [any user preference expressed]

Rules:
- CONCEPTS: 3-7 semantic concepts (e.g., authentication, error-handling, proxy-config)
- FILES: Only files actually read or modified (extract from tool log)
- Body: Bullet points, specific and actionable, 200-400 words max
- Skip trivial details, boilerplate, and content already covered in previous checkpoints
- Do NOT include step-by-step implementation details (code is in git)`;

// ---- Structured response parsing ----

interface StructuredResponse {
	concepts: string[];
	files: string[];
	body: string;
}

/**
 * Parse structured AI response into concepts, files, and body.
 * Expected format:
 *   CONCEPTS: concept1, concept2
 *   FILES: path/to/file1.ts, path/to/file2.ts
 *   ---
 *   Body content...
 *
 * Graceful fallback: if parsing fails, uses full text as body with empty arrays.
 */
function parseStructuredResponse(text: string): StructuredResponse {
	const result: StructuredResponse = { concepts: [], files: [], body: text };

	// Extract CONCEPTS: line
	const conceptsMatch = text.match(/^CONCEPTS:\s*(.+)$/m);
	if (conceptsMatch?.[1]) {
		result.concepts = conceptsMatch[1]
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	// Extract FILES: line
	const filesMatch = text.match(/^FILES:\s*(.+)$/m);
	if (filesMatch?.[1]) {
		result.files = filesMatch[1]
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	// Extract body after --- separator
	const separatorIdx = text.indexOf('\n---\n');
	if (separatorIdx !== -1) {
		result.body = text.slice(separatorIdx + 5).trim();
	} else if (conceptsMatch || filesMatch) {
		// If we found metadata lines but no separator, strip them from the body
		result.body = text
			.replace(/^CONCEPTS:\s*.+$/m, '')
			.replace(/^FILES:\s*.+$/m, '')
			.trim();
	}

	return result;
}

// ---- Helpers: project-scoped paths ----

function shortHash(str: string): string {
	return createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function getStateFile(projectCwd?: string): string {
	const suffix = projectCwd ? `-${shortHash(projectCwd)}` : '';
	return join(STATE_DIR, `context-memory-state${suffix}.json`);
}

function getSessionLogPath(projectCwd?: string): string {
	const suffix = projectCwd ? `-${shortHash(projectCwd)}` : '';
	return join(
		homedir(),
		'.claude',
		'oh-my-claude',
		'memory',
		'sessions',
		`active-session${suffix}.jsonl`,
	);
}

// ---- State management ----

interface ContextMemoryState {
	lastSaveTimestamp: string | null;
	lastSaveLogSizeKB: number | null;
	saveCount: number;
}

function loadState(projectCwd?: string): ContextMemoryState {
	try {
		const stateFile = getStateFile(projectCwd);
		if (existsSync(stateFile)) {
			const raw = readFileSync(stateFile, 'utf-8');
			return JSON.parse(raw);
		}
	} catch {
		// Ignore
	}
	return { lastSaveTimestamp: null, lastSaveLogSizeKB: null, saveCount: 0 };
}

function saveState(state: ContextMemoryState, projectCwd?: string): void {
	try {
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			getStateFile(projectCwd),
			JSON.stringify(state, null, 2),
			'utf-8',
		);
	} catch {
		// Ignore
	}
}

// ---- Config ----

function loadHookConfig(): { threshold: number } {
	const configPath = join(homedir(), '.claude', 'oh-my-claude.json');
	try {
		if (existsSync(configPath)) {
			const raw = readFileSync(configPath, 'utf-8');
			const config = JSON.parse(raw);
			return {
				threshold:
					config.memory?.autoSaveThreshold === 0
						? 0
						: Math.round(
								(config.memory?.autoSaveThreshold ?? 75) * 1.33,
							),
			};
		}
	} catch {
		// Ignore config errors
	}
	return {
		threshold: DEFAULT_SESSION_LOG_THRESHOLD_KB,
	};
}

// ---- Session log operations ----

function getSessionLogSizeKB(projectCwd?: string): number {
	try {
		const logPath = getSessionLogPath(projectCwd);
		if (!existsSync(logPath)) return 0;
		const stats = statSync(logPath);
		return Math.round(stats.size / 1024);
	} catch {
		return 0;
	}
}

function readSessionLog(projectCwd?: string): string {
	try {
		const logPath = getSessionLogPath(projectCwd);
		if (!existsSync(logPath)) return '';
		const raw = readFileSync(logPath, 'utf-8').trim();
		if (!raw) return '';

		const lines = raw.split('\n').filter(Boolean);
		const observations: string[] = [];

		for (const line of lines) {
			try {
				const obs = JSON.parse(line) as {
					ts: string;
					tool: string;
					summary: string;
				};
				const time = obs.ts.slice(11, 19);
				observations.push(`  [${time}] ${obs.tool}: ${obs.summary}`);
			} catch {
				// Skip
			}
		}

		const joined = observations.join('\n');
		return joined.length > 8000 ? '...\n' + joined.slice(-8000) : joined;
	} catch {
		return '';
	}
}

/** Clear session log after session end (project-scoped) */
function clearSessionLog(projectCwd?: string): void {
	try {
		const logPath = getSessionLogPath(projectCwd);
		if (existsSync(logPath)) {
			writeFileSync(logPath, '', 'utf-8');
		}
	} catch {
		// Ignore
	}
}

// ---- Provider operations (now routed through proxy) ----
// All AI calls go through the proxy's /internal/complete endpoint.
// See callMemoryAI() above and ensureProxy() for auto-spawn logic.

// ---- Memory save ----

/**
 * Find git root from a directory (walks up looking for .git).
 */
function findGitRoot(fromDir: string): string | null {
	let dir = fromDir;
	while (true) {
		if (existsSync(join(dir, '.git'))) {
			return dir;
		}
		const parent = join(dir, '..');
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

/**
 * Resolve canonical (non-worktree) repo root.
 * In a worktree, .git is a file with "gitdir: ..." pointing to the main repo.
 */
function resolveCanonicalRoot(projectRoot: string): string {
	const gitPath = join(projectRoot, '.git');
	try {
		const stat = statSync(gitPath);
		if (stat.isDirectory()) return projectRoot; // Already canonical

		const content = readFileSync(gitPath, 'utf-8').trim();
		const match = content.match(/^gitdir:\s*(.+)$/);
		if (!match) return projectRoot;

		const gitdir = match[1]!.trim();
		const normalized = gitdir.replace(/\\/g, '/');
		const worktreesIdx = normalized.indexOf('/.git/worktrees/');
		if (worktreesIdx === -1) return projectRoot;

		return gitdir.slice(0, worktreesIdx);
	} catch {
		return projectRoot;
	}
}

function saveSessionMemory(
	summary: string,
	providerUsed: string,
	trigger: 'checkpoint' | 'session-end',
	logSizeKB: number,
	projectCwd?: string,
): string {
	let memoryDir: string;

	// Find project root from explicit cwd, then resolve to canonical (non-worktree) root
	let projectRoot: string | null = null;
	if (projectCwd) {
		const gitRoot = findGitRoot(projectCwd);
		if (gitRoot) {
			projectRoot = resolveCanonicalRoot(gitRoot);
		}
	}

	if (projectRoot) {
		memoryDir = join(projectRoot, '.claude', 'mem', 'sessions');
	} else {
		memoryDir = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'memory',
			'sessions',
		);
	}

	mkdirSync(memoryDir, { recursive: true });

	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);
	const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
	const prefix = trigger === 'session-end' ? 'session' : 'context-save';
	const id = `${prefix}-${dateStr}-${timeStr}`;

	// Parse structured response for concepts/files extraction
	const parsed = parseStructuredResponse(summary);

	const titleText =
		trigger === 'session-end'
			? `Session summary ${dateStr}`
			: `Context checkpoint ${dateStr} (${logSizeKB}KB log)`;

	const tags =
		trigger === 'session-end'
			? `[auto-capture, session-end, ${providerUsed}]`
			: `[auto-capture, context-threshold, ${providerUsed}]`;

	const frontmatterLines = [
		'---',
		`title: "${titleText}"`,
		`type: session`,
		`tags: ${tags}`,
	];

	if (parsed.concepts.length > 0) {
		frontmatterLines.push(`concepts: [${parsed.concepts.join(', ')}]`);
	}
	if (parsed.files.length > 0) {
		frontmatterLines.push(`files: [${parsed.files.join(', ')}]`);
	}

	frontmatterLines.push(`created: "${now.toISOString()}"`);
	frontmatterLines.push(`updated: "${now.toISOString()}"`);
	frontmatterLines.push('---');

	const content = `${frontmatterLines.join('\n')}\n\n${parsed.body}\n`;
	const filePath = join(memoryDir, `${id}.md`);

	writeFileSync(filePath, content, 'utf-8');
	return filePath;
}

// ---- Event handlers ----

/**
 * Detect if a PostToolUse represents a completion event (e.g., git commit).
 */
function isCompletionTool(
	toolName: string,
	toolInput: Record<string, unknown> | undefined,
): boolean {
	if (toolName === 'Bash' && typeof toolInput?.command === 'string') {
		return toolInput.command.includes('git commit');
	}
	return false;
}

/**
 * Auto-save a mini-note from recent session log when a completion event occurs.
 * Lightweight: parses existing log, no AI call.
 */
function saveMiniNote(projectCwd?: string): void {
	const sessionLog = readSessionLog(projectCwd);
	if (!sessionLog || sessionLog.length < 200) return;

	// Take last ~2000 chars of session log for the summary
	const recentLog =
		sessionLog.length > 2000 ? sessionLog.slice(-2000) : sessionLog;

	// Extract a brief summary: last 5-10 tool observations
	const lines = recentLog.trim().split('\n').filter(Boolean);
	const lastLines = lines.slice(-10);
	const body = lastLines.join('\n');

	// Resolve write directory
	let notesDir: string;
	if (projectCwd) {
		const gitRoot = findGitRoot(projectCwd);
		if (gitRoot) {
			const canonical = resolveCanonicalRoot(gitRoot);
			notesDir = join(canonical, '.claude', 'mem', 'notes');
		} else {
			notesDir = join(
				homedir(),
				'.claude',
				'oh-my-claude',
				'memory',
				'notes',
			);
		}
	} else {
		notesDir = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'memory',
			'notes',
		);
	}

	mkdirSync(notesDir, { recursive: true });

	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);
	const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
	const id = `auto-commit-${dateStr}-${timeStr}`;

	const content = [
		'---',
		`title: "Commit checkpoint ${dateStr}"`,
		`type: note`,
		`tags: [auto-extract, completion]`,
		`created: "${now.toISOString()}"`,
		`updated: "${now.toISOString()}"`,
		'---',
		'',
		'Recent activity before commit:',
		'',
		body,
		'',
	].join('\n');

	writeFileSync(join(notesDir, `${id}.md`), content, 'utf-8');
	console.error(`[context-memory] Commit mini-note saved: ${id}.md`);
}

/**
 * Poll bus for pending tasks (used by bridge workers)
 * Returns task context string if tasks pending, empty string otherwise
 */
async function pollBusForTasks(): Promise<string> {
	const bridgeWorkerId = process.env.OMC_BRIDGE_WORKER_ID;
	if (!bridgeWorkerId) return '';

	const busPort = process.env.OMC_BUS_PORT ?? '18912';
	const sessionId = process.env.OMC_SESSION_ID;

	try {
		// Session-scoped query: only fetch tasks from parent session
		const sessionParam = sessionId
			? `&session=${encodeURIComponent(sessionId)}`
			: '';
		const resp = await fetch(
			`http://localhost:${busPort}/tasks/${encodeURIComponent(bridgeWorkerId)}?${sessionParam}`,
			{ signal: AbortSignal.timeout(3000) },
		);

		if (!resp.ok) return '';

		const data = (await resp.json()) as {
			tasks: Array<{
				taskId: string;
				mandate: {
					role: string;
					scope: string;
					goal: string;
					acceptance: string;
					context?: string;
				};
			}>;
			count: number;
		};

		if (data.count === 0) return '';

		const taskLines: string[] = [
			`<system-override>`,
			`[omc-bus] BRIDGE BUS TASK(s) PENDING — ${data.count} task(s) in inbox\n`,
		];

		for (const task of data.tasks) {
			taskLines.push(`## Task: ${task.taskId}`);
			taskLines.push(`Role: ${task.mandate.role}`);
			taskLines.push(`Scope: ${task.mandate.scope}`);
			taskLines.push(`Goal: ${task.mandate.goal}`);
			taskLines.push(`Done when: ${task.mandate.acceptance}`);
			if (task.mandate.context) {
				taskLines.push(`Context: ${task.mandate.context}`);
			}
			taskLines.push('');
		}

		taskLines.push(`INSTRUCTIONS:`);
		taskLines.push(
			`1. Call bridge_event with task_id and type="accepted" to acknowledge`,
		);
		taskLines.push(`2. Complete the task as described above`);
		taskLines.push(
			`3. Call bridge_event with type="completed" and payload={message, files?, data?}`,
		);
		taskLines.push(
			`4. If you fail, call bridge_event with type="failed" and payload={error: "reason"}`,
		);
		taskLines.push(`</system-override>`);

		return taskLines.join('\n');
	} catch {
		return '';
	}
}

/**
 * Handle PostToolUse event: checkpoint save when session log exceeds threshold
 */
async function handlePostToolUse(input: HookInput): Promise<HookResponse> {
	// Bridge workers: poll bus for tasks and inject as context
	if (process.env.OMC_BRIDGE_PANE === '1') {
		const busContext = await pollBusForTasks();
		if (busContext) {
			return {
				decision: 'approve',
				suppressOutput: true,
				additionalContext: busContext,
			};
		}
		return { decision: 'approve' };
	}

	// Skip if this is a memory-related tool (avoid recursion)
	const toolName = input.tool || input.tool_name || '';
	if (toolName.includes('memory') || toolName.includes('context-memory')) {
		return { decision: 'approve' };
	}

	const projectCwd = input.cwd;

	// Auto-save a mini-note on completion events (e.g., git commit)
	if (isCompletionTool(toolName, input.tool_input)) {
		try {
			saveMiniNote(projectCwd);
		} catch {
			// Best-effort — don't fail the hook
		}
	}

	const config = loadHookConfig();

	// Skip if threshold is 0 (disabled)
	if (config.threshold === 0) {
		return { decision: 'approve' };
	}

	// Get current session log size (project-scoped)
	const logSizeKB = getSessionLogSizeKB(projectCwd);

	// Skip if below threshold
	if (logSizeKB < config.threshold) {
		return { decision: 'approve' };
	}

	// Check if we've already saved recently (project-scoped state)
	const state = loadState(projectCwd);

	// Skip if we saved at similar or higher log size (with 10KB buffer)
	if (
		state.lastSaveLogSizeKB !== null &&
		logSizeKB <= state.lastSaveLogSizeKB + 10
	) {
		return { decision: 'approve' };
	}

	// Build context for summarization (project-scoped log)
	const sessionLog = readSessionLog(projectCwd);

	if (!sessionLog || sessionLog.length < 500) {
		return { decision: 'approve' };
	}

	// Ensure proxy is running (auto-spawn if needed)
	const controlPort = await ensureProxy(projectCwd);
	if (!controlPort) {
		return { decision: 'approve' };
	}

	const context = `Session activity log (${logSizeKB}KB, threshold: ${config.threshold}KB):\n\n${sessionLog}`;

	try {
		const result = await callMemoryAI(
			context,
			CHECKPOINT_PROMPT,
			controlPort,
		);

		if (result) {
			const filePath = saveSessionMemory(
				result.text,
				result.provider,
				'checkpoint',
				logSizeKB,
				projectCwd,
			);

			saveState(
				{
					lastSaveTimestamp: new Date().toISOString(),
					lastSaveLogSizeKB: logSizeKB,
					saveCount: state.saveCount + 1,
				},
				projectCwd,
			);

			console.error(
				`[context-memory] Checkpoint saved at ${logSizeKB}KB: ${filePath}`,
			);

			return {
				decision: 'approve',
				message: `Context memory auto-saved (${logSizeKB}KB activity, via ${result.provider})`,
			};
		}
	} catch (error) {
		console.error('[context-memory] Checkpoint error:', error);
	}

	return { decision: 'approve' };
}

/**
 * Handle Stop event: session-end capture (absorbs auto-memory functionality)
 * Only summarizes DELTA since last checkpoint. Clears session log.
 */
async function handleStop(input: HookInput): Promise<HookResponse> {
	const projectCwd = input.cwd;

	// Skip session-end capture for bridge workers — they report results via
	// bridge_event(completed) and their short-lived sessions produce duplicate
	// "Session summary" entries that flood the timeline.
	if (process.env.OMC_BRIDGE_PANE === '1') {
		clearSessionLog(projectCwd);
		return { decision: 'approve' };
	}

	const state = loadState(projectCwd);

	// Ensure proxy is running for AI summarization
	const controlPort = await ensureProxy(projectCwd);
	if (!controlPort) {
		clearSessionLog(projectCwd);
		cleanupAutoProxy(projectCwd);
		return { decision: 'approve' };
	}

	// Build context from session log + Stop-specific data (transcript, todos)
	const parts: string[] = [];

	if (input.reason) {
		parts.push(`Session end reason: ${input.reason}`);
	}

	if (input.todos && input.todos.length > 0) {
		parts.push('\nTask list:');
		for (const todo of input.todos) {
			const icon =
				todo.status === 'completed'
					? '+'
					: todo.status === 'in_progress'
						? '>'
						: 'o';
			parts.push(`  ${icon} [${todo.status}] ${todo.content}`);
		}
	}

	// Read session log (delta since last save) — may be empty if PostToolUse hooks
	// don't fire (known Claude Code 2.1.x issue)
	const sessionLog = readSessionLog(projectCwd);
	if (sessionLog) {
		const maxLen = 6000;
		const trimmed =
			sessionLog.length > maxLen
				? '...\n' + sessionLog.slice(-maxLen)
				: sessionLog;
		parts.push(`\nTool usage timeline:\n${trimmed}`);
	}

	// Read transcript from file path (Claude Code 2.1+ provides transcript_path)
	// This is the primary context source since PostToolUse hooks may not fire
	let transcriptText = input.transcript || '';
	if (!transcriptText && input.transcript_path) {
		try {
			const raw = readFileSync(input.transcript_path, 'utf-8');
			// Extract key info from JSONL: user messages + tool summaries
			const lines = raw.split('\n').filter(Boolean);
			const summaryParts: string[] = [];
			for (const line of lines.slice(-100)) {
				// last 100 entries
				try {
					const entry = JSON.parse(line);
					if (entry.type === 'human' && entry.message?.content) {
						const text =
							typeof entry.message.content === 'string'
								? entry.message.content
								: JSON.stringify(entry.message.content);
						summaryParts.push(`[user] ${text.slice(0, 200)}`);
					} else if (
						entry.type === 'tool_result' &&
						entry.tool_name
					) {
						summaryParts.push(
							`[${entry.tool_name}] ${(entry.output || '').slice(0, 100)}`,
						);
					} else if (entry.type === 'tool_use' && entry.name) {
						const args = entry.input
							? JSON.stringify(entry.input).slice(0, 100)
							: '';
						summaryParts.push(`[→${entry.name}] ${args}`);
					}
				} catch {
					continue;
				}
			}
			transcriptText = summaryParts.join('\n');
		} catch {
			/* transcript_path may not be readable */
		}
	}

	if (transcriptText) {
		const maxLen = 6000;
		const transcript =
			transcriptText.length > maxLen
				? '...' + transcriptText.slice(-maxLen)
				: transcriptText;
		parts.push(`\nRecent conversation:\n${transcript}`);
	}

	// Include last assistant message for concise context
	if (input.last_assistant_message) {
		const msg =
			input.last_assistant_message.length > 1000
				? input.last_assistant_message.slice(0, 1000) + '...'
				: input.last_assistant_message;
		parts.push(`\nLast response:\n${msg}`);
	}

	const context = parts.join('\n');

	// Skip if too little content (delta is small since last checkpoint)
	if (context.length < 500) {
		clearSessionLog(projectCwd);
		return { decision: 'approve' };
	}

	try {
		const result = await callMemoryAI(
			context,
			SESSION_END_PROMPT,
			controlPort,
		);

		if (result) {
			const logSizeKB = getSessionLogSizeKB(projectCwd);
			const filePath = saveSessionMemory(
				result.text,
				result.provider,
				'session-end',
				logSizeKB,
				projectCwd,
			);

			// Reset state for next session
			saveState(
				{
					lastSaveTimestamp: new Date().toISOString(),
					lastSaveLogSizeKB: 0,
					saveCount: 0,
				},
				projectCwd,
			);

			clearSessionLog(projectCwd);
			cleanupAutoProxy(projectCwd);

			console.error(`[context-memory] Session-end saved: ${filePath}`);

			return {
				decision: 'approve',
				message: `Session memory saved via proxy (${result.provider})`,
			};
		}
	} catch (error) {
		console.error('[context-memory] Session-end error:', error);
	}

	clearSessionLog(projectCwd);
	cleanupAutoProxy(projectCwd);
	return { decision: 'approve' };
}

// ---- Main entry point ----

async function main() {
	let inputData = '';
	try {
		inputData = readFileSync(0, 'utf-8');
	} catch {
		console.log(JSON.stringify({ decision: 'approve' }));
		return;
	}

	if (!inputData.trim()) {
		console.log(JSON.stringify({ decision: 'approve' }));
		return;
	}

	let input: HookInput;
	try {
		input = JSON.parse(inputData);
	} catch {
		console.log(JSON.stringify({ decision: 'approve' }));
		return;
	}

	// Detect which hook event triggered this
	// Stop event has `reason` field; PostToolUse has `tool`/`tool_name`
	const isStopEvent =
		input.reason !== undefined || input.hook_event_name === 'Stop';

	let response: HookResponse;
	if (isStopEvent) {
		response = await handleStop(input);
	} else {
		response = await handlePostToolUse(input);
	}

	console.log(JSON.stringify(response));
}

main().catch(() => {
	console.log(JSON.stringify({ decision: 'approve' }));
});
