#!/usr/bin/env node
/**
 * Todo Continuation Hook (Stop)
 *
 * When Claude Code session stops, checks if there are incomplete todos
 * and reminds the user to continue with remaining tasks.
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "Stop": [{
 *       "matcher": ".*",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/todo-continuation.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync } from "node:fs";

interface StopInput {
  reason: string;
  conversation_id?: string;
  todos?: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
  }>;
}

interface HookResponse {
  decision: "approve" | "block";
  reason?: string;
  message?: string;
}

async function main() {
  // Read input from stdin
  let inputData = "";

  try {
    inputData = readFileSync(0, "utf-8");
  } catch {
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  if (!inputData.trim()) {
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  let stopInput: StopInput;
  try {
    stopInput = JSON.parse(inputData);
  } catch {
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  // Check for incomplete todos
  const todos = stopInput.todos || [];
  const incompleteTodos = todos.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );

  if (incompleteTodos.length > 0) {
    const inProgress = incompleteTodos.filter((t) => t.status === "in_progress");
    const pending = incompleteTodos.filter((t) => t.status === "pending");

    let message = "⚠️ **Incomplete Tasks Detected**\n\n";

    if (inProgress.length > 0) {
      message += "**In Progress:**\n";
      for (const todo of inProgress) {
        message += `- 🔄 ${todo.content}\n`;
      }
      message += "\n";
    }

    if (pending.length > 0) {
      message += "**Pending:**\n";
      for (const todo of pending) {
        message += `- ⏳ ${todo.content}\n`;
      }
      message += "\n";
    }

    message +=
      "To continue with these tasks, start a new session and say:\n" +
      '"Continue with the remaining tasks" or "Resume the todo list"';

    const response: HookResponse = {
      decision: "approve", // Don't block, just notify
      message,
    };
    console.log(JSON.stringify(response));
    return;
  }

  const response: HookResponse = { decision: "approve" };
  console.log(JSON.stringify(response));
}

main().catch((error) => {
  console.error("Todo continuation hook error:", error);
  console.log(JSON.stringify({ decision: "approve" }));
});
