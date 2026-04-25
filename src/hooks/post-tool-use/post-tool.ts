#!/usr/bin/env node
/**
 * Consolidated PostToolUse Hook
 *
 * Single hook that handles all PostToolUse responsibilities to avoid
 * spawning multiple Node.js processes per tool call (which causes
 * timeout issues on Windows, ~200-500ms per spawn).
 *
 * Responsibilities (in priority order):
 * 1. Session logging — append tool observation to JSONL (fast, always runs)
 * 2. Task tracking — track Task tool agent launches/completions for statusline
 * 3. Task notification — scan completion signal files
 * 4. Context-memory checkpoint — auto-save when session log exceeds threshold
 */

import {
	readFileSync,
	writeFileSync,
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import {
	getSessionStatusPath,
	getSessionTaskAgentsPath,
	ensureSessionDir,
	writeCurrentPPID,
} from '../../statusline/session';
import {
	formatLocalYYYYMMDDLite,
	formatLocalHHMMSSLite,
} from '../../memory/hooks';

// ── Types ────────────────────────────────────────────────────────────

interface PostToolUseInput {
	tool?: string;
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	input?: Record<string, unknown>;
	tool_response?: string;
	tool_output?: string;
	output?: string;
	hook_event_name?: string;
	cwd?: string;
}

interface HookResponse {
	decision: 'approve';
	hookSpecificOutput?: {
		hookEventName: 'PostToolUse';
		additionalContext?: string;
	};
}

// ── Shared helpers ───────────────────────────────────────────────────

function shortHash(str: string): string {
	return createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function truncate(str: string, max: number): string {
	if (str.length <= max) return str;
	return str.slice(0, max) + '...';
}

// ── 1. Session Logger ────────────────────────────────────────────────

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

function summarizeToolInput(
	tool: string,
	input: Record<string, unknown>,
): string {
	switch (tool) {
		case 'Read':
			return `read ${input.file_path ?? '?'}`;
		case 'Write':
			return `write ${input.file_path ?? '?'}`;
		case 'Edit':
			return `edit ${input.file_path ?? '?'}: "${truncate(String(input.old_string ?? ''), 40)}" → "${truncate(String(input.new_string ?? ''), 40)}"`;
		case 'Glob':
			return `glob ${input.pattern ?? '?'}`;
		case 'Grep':
			return `grep "${input.pattern ?? '?'}" in ${input.path ?? '.'}`;
		case 'Bash':
			return `bash: ${truncate(String(input.command ?? '?'), 80)}`;
		case 'Task':
			return `task(${input.subagent_type ?? '?'}): ${truncate(String(input.description ?? input.prompt ?? ''), 60)}`;
		case 'WebFetch':
			return `fetch ${input.url ?? '?'}`;
		case 'WebSearch':
			return `search "${input.query ?? '?'}"`;
		default:
			if (tool.startsWith('mcp__')) {
				const shortName = tool.split('__').slice(-1)[0];
				return `${shortName}: ${truncate(JSON.stringify(input), 80)}`;
			}
			return truncate(JSON.stringify(input), 100);
	}
}

function logToolObservation(
	toolName: string,
	toolInput: Record<string, unknown>,
	toolOutput: string,
	projectCwd?: string,
): void {
	// Skip self-referential tools
	if (
		toolName === 'session-logger' ||
		toolName === 'auto-memory' ||
		toolName === 'context-memory'
	)
		return;

	const inputSummary = summarizeToolInput(toolName, toolInput);
	const outputFirstLine = toolOutput
		? truncate(toolOutput.split('\n')[0] ?? '', 100)
		: '';
	const summary = outputFirstLine
		? `${inputSummary} → ${outputFirstLine}`
		: inputSummary;

	const observation = {
		ts: new Date().toISOString(),
		tool: toolName,
		summary,
	};

	try {
		const logDir = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'memory',
			'sessions',
		);
		mkdirSync(logDir, { recursive: true });
		const logPath = getSessionLogPath(projectCwd);
		appendFileSync(logPath, JSON.stringify(observation) + '\n', 'utf-8');
	} catch {
		// Never fail
	}
}

// ── 2. Task Tracker ──────────────────────────────────────────────────

interface TaskAgent {
	id: string;
	type: string;
	description: string;
	model?: string;
	startedAt: number;
}

interface TaskAgentsData {
	agents: TaskAgent[];
}

const AGENT_DISPLAY_NAMES: Record<string, string> = {
	Bash: 'Bash',
	Explore: 'Scout',
	Plan: 'Planner',
	'general-purpose': 'General',
	'claude-code-guide': 'Guide',
};

const DEFAULT_MODELS: Record<string, string> = {
	Plan: 'sonnet',
	Explore: 'haiku',
	Bash: 'haiku',
	'general-purpose': 'sonnet',
	'claude-code-guide': 'haiku',
};

function loadTaskAgents(): TaskAgentsData {
	try {
		const path = getSessionTaskAgentsPath();
		if (!existsSync(path)) return { agents: [] };
		const data = JSON.parse(readFileSync(path, 'utf-8'));
		return Array.isArray(data?.agents) ? data : { agents: [] };
	} catch {
		return { agents: [] };
	}
}

function saveTaskAgents(data: TaskAgentsData): void {
	try {
		ensureSessionDir();
		writeFileSync(
			getSessionTaskAgentsPath(),
			JSON.stringify(data, null, 2),
		);
	} catch {
		/* ignore */
	}
}

function updateStatusFile(taskAgents: TaskAgentsData): void {
	try {
		ensureSessionDir();
		const statusPath = getSessionStatusPath();
		let status: any = {
			activeTasks: [],
			providers: {},
			updatedAt: new Date().toISOString(),
		};
		if (existsSync(statusPath)) {
			try {
				status = JSON.parse(readFileSync(statusPath, 'utf-8'));
			} catch {
				/* use default */
			}
		}

		const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
		const taskAgentTasks = taskAgents.agents
			.filter((a) => a.startedAt > thirtyMinutesAgo)
			.map((a) => ({
				agent: `@${a.type}`,
				startedAt: a.startedAt,
				model: a.model,
				isTaskTool: true,
			}));

		const mcpTasks = (status.activeTasks || []).filter(
			(t: any) => !t.isTaskTool,
		);
		status.activeTasks = [...mcpTasks, ...taskAgentTasks];
		status.updatedAt = new Date().toISOString();
		writeFileSync(statusPath, JSON.stringify(status, null, 2));
	} catch {
		/* ignore */
	}
}

function handleTaskTool(input: PostToolUseInput): string | null {
	const toolInputData = input.tool_input || input.input || {};
	const subagentType = (toolInputData.subagent_type as string) || 'unknown';
	const description = (toolInputData.description as string) || '';
	const model =
		(toolInputData.model as string) || DEFAULT_MODELS[subagentType] || '?';
	const displayName = AGENT_DISPLAY_NAMES[subagentType] || subagentType;

	const hookEventName = input.hook_event_name;
	const hasResponse =
		input.tool_response || input.tool_output || input.output;
	const isPreToolUse =
		hookEventName === 'PreToolUse' ||
		(hookEventName === undefined && !hasResponse);

	if (isPreToolUse) {
		const taskAgents = loadTaskAgents();
		taskAgents.agents.push({
			id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
			type: displayName,
			description,
			model,
			startedAt: Date.now(),
		});
		saveTaskAgents(taskAgents);
		updateStatusFile(taskAgents);
		return null; // No additional context for pre-tool
	}

	// PostToolUse — agent completed
	const taskAgents = loadTaskAgents();
	const index = taskAgents.agents.findIndex((a) => a.type === displayName);
	if (index !== -1) {
		const removed = taskAgents.agents.splice(index, 1)[0];
		saveTaskAgents(taskAgents);
		updateStatusFile(taskAgents);
		if (removed) {
			const duration = Math.floor(
				(Date.now() - removed.startedAt) / 1000,
			);
			const durationStr =
				duration < 60
					? `${duration}s`
					: `${Math.floor(duration / 60)}m`;
			return `[@] ${displayName}: completed (${durationStr})`;
		}
	}
	return null;
}

// ── 3. Task Notification ─────────────────────────────────────────────

const SIGNALS_DIR = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'signals',
	'completed',
);
const NOTIFIED_FILE = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'notified-tasks.json',
);

