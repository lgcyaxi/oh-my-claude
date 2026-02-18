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
  cwd?: string;
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
 * Appends a JSONL observation to the project-scoped session log.
 */
function logUserPrompt(prompt: string, projectCwd?: string): void {
  if (!prompt || prompt.length < 5) return;
  try {
    const logDir = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    // Scope session log by project hash to avoid multi-instance contamination
    const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
    const logPath = join(logDir, `active-session${suffix}.jsonl`);
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

/** Compute a short hash of a string for project-scoped filenames */
function shortHash(str: string): string {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(str).digest("hex").slice(0, 8);
}

/**
 * Count memories in the memory store (both global and project-scoped)
 */
function getMemoryCount(projectCwd?: string): number {
  let count = 0;

  // Count global memories
  const globalDir = join(homedir(), ".claude", "oh-my-claude", "memory");
  for (const subdir of ["notes", "sessions"]) {
    const dir = join(globalDir, subdir);
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
        count += files.length;
      } catch {
        // ignore
      }
    }
  }

  // Count project-scoped memories if cwd is available
  if (projectCwd) {
    const projectMemDir = join(projectCwd, ".claude", "mem");
    if (existsSync(projectMemDir)) {
      for (const subdir of ["notes", "sessions"]) {
        const dir = join(projectMemDir, subdir);
        if (existsSync(dir)) {
          try {
            const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
            count += files.length;
          } catch {
            // ignore
          }
        }
      }
    }
  }

  return count;
}

/**
 * Read and combine TIMELINE.md files from project and global scopes.
 * Returns combined timeline content truncated to maxLines, or null if no timeline exists.
 */
function getTimelineContent(projectCwd?: string, maxLines: number = 80): string | null {
  const lines: string[] = [];

  // Read project timeline first (higher priority)
  if (projectCwd) {
    const projectTimeline = join(projectCwd, ".claude", "mem", "TIMELINE.md");
    if (existsSync(projectTimeline)) {
      try {
        const content = readFileSync(projectTimeline, "utf-8").trim();
        if (content) lines.push(content);
      } catch {
        // ignore
      }
    }
  }

  // Read global timeline
  const globalTimeline = join(homedir(), ".claude", "oh-my-claude", "memory", "TIMELINE.md");
  if (existsSync(globalTimeline)) {
    try {
      const content = readFileSync(globalTimeline, "utf-8").trim();
      if (content) {
        if (lines.length > 0) {
          // Separate project and global timelines
          lines.push("");
          lines.push("---");
          lines.push("# Global Memory Timeline");
          // Strip the header from global content to avoid duplicate "# Memory Timeline"
          const globalLines = content.split("\n");
          const startIdx = globalLines.findIndex(l => l.startsWith("> "));
          if (startIdx >= 0) {
            lines.push(...globalLines.slice(startIdx));
          } else {
            lines.push(content);
          }
        } else {
          lines.push(content);
        }
      }
    } catch {
      // ignore
    }
  }

  if (lines.length === 0) return null;

  const combined = lines.join("\n");
  const allLines = combined.split("\n");

  if (allLines.length > maxLines) {
    return allLines.slice(0, maxLines).join("\n") + "\n> ... truncated";
  }

  return combined;
}

// ── Completion signal scanning ──────────────────────────────────────
const SIGNALS_DIR = join(homedir(), ".claude", "oh-my-claude", "signals", "completed");

/**
 * Scan for completed task signals and consume them.
 * Returns notification strings for any found completions.
 */
function scanCompletionSignals(): string[] {
  if (!existsSync(SIGNALS_DIR)) return [];
  const notifications: string[] = [];
  try {
    const { unlinkSync } = require("node:fs");
    const files = readdirSync(SIGNALS_DIR).filter((f: string) => f.endsWith(".json"));
    for (const file of files) {
      const filePath = join(SIGNALS_DIR, file);
      try {
        const signal = JSON.parse(readFileSync(filePath, "utf-8"));
        const icon = signal.status === "completed" ? "+" : "!";
        notifications.push(`[@] ${signal.agentName}: ${signal.status}`);
        unlinkSync(filePath); // consume signal
      } catch {
        try { unlinkSync(filePath); } catch { /* best effort */ }
      }
    }
  } catch { /* directory read failed */ }
  return notifications;
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

  const projectCwd = input.cwd;

  // Check for completed background task signals
  const taskNotifications = scanCompletionSignals();

  const memoryCount = getMemoryCount(projectCwd);

  // Log user prompt to session log for richer auto-memory context
  const prompt = input.prompt?.toLowerCase() ?? "";
  const rawPrompt = input.prompt ?? "";
  logUserPrompt(rawPrompt, projectCwd);

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

  const timeline = getTimelineContent(projectCwd);

  // Prepend task notifications to any context we emit
  const taskPrefix = taskNotifications.length > 0
    ? taskNotifications.join("\n") + "\n\n"
    : "";

  if (isCompletionTrigger) {
    let context =
      `[omc-memory] Task completion detected. ` +
      `IMPORTANT: Before finishing, call remember() to store key decisions, patterns, or findings from this session. ` +
      `This ensures cross-session continuity.` +
      (memoryCount > 0 ? ` (${memoryCount} existing memories)` : "");

    if (timeline) {
      context += `\n\n${timeline}`;
    }

    const response: HookResponse = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: taskPrefix + context,
      },
    };
    console.log(JSON.stringify(response));
    return;
  }

  if (memoryCount > 0 && isSignificantWork) {
    let context =
      `[omc-memory] ${memoryCount} memories available. ` +
      `IMPORTANT: You MUST call mcp__oh-my-claude-background__recall with keywords from the user's request BEFORE starting work. ` +
      `After completing work, call mcp__oh-my-claude-background__remember to store key decisions and findings.`;

    if (timeline) {
      context += `\n\n${timeline}`;
    }

    const response: HookResponse = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: taskPrefix + context,
      },
    };
    console.log(JSON.stringify(response));
    return;
  }

  // Even if no memory context, emit task notifications if any
  if (taskNotifications.length > 0) {
    const response: HookResponse = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: taskNotifications.join("\n"),
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
