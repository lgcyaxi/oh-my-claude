#!/usr/bin/env node
/**
 * Task Notification Hook (PostToolUse)
 *
 * Monitors for MCP background task completions and provides
 * notifications in the Claude Code output.
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "PostToolUse": [{
 *       "matcher": "mcp__oh-my-claude-background__.*",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/task-notification.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

interface PostToolUseInput {
  tool: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
}

interface HookResponse {
  decision: "approve";
  hookSpecificOutput?: {
    hookEventName: "PostToolUse";
    additionalContext?: string;
  };
}

// File to track notified task IDs (prevent duplicate notifications)
const NOTIFIED_FILE_PATH = join(homedir(), ".claude", "oh-my-claude", "notified-tasks.json");

/**
 * Load list of already-notified task IDs
 */
function loadNotifiedTasks(): Set<string> {
  try {
    if (!existsSync(NOTIFIED_FILE_PATH)) {
      return new Set();
    }
    const content = readFileSync(NOTIFIED_FILE_PATH, "utf-8");
    const data = JSON.parse(content);
    // Clean up old entries (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const filtered = Object.entries(data)
      .filter(([_, timestamp]) => (timestamp as number) > oneHourAgo)
      .map(([id]) => id);
    return new Set(filtered);
  } catch {
    return new Set();
  }
}

/**
 * Save notified task ID
 */
function saveNotifiedTask(taskId: string): void {
  try {
    const dir = dirname(NOTIFIED_FILE_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let data: Record<string, number> = {};
    if (existsSync(NOTIFIED_FILE_PATH)) {
      try {
        data = JSON.parse(readFileSync(NOTIFIED_FILE_PATH, "utf-8"));
      } catch {
        data = {};
      }
    }

    // Clean up old entries
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, timestamp] of Object.entries(data)) {
      if (timestamp < oneHourAgo) {
        delete data[id];
      }
    }

    data[taskId] = Date.now();
    writeFileSync(NOTIFIED_FILE_PATH, JSON.stringify(data));
  } catch {
    // Silently fail
  }
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
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

  let toolInput: PostToolUseInput;
  try {
    toolInput = JSON.parse(inputData);
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Only process MCP tool outputs
  if (!toolInput.tool?.includes("oh-my-claude-background")) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Check for poll_task or list_tasks responses that contain completed tasks
  const toolOutput = toolInput.tool_output;
  if (!toolOutput) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  try {
    const output = JSON.parse(toolOutput);
    const notifiedTasks = loadNotifiedTasks();
    const notifications: string[] = [];

    // Check for single task completion (poll_task)
    if (output.status === "completed" && toolInput.tool?.includes("poll_task")) {
      // This is handled by the poll itself, no need for additional notification
      console.log(JSON.stringify({ decision: "approve" }));
      return;
    }

    // Check for task list with completed tasks
    if (output.tasks && Array.isArray(output.tasks)) {
      for (const task of output.tasks) {
        if (
          (task.status === "completed" || task.status === "failed") &&
          task.id &&
          !notifiedTasks.has(task.id)
        ) {
          // Calculate duration if we have timestamps
          let durationStr = "";
          if (task.created && task.completed) {
            const created = new Date(task.created).getTime();
            const completed = new Date(task.completed).getTime();
            durationStr = ` (${formatDuration(completed - created)})`;
          }

          const statusIcon = task.status === "completed" ? "+" : "!";
          const agentName = task.agent || "unknown";
          notifications.push(
            `[${statusIcon}] ${agentName}: ${task.status}${durationStr}`
          );

          saveNotifiedTask(task.id);
        }
      }
    }

    if (notifications.length > 0) {
      const response: HookResponse = {
        decision: "approve",
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `\n[omc] ${notifications.join(" | ")}`,
        },
      };
      console.log(JSON.stringify(response));
      return;
    }
  } catch {
    // Parsing failed, just approve
  }

  console.log(JSON.stringify({ decision: "approve" }));
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
