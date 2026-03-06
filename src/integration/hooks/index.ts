/**
 * Hook scripts for oh-my-claude
 *
 * These are standalone scripts that Claude Code invokes via its hook system.
 * They need to be compiled to JavaScript and placed in ~/.claude/oh-my-claude/hooks/
 */

export const HOOKS = {
  "comment-checker": {
    name: "comment-checker",
    description: "Blocks code edits with excessive or problematic comments",
    type: "PreToolUse",
    matcher: "Edit|Write",
    source: "./comment-checker.ts",
  },
  "todo-continuation": {
    name: "todo-continuation",
    description: "Reminds user of incomplete todos when session stops",
    type: "Stop",
    matcher: ".*",
    source: "./todo-continuation.ts",
  },
  "memory-awareness": {
    name: "memory-awareness",
    description: "Nudges Claude to use memory (recall/remember) during work",
    type: "UserPromptSubmit",
    matcher: "",
    source: "./memory-awareness.ts",
  },
  "preference-awareness": {
    name: "preference-awareness",
    description: "Auto-inject matching preferences into session context",
    type: "UserPromptSubmit",
    matcher: "",
    source: "./preference-awareness.ts",
  },
  "context-memory": {
    name: "context-memory",
    description: "Session-end capture (Stop hook only — PostToolUse moved to post-tool)",
    type: "Stop",
    matcher: ".*",
    source: "./context-memory.ts",
  },
  "post-tool": {
    name: "post-tool",
    description: "Consolidated PostToolUse: session logging, task tracking, notifications, commit checkpoints",
    type: "PostToolUse",
    matcher: ".*",
    source: "./post-tool.ts",
  },
  // Legacy hooks kept for backward compat build (source files still exist)
  "session-logger": {
    name: "session-logger",
    description: "(Legacy — replaced by post-tool)",
    type: "PostToolUse",
    matcher: ".*",
    source: "./session-logger.ts",
  },
} as const;

export type HookName = keyof typeof HOOKS;
