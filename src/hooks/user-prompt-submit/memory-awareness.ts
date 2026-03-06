#!/usr/bin/env node
/**
 * Memory Awareness Hook (UserPromptSubmit)
 *
 * Injects a gentle reminder for Claude to use the memory system
 * (recall before work, remember after decisions) on each user message.
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "UserPromptSubmit": [{
 *       "matcher": "",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/memory-awareness.js"
 *       }]
 *     }]
 *   }
 * }
 */

import {
	readFileSync,
	existsSync,
	readdirSync,
	mkdirSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
	shortHash,
	resolveCanonicalRoot,
	logUserPrompt,
	getTimelineContent,
} from '../../memory/hooks';

/** Read bridge state inline (no import cycle — state.ts is also a hook dependency) */
function readBridgeWorkers(): string[] {
	try {
		const stateFile = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'bridge-state.json',
		);
		if (!existsSync(stateFile)) return [];
		const parsed = JSON.parse(readFileSync(stateFile, 'utf-8')) as {
			ais?: Array<{ name: string }>;
		};
		return (parsed.ais ?? []).map((a) => a.name);
	} catch {
		return [];
	}
}

function warnIfNonOmcProxyBaseUrl(sessionId?: string): void {
	const baseUrl = (process.env.ANTHROPIC_BASE_URL || '').trim();
	if (!baseUrl) return;

	const expectedPortRaw = (process.env.OMC_PROXY_PORT || '').trim();
	const expectedPort = Number.parseInt(expectedPortRaw, 10) || 9090;

	let actualPort: number | null = null;
	try {
		const parsed = new URL(baseUrl);
		actualPort = parsed.port
			? Number.parseInt(parsed.port, 10)
			: parsed.protocol === 'https:'
				? 443
				: 80;
	} catch {
		actualPort = null;
	}

	if (actualPort === expectedPort) return;

	try {
		const runDir = join(homedir(), '.claude', 'oh-my-claude', 'run');
		if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
		const suffix = sessionId ? `-${sessionId}` : '';
		const marker = join(runDir, `non-omc-proxy-warned${suffix}.flag`);
		if (existsSync(marker)) return;
		writeFileSync(marker, String(Date.now()), 'utf-8');
	} catch {
		// Best-effort de-duplication only
	}

	process.stderr.write(
		'⚠️  Proxy not detected. Running natively — bridge features limited.\n',
	);
}

interface UserPromptSubmitInput {
	prompt: string;
	session_id?: string;
	cwd?: string;
}

interface HookResponse {
	decision: 'approve' | 'block';
	reason?: string;
	suppressOutput?: boolean;
	hookSpecificOutput?: {
		hookEventName: 'UserPromptSubmit';
		additionalContext?: string;
	};
}

// logUserPrompt, shortHash, resolveCanonicalRoot are imported from ../../memory/hooks

/**
 * Count .md files in notes/ and sessions/ subdirectories
 */
function countMemoryFilesInDir(baseDir: string): number {
	let count = 0;
	for (const subdir of ['notes', 'sessions']) {
		const dir = join(baseDir, subdir);
		if (existsSync(dir)) {
			try {
				count += readdirSync(dir).filter((f) =>
					f.endsWith('.md'),
				).length;
			} catch {
				// ignore
			}
		}
	}
	return count;
}

/**
 * Count memories in the memory store (global, project-scoped, and canonical repo)
 */
function getMemoryCount(projectCwd?: string): number {
	let count = 0;

	// Count global memories
	const globalDir = join(homedir(), '.claude', 'oh-my-claude', 'memory');
	count += countMemoryFilesInDir(globalDir);

	// Count project-scoped memories if cwd is available
	const seenDirs = new Set<string>();
	if (projectCwd) {
		const projectMemDir = join(projectCwd, '.claude', 'mem');
		if (existsSync(projectMemDir)) {
			count += countMemoryFilesInDir(projectMemDir);
			seenDirs.add(projectMemDir);
		}

		// Also count canonical repo root's memories (for worktrees)
		const canonicalRoot = resolveCanonicalRoot(projectCwd);
		if (canonicalRoot && canonicalRoot !== projectCwd) {
			const canonicalMemDir = join(canonicalRoot, '.claude', 'mem');
			if (existsSync(canonicalMemDir) && !seenDirs.has(canonicalMemDir)) {
				count += countMemoryFilesInDir(canonicalMemDir);
			}
		}
	}

	return count;
}

