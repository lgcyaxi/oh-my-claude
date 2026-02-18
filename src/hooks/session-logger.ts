#!/usr/bin/env node
/**
 * Session Logger Hook (PostToolUse — all tools)
 *
 * Captures every tool usage as a compact observation line in a session log.
 * This provides the raw material for auto-memory to summarize at session end.
 *
 * Log format: JSONL (one JSON object per line) at:
 *   ~/.claude/oh-my-claude/memory/sessions/active-session.jsonl
 *
 * Each observation captures:
 * - timestamp
 * - tool name
 * - brief input summary (truncated)
 * - brief output summary (truncated)
 *
 * The log is rotated (cleared) when auto-memory processes it at session end.
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "PostToolUse": [{
 *       "matcher": ".*",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/session-logger.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

interface PostToolUseInput {
  tool?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  input?: Record<string, unknown>;
  tool_response?: string;
  tool_output?: string;
  output?: string;
  hook_event_name?: string;
  cwd?: string;
}

interface Observation {
  ts: string;       // ISO timestamp
  tool: string;     // Tool name
  summary: string;  // Brief description of what happened
}

/** Compute a short hash of a string for project-scoped filenames */
function shortHash(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 8);
}

/** Path to the active session log (scoped by project to avoid multi-instance contamination) */
function getSessionLogPath(projectCwd?: string): string {
  const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
  return join(homedir(), ".claude", "oh-my-claude", "memory", "sessions", `active-session${suffix}.jsonl`);
}

/** Ensure session log directory exists */
function ensureLogDir(): void {
  const dir = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions");
  mkdirSync(dir, { recursive: true });
}

/** Truncate a string to max length */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

/** Extract a concise summary from tool input */
function summarizeInput(tool: string, input: Record<string, unknown>): string {
  // Tool-specific summaries
  switch (tool) {
    case "Read":
      return `read ${input.file_path ?? "?"}`;
    case "Write":
      return `write ${input.file_path ?? "?"}`;
    case "Edit":
      return `edit ${input.file_path ?? "?"}: "${truncate(String(input.old_string ?? ""), 40)}" → "${truncate(String(input.new_string ?? ""), 40)}"`;
    case "Glob":
      return `glob ${input.pattern ?? "?"}`;
    case "Grep":
      return `grep "${input.pattern ?? "?"}" in ${input.path ?? "."}`;
    case "Bash":
      return `bash: ${truncate(String(input.command ?? "?"), 80)}`;
    case "Task":
      return `task(${input.subagent_type ?? "?"}): ${truncate(String(input.description ?? input.prompt ?? ""), 60)}`;
    case "WebFetch":
      return `fetch ${input.url ?? "?"}`;
    case "WebSearch":
      return `search "${input.query ?? "?"}"`;
    default:
      // For MCP tools (mcp__...) and others
      if (tool.startsWith("mcp__")) {
        const shortName = tool.split("__").slice(-1)[0];
        return `${shortName}: ${truncate(JSON.stringify(input), 80)}`;
      }
      return truncate(JSON.stringify(input), 100);
  }
}

/** Extract a concise summary from tool output */
function summarizeOutput(output: string): string {
  if (!output) return "";
  // Just first line, truncated
  const firstLine = output.split("\n")[0] ?? "";
  return truncate(firstLine, 100);
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

  let input: PostToolUseInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  const toolName = input.tool || input.tool_name || "?";
  const toolInput = input.tool_input || input.input || {};
  const toolOutput = input.tool_response || input.tool_output || input.output || "";
  const projectCwd = input.cwd;

  // Skip logging our own hooks and trivial tools to avoid noise
  if (toolName === "session-logger" || toolName === "auto-memory") {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Build observation
  const inputSummary = summarizeInput(toolName, toolInput);
  const outputSummary = summarizeOutput(toolOutput);
  const summary = outputSummary ? `${inputSummary} → ${outputSummary}` : inputSummary;

  const observation: Observation = {
    ts: new Date().toISOString(),
    tool: toolName,
    summary,
  };

  // Append to project-scoped session log
  try {
    ensureLogDir();
    const logPath = getSessionLogPath(projectCwd);
    appendFileSync(logPath, JSON.stringify(observation) + "\n", "utf-8");
  } catch {
    // Silently fail — never block tool execution
  }

  // Always approve — this is purely observational
  console.log(JSON.stringify({ decision: "approve" }));
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
