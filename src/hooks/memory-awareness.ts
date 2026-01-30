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

import { readFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface UserPromptSubmitInput {
  prompt: string;
  session_id?: string;
}

interface HookResponse {
  decision: "approve" | "block";
  reason?: string;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName: "UserPromptSubmit";
    additionalContext?: string;
  };
}

/**
 * Log user prompt to session log for richer auto-memory context.
 * Appends a JSONL observation to the same session log used by session-logger.
 */
function logUserPrompt(prompt: string): void {
  if (!prompt || prompt.length < 5) return;
  try {
    const logDir = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const logPath = join(logDir, "active-session.jsonl");
    const truncated = prompt.length > 200 ? prompt.slice(0, 200) + "..." : prompt;
    const observation = {
      ts: new Date().toISOString(),
      tool: "UserPrompt",
      summary: `user: ${truncated}`,
    };
    appendFileSync(logPath, JSON.stringify(observation) + "\n", "utf-8");
  } catch {
    // Silently fail — never block
  }
}

/**
 * Count memories in the memory store
 */
function getMemoryCount(): number {
  const memoryDir = join(homedir(), ".claude", "oh-my-claude", "memory");
  let count = 0;

  for (const subdir of ["notes", "sessions"]) {
    const dir = join(memoryDir, subdir);
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
        count += files.length;
      } catch {
        // ignore
      }
    }
  }

  return count;
}

async function main() {
  // Read input from stdin
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf-8");
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  if (!inputData.trim()) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  let input: UserPromptSubmitInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  const memoryCount = getMemoryCount();

  // Log user prompt to session log for richer auto-memory context
  const prompt = input.prompt?.toLowerCase() ?? "";
  const rawPrompt = input.prompt ?? "";
  logUserPrompt(rawPrompt);

  // Only inject memory context if there are stored memories
  // or if the prompt looks like a significant work request
  const isSignificantWork =
    prompt.length > 50 ||
    prompt.includes("implement") ||
    prompt.includes("fix") ||
    prompt.includes("refactor") ||
    prompt.includes("add") ||
    prompt.includes("update") ||
    prompt.includes("create") ||
    prompt.includes("debug") ||
    prompt.includes("plan");

  // Detect completion/commit triggers for assertive memory save prompt
  const isCompletionTrigger =
    prompt.includes("commit") ||
    prompt.includes("/commit") ||
    prompt.includes("done") ||
    prompt.includes("finish") ||
    prompt.includes("complete") ||
    prompt.includes("ship it") ||
    prompt.includes("session-end") ||
    prompt.includes("/session-end");

  if (isCompletionTrigger) {
    const response: HookResponse = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `[omc-memory] Task completion detected. ` +
          `IMPORTANT: Before finishing, call remember() to store key decisions, patterns, or findings from this session. ` +
          `This ensures cross-session continuity.` +
          (memoryCount > 0 ? ` (${memoryCount} existing memories)` : ""),
      },
    };
    console.log(JSON.stringify(response));
    return;
  }

  if (memoryCount > 0 && isSignificantWork) {
    const response: HookResponse = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `[omc-memory] ${memoryCount} memories available. ` +
          `Consider using recall(query="relevant keywords") to check for prior decisions/context, ` +
          `and remember() to store important findings after completing work.`,
      },
    };
    console.log(JSON.stringify(response));
    return;
  }

  console.log(JSON.stringify({ decision: "approve" }));
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
