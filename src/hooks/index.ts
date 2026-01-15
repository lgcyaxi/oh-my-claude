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
} as const;

export type HookName = keyof typeof HOOKS;