function scanCompletionSignals(): string[] {
	if (!existsSync(SIGNALS_DIR)) return [];
	const notifications: string[] = [];

	let notified: Set<string>;
	try {
		if (existsSync(NOTIFIED_FILE)) {
			const data = JSON.parse(readFileSync(NOTIFIED_FILE, 'utf-8'));
			const oneHourAgo = Date.now() - 60 * 60 * 1000;
			notified = new Set(
				Object.entries(data)
					.filter(([_, ts]) => (ts as number) > oneHourAgo)
					.map(([id]) => id),
			);
		} else {
			notified = new Set();
		}
	} catch {
		notified = new Set();
	}

	try {
		const files = readdirSync(SIGNALS_DIR).filter((f) =>
			f.endsWith('.json'),
		);
		for (const file of files) {
			const filePath = join(SIGNALS_DIR, file);
			try {
				const signal = JSON.parse(readFileSync(filePath, 'utf-8'));
				if (notified.has(signal.taskId)) {
					try {
						unlinkSync(filePath);
					} catch {
						/* ignore */
					}
					continue;
				}
				const age = Date.now() - new Date(signal.completedAt).getTime();
				const durationStr =
					age < 5000 ? 'just now' : formatDuration(age) + ' ago';
				notifications.push(
					`[@] ${signal.agentName}: ${signal.status} (${durationStr})`,
				);
				notified.add(signal.taskId);
				try {
					unlinkSync(filePath);
				} catch {
					/* ignore */
				}
			} catch {
				try {
					unlinkSync(filePath);
				} catch {
					/* ignore */
				}
			}
		}
	} catch {
		/* ignore */
	}

	if (notifications.length > 0) {
		try {
			const dir = dirname(NOTIFIED_FILE);
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
			const data: Record<string, number> = {};
			const now = Date.now();
			for (const id of notified) data[id] = now;
			writeFileSync(NOTIFIED_FILE, JSON.stringify(data));
		} catch {
			/* ignore */
		}
	}

	return notifications;
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rem = seconds % 60;
	return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

// ── 4. Context-Memory Checkpoint (mini-note on git commit) ───────────

function findGitRoot(fromDir: string): string | null {
	let dir = fromDir;
	while (true) {
		if (existsSync(join(dir, '.git'))) return dir;
		const parent = join(dir, '..');
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function resolveCanonicalRoot(projectRoot: string): string {
	const gitPath = join(projectRoot, '.git');
	try {
		const stat = statSync(gitPath);
		if (stat.isDirectory()) return projectRoot;
		const content = readFileSync(gitPath, 'utf-8').trim();
		const match = content.match(/^gitdir:\s*(.+)$/);
		if (!match) return projectRoot;
		const gitdir = match[1]!.trim().replace(/\\/g, '/');
		const idx = gitdir.indexOf('/.git/worktrees/');
		return idx === -1 ? projectRoot : gitdir.slice(0, idx);
	} catch {
		return projectRoot;
	}
}

function saveMiniNote(
	toolInput: Record<string, unknown>,
	projectCwd?: string,
): void {
	const command = String(toolInput.command ?? '');
	if (!command.includes('git commit')) return;

	// Read recent session log
	try {
		const logPath = getSessionLogPath(projectCwd);
		if (!existsSync(logPath)) return;
		const raw = readFileSync(logPath, 'utf-8').trim();
		if (!raw || raw.length < 200) return;

		const lines = raw.split('\n').filter(Boolean);
		const lastLines = lines.slice(-10);
		const body = lastLines
			.map((l) => {
				try {
					const obs = JSON.parse(l);
					return `[${obs.ts?.slice(11, 19) ?? '?'}] ${obs.tool}: ${obs.summary}`;
				} catch {
					return l;
				}
			})
			.join('\n');

		// Resolve write directory
		let notesDir: string;
		if (projectCwd) {
			const gitRoot = findGitRoot(projectCwd);
			if (gitRoot) {
				notesDir = join(
					resolveCanonicalRoot(gitRoot),
					'.claude',
					'mem',
					'notes',
				);
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
		const dateStr = formatLocalYYYYMMDDLite(now);
		const timeStr = formatLocalHHMMSSLite(now);

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

		writeFileSync(
			join(notesDir, `auto-commit-${dateStr}-${timeStr}.md`),
			content,
			'utf-8',
		);
		console.error(`[post-tool] Commit mini-note saved`);
	} catch {
		/* ignore */
	}
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
	// Write PPID for session discovery (quick, no spawn)
	writeCurrentPPID();

	// Read stdin
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

	let input: PostToolUseInput;
	try {
		input = JSON.parse(inputData);
	} catch {
		console.log(JSON.stringify({ decision: 'approve' }));
		return;
	}

	const toolName = input.tool || input.tool_name || '?';
	const toolInput = input.tool_input || input.input || {};
	const toolOutput =
		input.tool_response || input.tool_output || input.output || '';
	const projectCwd = input.cwd;

	// ── 1. Session Logger (always, fast) ──
	logToolObservation(toolName, toolInput, toolOutput, projectCwd);

	// ── 2. Task Tracker (only for Task tool) ──
	let taskContext: string | null = null;
	if (toolName === 'Task') {
		taskContext = handleTaskTool(input);
	}

	// ── 3. Task Notification (scan signal files) ──
	const signalNotifications = scanCompletionSignals();

	// ── 4. Commit mini-note ──
	if (toolName === 'Bash') {
		saveMiniNote(toolInput, projectCwd);
	}

	// ── Build response ──
	const contextParts: string[] = [];
	if (taskContext) contextParts.push(taskContext);
	if (signalNotifications.length > 0)
		contextParts.push(...signalNotifications);

	if (contextParts.length > 0) {
		const response: HookResponse = {
			decision: 'approve',
			hookSpecificOutput: {
				hookEventName: 'PostToolUse',
				additionalContext: '\n' + contextParts.join('\n'),
			},
		};
		console.log(JSON.stringify(response));
	} else {
		console.log(JSON.stringify({ decision: 'approve' }));
	}
}

main().catch(() => {
	console.log(JSON.stringify({ decision: 'approve' }));
});
