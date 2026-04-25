#!/usr/bin/env node

// src/hooks/post-tool-use/task-notification.ts
import {
  readFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
  mkdirSync
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
var SIGNALS_DIR = join(homedir(), ".claude", "oh-my-claude", "signals", "completed");
var NOTIFIED_FILE_PATH = join(homedir(), ".claude", "oh-my-claude", "notified-tasks.json");
function loadNotifiedTasks() {
  try {
    if (!existsSync(NOTIFIED_FILE_PATH))
      return new Set;
    const data = JSON.parse(readFileSync(NOTIFIED_FILE_PATH, "utf-8"));
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return new Set(Object.entries(data).filter(([_, ts]) => ts > oneHourAgo).map(([id]) => id));
  } catch {
    return new Set;
  }
}
function saveNotifiedTasks(notified) {
  try {
    const dir = dirname(NOTIFIED_FILE_PATH);
    if (!existsSync(dir))
      mkdirSync(dir, { recursive: true });
    const data = {};
    const now = Date.now();
    for (const id of notified)
      data[id] = now;
    writeFileSync(NOTIFIED_FILE_PATH, JSON.stringify(data));
  } catch {}
}
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60)
    return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
function scanSignalFiles(notified) {
  const notifications = [];
  if (!existsSync(SIGNALS_DIR))
    return notifications;
  try {
    const files = readdirSync(SIGNALS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const filePath = join(SIGNALS_DIR, file);
      try {
        const signal = JSON.parse(readFileSync(filePath, "utf-8"));
        if (notified.has(signal.taskId)) {
          try {
            unlinkSync(filePath);
          } catch {}
          continue;
        }
        const completedAt = new Date(signal.completedAt).getTime();
        const age = Date.now() - completedAt;
        const durationStr = age < 5000 ? "just now" : `${formatDuration(age)} ago`;
        const statusIcon = signal.status === "completed" ? "+" : "!";
        notifications.push(`[@] ${signal.agentName}: ${signal.status} (${durationStr})`);
        notified.add(signal.taskId);
        try {
          unlinkSync(filePath);
        } catch {}
      } catch {
        try {
          unlinkSync(filePath);
        } catch {}
      }
    }
  } catch {}
  return notifications;
}
async function main() {
  try {
    readFileSync(0, "utf-8");
  } catch {}
  const notified = loadNotifiedTasks();
  const notifications = scanSignalFiles(notified);
  if (notifications.length > 0) {
    saveNotifiedTasks(notified);
    const response = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `
${notifications.join(`
`)}`
      }
    };
    console.log(JSON.stringify(response));
    return;
  }
  console.log(JSON.stringify({ decision: "approve" }));
}
main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
