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

import { readFileSync, existsSync, readdirSync } from "node:fs";
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

  // Only inject memory context if there are stored memories
  // or if the prompt looks like a significant work request
  const prompt = input.prompt?.toLowerCase() ?? "";
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
