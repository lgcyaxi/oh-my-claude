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
  "auto-memory": {
    name: "auto-memory",
    description: "Auto-captures session learnings via cheap external model at session end",
    type: "Stop",
    matcher: ".*",
    source: "./auto-memory.ts",
  },
  "session-logger": {
    name: "session-logger",
    description: "Logs every tool usage as an observation for auto-memory summarization",
    type: "PostToolUse",
    matcher: ".*",
    source: "./session-logger.ts",
  },
} as const;

export type HookName = keyof typeof HOOKS;
