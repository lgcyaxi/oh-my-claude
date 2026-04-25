/**
 * Settings merger for Claude Code settings.json
 *
 * Safely merges oh-my-claude configuration into existing settings
 * without overwriting user customizations.
 */

import {
	existsSync,
	readFileSync,
	mkdirSync,
	copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import {
	atomicWriteJson,
	withFileLockSync,
} from '../../shared/fs/file-lock.js';

/**
 * Thrown by `loadSettings()` when `~/.claude/settings.json` exists but is not
 * valid JSON. The original file is copied to `settings.json.corrupt-<unix-ts>.bak`
 * before throwing so the user can repair it. Callers MUST NOT fall back to `{}`
 * in this case — silently overwriting a user's settings.json is the precise
 * failure mode this class exists to prevent.
 */
export class SettingsCorruptError extends Error {
	readonly settingsPath: string;
	readonly backupPath: string;
	constructor(settingsPath: string, backupPath: string, cause?: unknown) {
		super(
			`Aborted: settings.json is invalid JSON; backup written to ${backupPath}. ` +
				`Fix or delete the file and retry.`,
		);
		this.name = 'SettingsCorruptError';
		this.settingsPath = settingsPath;
		this.backupPath = backupPath;
		if (cause !== undefined) {
			(this as unknown as { cause?: unknown }).cause = cause;
		}
	}
}

interface ClaudeSettings {
	hooks?: {
		PreToolUse?: Array<{
			matcher: string;
			hooks: Array<{ type: string; command: string }>;
		}>;
		PostToolUse?: Array<{
			matcher: string;
			hooks: Array<{ type: string; command: string }>;
		}>;
		Stop?: Array<{
			matcher: string;
			hooks: Array<{ type: string; command: string }>;
		}>;
		UserPromptSubmit?: Array<{
			matcher: string;
			hooks: Array<{ type: string; command: string }>;
		}>;
		SessionStart?: Array<{
			matcher: string;
			hooks: Array<{ type: string; command: string }>;
		}>;
	};
	mcpServers?: Record<
		string,
		{
			command: string;
			args?: string[];
			env?: Record<string, string>;
		}
	>;
	statusLine?: {
		type: 'command';
		command: string;
		padding?: number;
	};
	[key: string]: unknown;
}

/**
 * Get path to Claude Code settings.json
 */
export function getSettingsPath(): string {
	return join(homedir(), '.claude', 'settings.json');
}

/**
 * Advisory-lock path for settings.json. Every RMW cycle
 * (`loadSettings → mutate → saveSettings`) runs under this lock so
 * concurrent CLI invocations (`omc install` racing `omc doctor`, hook
 * installers racing proxy daemon restart, etc.) can't stomp each other.
 */
function getSettingsLockPath(): string {
	return getSettingsPath() + '.lock';
}

function getClaudeJsonLockPath(): string {
	return join(homedir(), '.claude.json.lock');
}


/**
 * Clean up legacy MCP server name in ~/.claude.json (user-level config).
 * Claude Code reads both ~/.claude/settings.json and ~/.claude.json for MCP servers.
 * The old name "oh-my-claude-background" was renamed to "oh-my-claude".
 */
function cleanupLegacyMcpName(): void {
	const legacyName = 'oh-my-claude-background';
	const newName = 'oh-my-claude';
	const claudeJsonPath = join(homedir(), '.claude.json');

	try {
		if (!existsSync(claudeJsonPath)) return;
		withFileLockSync(getClaudeJsonLockPath(), () => {
			const raw = readFileSync(claudeJsonPath, 'utf-8');
			const data = JSON.parse(raw);
			let changed = false;

			const visit = (node: unknown) => {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) {
					for (const entry of node) visit(entry);
					return;
				}

				const record = node as Record<string, unknown>;
				const servers = record.mcpServers;
				if (
					servers &&
					typeof servers === 'object' &&
					!Array.isArray(servers)
				) {
					const serverRecord = servers as Record<string, unknown>;
					if (serverRecord[legacyName]) {
						if (!serverRecord[newName]) {
							serverRecord[newName] = serverRecord[legacyName];
						}
						delete serverRecord[legacyName];
						changed = true;
					}
				}

				for (const value of Object.values(record)) {
					visit(value);
				}
			};

			visit(data);

			if (changed) {
				writeClaudeJsonAtomic(claudeJsonPath, data);
			}
		});
	} catch {
		// Non-critical — user can fix manually
	}
}

