#!/usr/bin/env node
/**
 * Task Notification Hook (PostToolUse)
 *
 * Detects background task completions via signal files and provides
 * notifications in the Claude Code output. Works on ALL tool calls,
 * not just MCP tools — enabling passive discovery of completed tasks.
 *
 * Signal files are written by task-manager.ts at:
 *   ~/.claude/oh-my-claude/signals/completed/{taskId}.json
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "PostToolUse": [{
 *       "matcher": ".*",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/task-notification.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync, existsSync, readdirSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

interface HookResponse {
  decision: "approve";
  hookSpecificOutput?: {
    hookEventName: "PostToolUse";
    additionalContext?: string;
  };
}

interface CompletionSignal {
  taskId: string;
  status: string;
  agentName: string;
  resultPreview: string;
  completedAt: string;
}

const SIGNALS_DIR = join(homedir(), ".claude", "oh-my-claude", "signals", "completed");

// Dedup file to avoid re-notifying if signal file deletion races
const NOTIFIED_FILE_PATH = join(homedir(), ".claude", "oh-my-claude", "notified-tasks.json");

function loadNotifiedTasks(): Set<string> {
  try {
    if (!existsSync(NOTIFIED_FILE_PATH)) return new Set();
    const data = JSON.parse(readFileSync(NOTIFIED_FILE_PATH, "utf-8"));
    // Clean up entries older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return new Set(
      Object.entries(data)
        .filter(([_, ts]) => (ts as number) > oneHourAgo)
        .map(([id]) => id)
    );
  } catch {
    return new Set();
  }
}

function saveNotifiedTasks(notified: Set<string>): void {
  try {
    const dir = dirname(NOTIFIED_FILE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data: Record<string, number> = {};
    const now = Date.now();
    for (const id of notified) data[id] = now;
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
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Scan signal directory for completed task notifications
 */
function scanSignalFiles(notified: Set<string>): string[] {
  const notifications: string[] = [];

  if (!existsSync(SIGNALS_DIR)) return notifications;

  try {
    const files = readdirSync(SIGNALS_DIR).filter(f => f.endsWith(".json"));

    for (const file of files) {
      const filePath = join(SIGNALS_DIR, file);
      try {
        const signal: CompletionSignal = JSON.parse(readFileSync(filePath, "utf-8"));

        if (notified.has(signal.taskId)) {
          // Already notified — clean up stale signal
          try { unlinkSync(filePath); } catch { /* best effort */ }
          continue;
        }

        // Calculate age for display
        const completedAt = new Date(signal.completedAt).getTime();
        const age = Date.now() - completedAt;
        const durationStr = age < 5000 ? "just now" : `${formatDuration(age)} ago`;

        const statusIcon = signal.status === "completed" ? "+" : "!";
        notifications.push(
          `[@] ${signal.agentName}: ${signal.status} (${durationStr})`
        );

        notified.add(signal.taskId);

        // Remove signal file after consumption
        try { unlinkSync(filePath); } catch { /* best effort */ }
      } catch {
        // Bad signal file — remove it
        try { unlinkSync(filePath); } catch { /* best effort */ }
      }
    }
  } catch {
    // Directory read failed
  }

  return notifications;
}

async function main() {
  // Read input from stdin (required by hook protocol)
  try {
    readFileSync(0, "utf-8");
  } catch {
    // Stdin may be empty for some events
  }

  // Scan for completion signals
  const notified = loadNotifiedTasks();
  const notifications = scanSignalFiles(notified);

  if (notifications.length > 0) {
    saveNotifiedTasks(notified);
    const response: HookResponse = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `\n${notifications.join("\n")}`,
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