// getTimelineContent is imported from ../../memory/hooks

/**
 * Read Claude's native MEMORY.md from ~/.claude/projects/<project-key>/MEMORY.md
 * Returns the content or null if not found.
 */
function getClaudeNativeMemory(projectCwd?: string): string | null {
	if (!projectCwd) return null;

	try {
		const claudeProjectsDir = join(homedir(), '.claude', 'projects');
		if (!existsSync(claudeProjectsDir)) return null;

		// Claude uses the full project path with slashes replaced
		const projectKey = projectCwd.replace(/\//g, '-').replace(/^-/, '');
		const memoryFile = join(claudeProjectsDir, projectKey, 'CLAUDE.md');

		if (existsSync(memoryFile)) {
			const content = readFileSync(memoryFile, 'utf-8').trim();
			if (content && content.length > 10) return content;
		}
	} catch {
		// ignore
	}
	return null;
}

// ── Proactive recall (in-process lightweight keyword search) ────────

const STOP_WORDS = new Set([
	'the',
	'a',
	'an',
	'is',
	'are',
	'was',
	'were',
	'be',
	'been',
	'being',
	'have',
	'has',
	'had',
	'do',
	'does',
	'did',
	'will',
	'would',
	'could',
	'should',
	'may',
	'might',
	'shall',
	'can',
	'to',
	'of',
	'in',
	'for',
	'on',
	'with',
	'at',
	'by',
	'from',
	'as',
	'into',
	'through',
	'during',
	'before',
	'after',
	'above',
	'below',
	'between',
	'out',
	'off',
	'over',
	'under',
	'again',
	'further',
	'then',
	'once',
	'here',
	'there',
	'when',
	'where',
	'why',
	'how',
	'all',
	'both',
	'each',
	'few',
	'more',
	'most',
	'other',
	'some',
	'such',
	'no',
	'nor',
	'not',
	'only',
	'own',
	'same',
	'so',
	'than',
	'too',
	'very',
	'just',
	'because',
	'but',
	'and',
	'or',
	'if',
	'while',
	'about',
	'up',
	'it',
	'its',
	'this',
	'that',
	'these',
	'those',
	'i',
	'me',
	'my',
	'we',
	'our',
	'you',
	'your',
	'he',
	'she',
	'they',
	'them',
	'what',
	'which',
	'who',
	'whom',
	'make',
	'like',
	'use',
	'please',
	'help',
	'want',
	'need',
	'get',
	'let',
	'also',
	'new',
	'implement',
	'fix',
	'refactor',
	'add',
	'update',
	'create',
	'debug',
]);

function extractKeywords(prompt: string): string[] {
	return prompt
		.toLowerCase()
		.replace(/[^a-z0-9\s\-_.]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
		.slice(0, 8);
}

interface QuickRecallResult {
	title: string;
	snippet: string;
	scope: string;
}

/**
 * Lightweight in-process recall: reads .md files, scores by keyword overlap.
 * Runs in <50ms for typical stores (10-50 files). No SQLite dependency.
 */
function quickRecall(
	keywords: string[],
	projectCwd?: string,
	limit: number = 3,
): QuickRecallResult[] {
	if (keywords.length === 0) return [];

	const scored: Array<QuickRecallResult & { score: number }> = [];

	const scanDir = (baseDir: string, scope: string) => {
		for (const subdir of ['notes', 'sessions']) {
			const dir = join(baseDir, subdir);
			if (!existsSync(dir)) continue;

			let files: string[];
			try {
				files = readdirSync(dir).filter((f) => f.endsWith('.md'));
			} catch {
				continue;
			}

			for (const file of files) {
				try {
					const content = readFileSync(join(dir, file), 'utf-8');
					const lower = content.toLowerCase();

					// Score: count keyword occurrences
					let score = 0;
					for (const kw of keywords) {
						const idx = lower.indexOf(kw);
						if (idx !== -1) {
							score += 2; // base match
							// Bonus for title match (first 200 chars likely includes frontmatter title)
							if (idx < 200) score += 1;
						}
					}

					if (score === 0) continue;

					// Extract title from frontmatter
					const titleMatch = content.match(
						/^title:\s*"?([^"\n]+)"?\s*$/m,
					);
					const title =
						titleMatch?.[1]?.trim() ?? file.replace('.md', '');

					// Extract snippet: body after frontmatter, ~300 chars
					const fmEnd = content.indexOf('\n---\n', 4);
					const body =
						fmEnd !== -1
							? content.slice(fmEnd + 5).trim()
							: content;
					const snippet =
						body.length > 300 ? body.slice(0, 300) + '...' : body;

					scored.push({ title, snippet, scope, score });
				} catch {
					// Skip unreadable files
				}
			}
		}
	};

	// Scan project memories
	const seenDirs = new Set<string>();
	if (projectCwd) {
		const projectMemDir = join(projectCwd, '.claude', 'mem');
		if (existsSync(projectMemDir)) {
			scanDir(projectMemDir, 'project');
			seenDirs.add(projectMemDir);
		}

		// Also scan canonical repo root (for worktrees)
		const canonicalRoot = resolveCanonicalRoot(projectCwd);
		if (canonicalRoot && canonicalRoot !== projectCwd) {
			const canonicalMemDir = join(canonicalRoot, '.claude', 'mem');
			if (existsSync(canonicalMemDir) && !seenDirs.has(canonicalMemDir)) {
				scanDir(canonicalMemDir, 'project');
			}
		}
	}

	// Scan global memories
	const globalDir = join(homedir(), '.claude', 'oh-my-claude', 'memory');
	scanDir(globalDir, 'global');

	// Sort by score descending, return top N
	scored.sort((a, b) => b.score - a.score);
	return scored
		.slice(0, limit)
		.map(({ title, snippet, scope }) => ({ title, snippet, scope }));
}