/** Atomic write for ~/.claude.json (uses 2-space indent + trailing newline). */
function writeClaudeJsonAtomic(path: string, data: unknown): void {
	atomicWriteJson(path, data, {
		indent: 2,
		trailingNewline: true,
	});
}

/**
 * Load existing Claude Code settings.
 *
 * Returns `{}` when the file does not exist (fresh install).
 *
 * Throws `SettingsCorruptError` when the file exists but cannot be parsed as
 * JSON. Before throwing we copy the original file to
 * `settings.json.corrupt-<unix-ts>.bak` so the user can recover — previously
 * this code silently returned `{}`, which caused `saveSettings()` to
 * overwrite the corrupt file with an empty object, destroying the user's
 * configuration.
 */
export function loadSettings(): ClaudeSettings {
	const settingsPath = getSettingsPath();

	if (!existsSync(settingsPath)) {
		return {};
	}

	const content = readFileSync(settingsPath, 'utf-8');
	try {
		return JSON.parse(content);
	} catch (error) {
		const backupPath = `${settingsPath}.corrupt-${Date.now()}.bak`;
		try {
			copyFileSync(settingsPath, backupPath);
		} catch (copyErr) {
			const message =
				copyErr instanceof Error ? copyErr.message : String(copyErr);
			console.error(
				`Failed to back up corrupt settings.json to ${backupPath}: ${message}`,
			);
		}
		console.error(
			`settings.json at ${settingsPath} is not valid JSON. ` +
				`Original copied to ${backupPath}. Aborting to avoid overwriting user config.`,
		);
		throw new SettingsCorruptError(settingsPath, backupPath, error);
	}
}

/**
 * Save Claude Code settings atomically (temp file + rename).
 *
 * Uses `atomicWriteJson` with 2-space indent and no trailing newline — the
 * Claude Code convention for settings.json.
 */
export function saveSettings(settings: ClaudeSettings): void {
	const settingsPath = getSettingsPath();
	const dir = dirname(settingsPath);

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	atomicWriteJson(settingsPath, settings, {
		indent: 2,
		trailingNewline: false,
	});
}

/**
 * Add hook to settings (if not already present)
 * When force is true, replaces existing hook with new command
 */
