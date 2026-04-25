/**
 * Hook scripts for oh-my-claude
 *
 * These are standalone scripts that Claude Code invokes via its hook system.
 * They need to be compiled to JavaScript and placed in ~/.claude/oh-my-claude/hooks/
 */

export const HOOKS = {
	'comment-checker': {
		name: 'comment-checker',
		description: 'Blocks code edits with excessive or problematic comments',
		type: 'PreToolUse',
		matcher: 'Edit|Write',
		source: './pre-tool-use/comment-checker.ts',
	},
	'todo-continuation': {
		name: 'todo-continuation',
		description: 'Reminds user of incomplete todos when session stops',
		type: 'Stop',
		matcher: '.*',
		source: './stop/todo-continuation.ts',
	},
	'memory-awareness': {
		name: 'memory-awareness',
		description:
			'Nudges Claude to use memory (recall/remember) during work',
		type: 'UserPromptSubmit',
		matcher: '',
		source: './user-prompt-submit/memory-awareness.ts',
	},
	'preference-awareness': {
		name: 'preference-awareness',
		description: 'Auto-inject matching preferences into session context',
		type: 'UserPromptSubmit',
		matcher: '',
		source: './user-prompt-submit/preference-awareness.ts',
	},
	'context-memory': {
		name: 'context-memory',
		description:
			'Session-end capture (Stop hook only — PostToolUse moved to post-tool)',
		type: 'Stop',
		matcher: '.*',
		source: './stop/context-memory.ts',
	},
	'post-tool': {
		name: 'post-tool',
		description:
			'Consolidated PostToolUse: session logging, task tracking, notifications, commit checkpoints',
		type: 'PostToolUse',
		matcher: '.*',
		source: './post-tool-use/post-tool.ts',
	},
	'auto-rotate': {
		name: 'auto-rotate',
		description:
			'SessionStart: prune stale session logs and compact past-date memory files (daily rollups)',
		type: 'SessionStart',
		matcher: '.*',
		source: './session-start/auto-rotate.ts',
	},
	'task-tracker': {
		name: 'task-tracker',
		description:
			'PreToolUse: track Task tool invocations (subscription-agent status for the statusline)',
		type: 'PreToolUse',
		matcher: 'Task',
		source: './pre-tool-use/task-tracker.ts',
	},
} as const;

export type HookName = keyof typeof HOOKS;