// ── Completion signal scanning ──────────────────────────────────────
const SIGNALS_DIR = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'signals',
	'completed',
);

/**
 * Scan for completed task signals and consume them.
 * Returns notification strings for any found completions.
 */
function scanCompletionSignals(): string[] {
	if (!existsSync(SIGNALS_DIR)) return [];
	const notifications: string[] = [];
	try {
		const { unlinkSync } = require('node:fs');
		const files = readdirSync(SIGNALS_DIR).filter((f: string) =>
			f.endsWith('.json'),
		);
		for (const file of files) {
			const filePath = join(SIGNALS_DIR, file);
			try {
				const signal = JSON.parse(readFileSync(filePath, 'utf-8'));
				const icon = signal.status === 'completed' ? '+' : '!';
				notifications.push(`[@] ${signal.agentName}: ${signal.status}`);
				unlinkSync(filePath); // consume signal
			} catch {
				try {
					unlinkSync(filePath);
				} catch {
					/* best effort */
				}
			}
		}
	} catch {
		/* directory read failed */
	}
	return notifications;
}

/**
 * Write a bridge-ready signal file for CC bridge workers.
 * Called once when the hook first fires in bridge mode — signals to `bridge up cc`
 * that the CC worker is initialized and ready to accept tasks.
 * Idempotent: skips write if the file already exists.
 */
function writeBridgeReadySignal(sessionId: string): void {
	try {
		const runDir = join(homedir(), '.claude', 'oh-my-claude', 'run');
		mkdirSync(runDir, { recursive: true });
		const signalPath = join(runDir, `bridge-ready-${sessionId}.json`);
		if (existsSync(signalPath)) return; // already written
		const payload = JSON.stringify({ sessionId, readyAt: Date.now() });
		writeFileSync(signalPath, payload, 'utf-8');
	} catch {
		// Non-critical — never block
	}
}