function addHook(
	settings: ClaudeSettings,
	hookType:
		| 'PreToolUse'
		| 'PostToolUse'
		| 'Stop'
		| 'UserPromptSubmit'
		| 'SessionStart',
	matcher: string,
	command: string,
	force = false,
): boolean {
	if (!settings.hooks) {
		settings.hooks = {};
	}

	if (!settings.hooks[hookType]) {
		settings.hooks[hookType] = [];
	}

	// Extract the hook script filename for precise matching
	// e.g., "node /path/to/oh-my-claude/hooks/auto-memory.js" → "auto-memory.js"
	// Split on both / and \ to support Windows and Unix paths, strip quotes
	const scriptFile = (command.split(/[/\\]/).pop() ?? command).replace(
		/"/g,
		'',
	);

	// Check if this SPECIFIC hook already exists (match by script filename, not generic path)
	// Strip quotes from existing commands too for reliable comparison across path formats
	const existingIndex = settings.hooks[hookType]!.findIndex((h) =>
		h.hooks.some((hook) =>
			hook.command.replace(/"/g, '').endsWith(scriptFile),
		),
	);

	if (existingIndex !== -1) {
		if (force) {
			// Remove existing hook so we can replace it with updated command
			settings.hooks[hookType]!.splice(existingIndex, 1);
		} else {
			return false; // Already installed
		}
	}

	settings.hooks[hookType]!.push({
		matcher,
		hooks: [{ type: 'command', command }],
	});

	return true;
}

/**
 * Remove hook from settings
 */
function removeHook(
	settings: ClaudeSettings,
	hookType:
		| 'PreToolUse'
		| 'PostToolUse'
		| 'Stop'
		| 'UserPromptSubmit'
		| 'SessionStart',
	identifier: string,
): boolean {
	if (!settings.hooks?.[hookType]) {
		return false;
	}

	const original = settings.hooks[hookType]!.length;
	settings.hooks[hookType] = settings.hooks[hookType]!.filter(
		(h) => !h.hooks.some((hook) => hook.command.includes(identifier)),
	);

	return settings.hooks[hookType]!.length < original;
}

/**
 * Add MCP server to settings
 */
function addMcpServer(
	settings: ClaudeSettings,
	name: string,
	config: { command: string; args?: string[]; env?: Record<string, string> },
): boolean {
	if (!settings.mcpServers) {
		settings.mcpServers = {};
	}

	if (settings.mcpServers[name]) {
		return false; // Already exists
	}

	settings.mcpServers[name] = config;
	return true;
}

/**
 * Remove MCP server from settings
 */
function removeMcpServer(settings: ClaudeSettings, name: string): boolean {
	if (!settings.mcpServers?.[name]) {
		return false;
	}

	delete settings.mcpServers[name];
	return true;
}

/**
 * Get the node executable path for hook commands
 * On Windows, this helps avoid file association issues
 */
function getNodeCommand(): string {
	const { platform } = require('node:os');
	if (platform() === 'win32') {
		try {
			const { execSync } = require('node:child_process');
			// Get the full path to node executable and quote it
			const nodePath = execSync(
				'node -e "console.log(process.execPath)"',
				{ encoding: 'utf-8' },
			).trim();
			return `"${nodePath}"`;
		} catch {
			// Fallback to 'node' if we can't get the path
			return 'node';
		}
	}
	return 'node';
}

/**
 * Install oh-my-claude hooks into settings
 */
export function installHooks(
	hooksDir: string,
	force = false,
): {
	installed: string[];
	updated: string[];
	skipped: string[];
} {
	return withFileLockSync(getSettingsLockPath(), () =>
		installHooksLocked(hooksDir, force),
	);
}

function installHooksLocked(
	hooksDir: string,
	force: boolean,
): {
	installed: string[];
	updated: string[];
	skipped: string[];
} {
	const settings = loadSettings();
	const installed: string[] = [];
	const updated: string[] = [];
	const skipped: string[] = [];

	const nodeCmd = getNodeCommand();

	// Comment checker hook
	const commentCheckerResult = addHook(
		settings,
		'PreToolUse',
		'Edit|Write',
		`${nodeCmd} "${join(hooksDir, 'comment-checker.js')}"`,
		force,
	);
	if (commentCheckerResult) {
		if (force) {
			// Check if this was an update or fresh install
			const wasExisting = settings.hooks?.PreToolUse?.some(
				(h) =>
					h.matcher === 'Edit|Write' &&
					h.hooks.some((hook) =>
						hook.command.includes('comment-checker'),
					),
			);
			if (wasExisting && settings.hooks?.PreToolUse) {
				// After addHook with force, there's now a new entry plus the old one was removed
				// So we count this as an update
				updated.push('comment-checker (PreToolUse)');
			} else {
				installed.push('comment-checker (PreToolUse)');
			}
		} else {
			installed.push('comment-checker (PreToolUse)');
		}
	} else {
		skipped.push('comment-checker (already installed)');
	}

	// Todo continuation hook
	const todoResult = addHook(
		settings,
		'Stop',
		'.*',
		`${nodeCmd} "${join(hooksDir, 'todo-continuation.js')}"`,
		force,
	);
	if (todoResult) {
		if (force) {
			updated.push('todo-continuation (Stop)');
		} else {
			installed.push('todo-continuation (Stop)');
		}
	} else {
		skipped.push('todo-continuation (already installed)');
	}

	// Task tracker hook (PreToolUse for Task tool)
	const taskPreResult = addHook(
		settings,
		'PreToolUse',
		'Task',
		`${nodeCmd} "${join(hooksDir, 'task-tracker.js')}"`,
		force,
	);
	if (taskPreResult) {
		if (force) {
			updated.push('task-tracker (PreToolUse:Task)');
		} else {
			installed.push('task-tracker (PreToolUse:Task)');
		}
	} else {
		skipped.push('task-tracker (already installed)');
	}

	// Consolidated PostToolUse hook (replaces: task-tracker PostToolUse, task-notification,
	// session-logger, context-memory PostToolUse — all in one process spawn)
	const postToolResult = addHook(
		settings,
		'PostToolUse',
		'.*',
		`${nodeCmd} "${join(hooksDir, 'post-tool.js')}"`,
		force,
	);
	if (postToolResult) {
		if (force) {
			updated.push('post-tool (PostToolUse:*)');
		} else {
			installed.push('post-tool (PostToolUse:*)');
		}
	} else {
		skipped.push('post-tool (already installed)');
	}

	// Remove legacy PostToolUse hooks (replaced by consolidated post-tool)
	removeHook(settings, 'PostToolUse', 'task-tracker');
	removeHook(settings, 'PostToolUse', 'task-notification');
	removeHook(settings, 'PostToolUse', 'session-logger');
	removeHook(settings, 'PostToolUse', 'context-memory');

	// Context-memory hook (Stop — session-end capture, replaces auto-memory)
	const contextMemoryStopResult = addHook(
		settings,
		'Stop',
		'.*',
		`${nodeCmd} "${join(hooksDir, 'context-memory.js')}"`,
		force,
	);
	if (contextMemoryStopResult) {
		if (force) {
			updated.push('context-memory (Stop)');
		} else {
			installed.push('context-memory (Stop)');
		}
	} else {
		skipped.push('context-memory (Stop already installed)');
	}

	// Remove legacy auto-memory hook if present (replaced by context-memory Stop)
	removeHook(settings, 'Stop', 'auto-memory');

	// Memory awareness hook (UserPromptSubmit — nudges memory recall/remember)
	const memoryResult = addHook(
		settings,
		'UserPromptSubmit',
		'',
		`${nodeCmd} "${join(hooksDir, 'memory-awareness.js')}"`,
		force,
	);
	if (memoryResult) {
		if (force) {
			updated.push('memory-awareness (UserPromptSubmit)');
		} else {
			installed.push('memory-awareness (UserPromptSubmit)');
		}
	} else {
		skipped.push('memory-awareness (already installed)');
	}

	// Preference awareness hook (UserPromptSubmit — auto-inject matching preferences)
	const prefResult = addHook(
		settings,
		'UserPromptSubmit',
		'',
		`${nodeCmd} "${join(hooksDir, 'preference-awareness.js')}"`,
		force,
	);
	if (prefResult) {
		if (force) {
			updated.push('preference-awareness (UserPromptSubmit)');
		} else {
			installed.push('preference-awareness (UserPromptSubmit)');
		}
	} else {
		skipped.push('preference-awareness (already installed)');
	}

	// Auto-rotate hook (SessionStart — prunes stale session logs and compacts
	// past-date memory files so `.claude/oh-my-claude/memory/sessions` and
	// `notes/` don't grow unboundedly).
	const autoRotateResult = addHook(
		settings,
		'SessionStart',
		'.*',
		`${nodeCmd} "${join(hooksDir, 'auto-rotate.js')}"`,
		force,
	);
	if (autoRotateResult) {
		if (force) {
			updated.push('auto-rotate (SessionStart)');
		} else {
			installed.push('auto-rotate (SessionStart)');
		}
	} else {
		skipped.push('auto-rotate (SessionStart already installed)');
	}

	saveSettings(settings);
	return { installed, updated, skipped };
}

/**
 * Get the node executable path
 * On Windows, this helps avoid file association issues
 */
function getNodeExecutable(): string {
	const { execSync } = require('node:child_process');
	try {
		// Get the path to node executable
		return execSync('node -e "console.log(process.execPath)"', {
			encoding: 'utf-8',
		}).trim();
	} catch {
		// Fallback to 'node' if we can't get the path
		return 'node';
	}
}

/**
 * Sync MCP server entry to ~/.claude.json (Claude Code's native config).
 *
 * Claude Code reads MCP servers from BOTH ~/.claude/settings.json and ~/.claude.json.
 * When ~/.claude.json has its own `mcpServers` section, it takes precedence and entries
 * from settings.json may be ignored. To ensure oh-my-claude is always discovered,
 * we mirror the MCP entry to ~/.claude.json when it has a mcpServers section.
 */
function syncMcpToClaudeJson(
	name: string,
	config: { command: string; args?: string[]; env?: Record<string, string> },
	force = false,
): void {
	const claudeJsonPath = join(homedir(), '.claude.json');

	try {
		if (!existsSync(claudeJsonPath)) return;
		withFileLockSync(getClaudeJsonLockPath(), () => {
			const raw = readFileSync(claudeJsonPath, 'utf-8');
			const data = JSON.parse(raw);

			// Only sync if ~/.claude.json has a top-level mcpServers section
			if (!data.mcpServers || typeof data.mcpServers !== 'object') return;

			// Skip if already present (unless force)
			if (data.mcpServers[name] && !force) return;

			data.mcpServers[name] = config;
			writeClaudeJsonAtomic(claudeJsonPath, data);
		});
	} catch {
		// Non-critical — settings.json is the primary config
	}
}

/**
 * Remove MCP server entry from ~/.claude.json
 */
function removeMcpFromClaudeJson(name: string): void {
	const claudeJsonPath = join(homedir(), '.claude.json');

	try {
		if (!existsSync(claudeJsonPath)) return;
		withFileLockSync(getClaudeJsonLockPath(), () => {
			const raw = readFileSync(claudeJsonPath, 'utf-8');
			const data = JSON.parse(raw);

			if (!data.mcpServers?.[name]) return;

			delete data.mcpServers[name];
			writeClaudeJsonAtomic(claudeJsonPath, data);
		});
	} catch {
		// Non-critical
	}
}

/**
 * Install oh-my-claude MCP server using claude mcp add CLI
 */
export function installMcpServer(serverPath: string, force = false): boolean {
	return withFileLockSync(getSettingsLockPath(), () =>
		installMcpServerLocked(serverPath, force),
	);
}

function installMcpServerLocked(serverPath: string, force: boolean): boolean {
	const { platform } = require('node:os');

	// Use settings.json directly — `claude mcp` CLI commands hang when run inside
	// a Claude Code session (even after clearing CLAUDECODE env), making them unreliable.
	const settings = loadSettings();
	const nodePath = platform() === 'win32' ? getNodeExecutable() : 'node';

	// Clean up legacy name (renamed from oh-my-claude-background → oh-my-claude)
	// Check both ~/.claude/settings.json and ~/.claude.json (Claude reads both)
	if (settings?.mcpServers?.['oh-my-claude-background']) {
		removeMcpServer(settings, 'oh-my-claude-background');
	}
	cleanupLegacyMcpName();

	// Check if already installed
	const existing = settings?.mcpServers?.['oh-my-claude'];
	if (existing && !force) {
		// Even if already in settings.json, ensure it's also in ~/.claude.json
		// (Claude Code may only read MCP servers from there when it has its own mcpServers section)
		syncMcpToClaudeJson('oh-my-claude', existing as { command: string; args?: string[] });
		return true;
	}

	// Remove stale entry before re-adding (addMcpServer won't overwrite existing)
	if (existing && force) {
		removeMcpServer(settings, 'oh-my-claude');
	}

	const mcpConfig = { command: nodePath, args: [serverPath] };
	const result = addMcpServer(settings, 'oh-my-claude', mcpConfig);
	// Save even if addMcpServer returned false (we may have removed a stale entry)
	saveSettings(settings);

	// Mirror to ~/.claude.json for Claude Code compatibility
	// When ~/.claude.json has its own mcpServers, entries only in settings.json may be ignored
	syncMcpToClaudeJson('oh-my-claude', mcpConfig, force);

	return result;
}

/**
 * Uninstall oh-my-claude from settings
 */
export function uninstallFromSettings(): {
	removedHooks: string[];
	removedMcp: boolean;
} {
	return withFileLockSync(getSettingsLockPath(), () =>
		uninstallFromSettingsLocked(),
	);
}

function uninstallFromSettingsLocked(): {
	removedHooks: string[];
	removedMcp: boolean;
} {
	const { execSync } = require('node:child_process');
	const settings = loadSettings();
	const removedHooks: string[] = [];

	// Remove hooks
	if (removeHook(settings, 'PreToolUse', 'oh-my-claude')) {
		removedHooks.push('PreToolUse');
	}
	if (removeHook(settings, 'PostToolUse', 'oh-my-claude')) {
		removedHooks.push('PostToolUse');
	}
	if (removeHook(settings, 'Stop', 'oh-my-claude')) {
		removedHooks.push('Stop');
	}
	if (removeHook(settings, 'UserPromptSubmit', 'oh-my-claude')) {
		removedHooks.push('UserPromptSubmit');
	}

	saveSettings(settings);

	// Remove MCP server via CLI (both current and legacy names)
	let removedMcp = false;
	try {
		execSync('claude mcp remove --scope user oh-my-claude', {
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		removedMcp = true;
	} catch {
		// Try removing from settings.json as fallback
		const settingsAgain = loadSettings();
		removedMcp = removeMcpServer(settingsAgain, 'oh-my-claude');
		removeMcpServer(settingsAgain, 'oh-my-claude-background'); // legacy name
		if (removedMcp) {
			saveSettings(settingsAgain);
		}
	}

	// Also remove from ~/.claude.json
	removeMcpFromClaudeJson('oh-my-claude');
	removeMcpFromClaudeJson('oh-my-claude-background');

	return { removedHooks, removedMcp };
}

/**
 * Install oh-my-claude statusLine
 * If user has existing statusLine, creates a wrapper that calls both
 */
export function installStatusLine(
	statusLineScriptPath: string,
	force = false,
): {
	installed: boolean;
	wrapperCreated: boolean;
	existingBackedUp: boolean;
	updated: boolean;
} {
	return withFileLockSync(getSettingsLockPath(), () =>
		installStatusLineLocked(statusLineScriptPath, force),
	);
}

function installStatusLineLocked(
	_statusLineScriptPath: string,
	force: boolean,
): {
	installed: boolean;
	wrapperCreated: boolean;
	existingBackedUp: boolean;
	updated: boolean;
} {
	const { mergeStatusLine } = require('./statusline-merger');

	const settings = loadSettings();
	const existing = settings.statusLine;

	const result = mergeStatusLine(existing, force);

	// Update settings if config changed or force mode triggered an update
	if (result.config.command !== existing?.command || result.updated) {
		settings.statusLine = result.config;
		saveSettings(settings);
	}

	return {
		installed: true,
		wrapperCreated: result.wrapperCreated,
		existingBackedUp: result.backupCreated,
		updated: result.updated || false,
	};
}

/**
 * Remove oh-my-claude statusLine and restore original if backed up
 */
export function uninstallStatusLine(): boolean {
	return withFileLockSync(getSettingsLockPath(), () =>
		uninstallStatusLineLocked(),
	);
}

function uninstallStatusLineLocked(): boolean {
	const {
		restoreStatusLine,
		isStatusLineConfigured,
	} = require('./statusline-merger');

	if (!isStatusLineConfigured()) {
		return false;
	}

	const settings = loadSettings();

	// Try to restore original statusLine
	const backup = restoreStatusLine();
	if (backup) {
		settings.statusLine = backup;
	} else {
		// No backup - just remove our statusLine
		delete settings.statusLine;
	}

	saveSettings(settings);
	return true;
}