async function main() {
	// Read input from stdin
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

	let input: UserPromptSubmitInput;
	try {
		input = JSON.parse(inputData);
	} catch {
		console.log(JSON.stringify({ decision: 'approve' }));
		return;
	}

	const projectCwd = input.cwd;

	const workerRole = process.env.OMC_WORKER_ROLE;
	const bridgeWorkerId = process.env.OMC_BRIDGE_WORKER_ID;
	const isBridgeWorker = process.env.OMC_BRIDGE_PANE === '1';

	// Bus inbox check: if this is a bridge worker with a worker ID, check for pending bus tasks
	if (isBridgeWorker && bridgeWorkerId) {
		const busPort = process.env.OMC_BUS_PORT ?? '18912';
		const sessionId = process.env.OMC_SESSION_ID;
		let busContext = '';

		try {
			// Session-scoped query: only fetch tasks dispatched by the worker's parent session
			const sessionParam = sessionId
				? `&session=${encodeURIComponent(sessionId)}`
				: '';
			const resp = await fetch(
				`http://localhost:${busPort}/tasks/${encodeURIComponent(bridgeWorkerId)}?${sessionParam}`,
				{
					signal: AbortSignal.timeout(3000),
				},
			);
			if (resp.ok) {
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
				if (data.count > 0) {
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

					busContext = taskLines.join('\n');
				}
			}
		} catch {
			// Bus may not be running — non-critical
		}

		if (busContext) {
			const response: HookResponse = {
				decision: 'approve',
				hookSpecificOutput: {
					hookEventName: 'UserPromptSubmit',
					additionalContext: busContext,
				},
			};
			console.log(JSON.stringify(response));
			return;
		}

		// Bridge worker with no pending bus tasks — skip memory injection entirely.
		// Workers don't need timeline/recall context; they get mandates from the bus.
		console.log(JSON.stringify({ decision: 'approve' }));
		return;
	}

	if (workerRole) {
		const rolePrompts: Record<string, string> = {
			code: 'You are the CODE worker. Implement, edit, refactor, and fix code directly. Do NOT use bridge_send or spawn sub-workers. Complete tasks autonomously.',
			audit: 'You are the AUDIT worker. Review, analyze, and inspect code thoroughly. Do NOT use bridge_send or spawn sub-workers. Return findings directly.',
			docs: 'You are the DOCS worker. Write documentation, READMEs, comments, and specs. Do NOT use bridge_send or spawn sub-workers. Complete writing tasks directly.',
			design: 'You are the DESIGN worker. Handle UI, images, media, and visual tasks. Do NOT use bridge_send or spawn sub-workers. Complete design tasks directly.',
			general:
				'You are a bridge worker. Complete tasks directly. Do NOT use bridge_send or spawn sub-workers.',
		};

		const response: HookResponse = {
			decision: 'approve',
			hookSpecificOutput: {
				hookEventName: 'UserPromptSubmit',
				additionalContext:
					rolePrompts[workerRole] ?? rolePrompts.general,
			},
		};
		console.log(JSON.stringify(response));
		return;
	}

	// Check for bridge mode activation (env var or dynamic mode.json)
	let isBridgeMode = process.env.OMC_BRIDGE_MODE === '1';
	if (!isBridgeMode) {
		try {
			const sessionDir = join(
				homedir(),
				'.claude',
				'oh-my-claude',
				'sessions',
			);
			const sessionId = input.session_id;
			if (sessionId) {
				const modeFile = join(sessionDir, sessionId, 'mode.json');
				if (existsSync(modeFile)) {
					const modeData = JSON.parse(
						readFileSync(modeFile, 'utf-8'),
					);
					if (modeData.bridge === true) {
						isBridgeMode = true;
					}
				}
			}
		} catch {
			// Non-critical -- fallback to env var only
		}
	}

	warnIfNonOmcProxyBaseUrl(input.session_id);

	// Write bridge-ready signal on first hook invocation in bridge mode.
	// Allows `bridge up cc` to poll for actual CC readiness instead of fixed delay.
	if (isBridgeMode && input.session_id) {
		writeBridgeReadySignal(input.session_id);
	}

	// Check for completed background task signals
	const taskNotifications = scanCompletionSignals();

	const memoryCount = getMemoryCount(projectCwd);

	// Log user prompt to session log for richer auto-memory context
	const prompt = input.prompt?.toLowerCase() ?? '';
	const rawPrompt = input.prompt ?? '';
	logUserPrompt(rawPrompt, projectCwd);

	// Only inject memory context if there are stored memories
	// or if the prompt looks like a significant work request
	const isSignificantWork =
		prompt.length > 50 ||
		prompt.includes('implement') ||
		prompt.includes('fix') ||
		prompt.includes('refactor') ||
		prompt.includes('add') ||
		prompt.includes('update') ||
		prompt.includes('create') ||
		prompt.includes('debug') ||
		prompt.includes('plan');

	// Detect completion/commit triggers for assertive memory save prompt
	const isCompletionTrigger =
		prompt.includes('commit') ||
		prompt.includes('/commit') ||
		prompt.includes('done') ||
		prompt.includes('finish') ||
		prompt.includes('complete') ||
		prompt.includes('ship it') ||
		prompt.includes('session-end') ||
		prompt.includes('/session-end');

	const timeline = getTimelineContent(projectCwd);

	// Build bridge mode constraint — always inject full block on every prompt.
	// The flag-file "short reminder" approach was too weak: 15 tokens is insufficient
	// to enforce delegation after the model has already seen one turn.
	// This prompt is self-contained — works on fresh installs without memory.
	let bridgePrefix = '';
	if (isBridgeMode) {
		const workers = readBridgeWorkers();
		const workerList =
			workers.length > 0
				? `LIVE WORKERS: ${workers.join(', ')}`
				: `NO WORKERS RUNNING`;

		bridgePrefix =
			`<system-override>\n` +
			`[omc-bridge] BRIDGE MODE -- MANDATORY DELEGATION\n\n` +
			`${workerList}\n\n` +
			// Worker type reference — always shown so fresh installs know what's available
			`## WORKER TYPES & TASK ROUTING\n\n` +
			`| Worker | Role | Best For | Spawn Command |\n` +
			`|--------|------|----------|---------------|\n` +
			`| codex | audit | Code review, analysis, thinking, inspection | bridge_up("codex") |\n` +
			`| cc:zp | code | Implementation, refactoring, bug fixes, patches | bridge_up("cc:zp", "zp") |\n` +
			`| cc:kimi | design | UI/UX, visual, multimodal, screenshot analysis | bridge_up("cc:kimi", "kimi") |\n` +
			`| cc:mm-cn | docs | Documentation, READMEs, changelogs, specs | bridge_up("cc:mm-cn", "mm-cn") |\n` +
			`| cc:ds | general | General coding, versatile tasks | bridge_up("cc:ds", "ds") |\n` +
			`| cc:qwen | general | General coding, versatile tasks | bridge_up("cc:qwen", "ay") |\n\n` +
			`## ROUTING RULES\n\n` +
			`1. **Match task to worker role** — use the table above. Don't send everything to one worker.\n` +
			`2. **Use BOTH codex AND cc workers** — codex for review/audit, cc:* for implementation/docs.\n` +
			`3. **Auto-spawn if needed** — workers not yet running will be spawned by bridge_send or bridge_up.\n` +
			`4. **Parallel delegation** — dispatch independent tasks to different workers simultaneously.\n\n` +
			`## DELEGATION TOOLS\n\n` +
			`**bridge_send(ai_name, message)** — Send task to worker (pane-based, waits for response).\n` +
			`  Example: bridge_send("cc:zp", "Refactor the auth module. Read files yourself.")\n` +
			`  Example: bridge_send("codex", "Review src/proxy/handler.ts for security issues.")\n\n` +
			`**bridge_dispatch(worker, mandate)** — Send structured task via HTTP bus (reliable).\n` +
			`  Then use bridge_wait(task_ids) to collect results.\n\n` +
			`## MANDATORY DELEGATION\n\n` +
			`YOU MUST delegate ALL of the following to a bridge worker:\n` +
			`- Code changes (Edit, Write, file modifications) → cc:* workers\n` +
			`- Implementation tasks (features, fixes, refactoring) → cc:zp / cc:kimi / cc:ds\n` +
			`- Audit/review/analysis tasks → codex\n` +
			`- Documentation tasks (READMEs, changelogs, specs) → cc:mm-cn\n\n` +
			`FORBIDDEN DIRECT ACTIONS:\n` +
			`[NO] Edit / Write / NotebookEdit\n` +
			`[NO] Agent tool for code tasks\n` +
			`[NO] Bash for file modifications\n\n` +
			`ALLOWED DIRECT ACTIONS:\n` +
			`[OK] Read/Grep/Glob for quick lookups before delegating\n` +
			`[OK] Bash read-only (git status, ls, cat)\n` +
			`[OK] bridge_send / bridge_dispatch / bridge_wait / bridge_up\n` +
			`[OK] remember/recall/TaskCreate -- planning only\n\n` +
			`RULE: If unsure whether to delegate -> delegate. Workers read files themselves.\n` +
			`RULE: Use multiple worker types — don't send ALL tasks to the same worker.\n` +
			`</system-override>\n\n`;
	}

	// Prepend task notifications to any context we emit
	const taskPrefix =
		bridgePrefix +
		(taskNotifications.length > 0
			? taskNotifications.join('\n') + '\n\n'
			: '');

	if (isCompletionTrigger) {
		let context =
			`[omc-memory] Task completion detected. ` +
			`IMPORTANT: Before finishing, call remember() to store key decisions, patterns, or findings from this session. ` +
			`This ensures cross-session continuity.` +
			(memoryCount > 0 ? ` (${memoryCount} existing memories)` : '');

		if (timeline) {
			context += `\n\n${timeline}`;
		}

		const response: HookResponse = {
			decision: 'approve',
			hookSpecificOutput: {
				hookEventName: 'UserPromptSubmit',
				additionalContext: taskPrefix + context,
			},
		};
		console.log(JSON.stringify(response));
		return;
	}

	if (memoryCount > 0 && isSignificantWork) {
		// Proactive recall: search memories and inject top results directly
		const keywords = extractKeywords(rawPrompt);
		const topMemories = quickRecall(keywords, projectCwd, 3);

		let context: string;
		if (topMemories.length > 0) {
			context =
				`[omc-memory] ${memoryCount} memories available. Relevant memories auto-recalled below.\n` +
				`After completing work, call mcp__oh-my-claude__remember to store key decisions.\n\n` +
				`# Relevant Memories (auto-recalled)\n`;
			for (const mem of topMemories) {
				context += `\n## ${mem.title} (${mem.scope})\n${mem.snippet}\n`;
			}
		} else {
			context =
				`[omc-memory] ${memoryCount} memories available. ` +
				`Call mcp__oh-my-claude__recall with keywords from the user's request if relevant context might exist. ` +
				`After completing work, call mcp__oh-my-claude__remember to store key decisions.`;
		}

		if (timeline) {
			context += `\n\n${timeline}`;
		}

		// Include Claude native MEMORY.md if available
		const nativeMemory = getClaudeNativeMemory(projectCwd);
		if (nativeMemory) {
			const maxNative = 2000;
			const truncated =
				nativeMemory.length > maxNative
					? nativeMemory.slice(0, maxNative) + '\n... (truncated)'
					: nativeMemory;
			context += `\n\n# Claude Native Memory\n${truncated}`;
		}

		const response: HookResponse = {
			decision: 'approve',
			hookSpecificOutput: {
				hookEventName: 'UserPromptSubmit',
				additionalContext: taskPrefix + context,
			},
		};
		console.log(JSON.stringify(response));
		return;
	}

	// Even if no memory context, emit task notifications or bridge mode context if any
	if (taskPrefix) {
		const response: HookResponse = {
			decision: 'approve',
			hookSpecificOutput: {
				hookEventName: 'UserPromptSubmit',
				additionalContext: taskPrefix.trim(),
			},
		};
		console.log(JSON.stringify(response));
		return;
	}

	console.log(JSON.stringify({ decision: 'approve' }));
}

main().catch(() => {
	console.log(JSON.stringify({ decision: 'approve' }));
});
