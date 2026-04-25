#!/usr/bin/env node

// src/hooks/post-tool-use/session-logger.ts
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
function shortHash(str) {
  return createHash("sha256").update(str).digest("hex").slice(0, 8);
}
function getSessionLogPath(projectCwd) {
  const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
  return join(homedir(), ".claude", "oh-my-claude", "memory", "sessions", `active-session${suffix}.jsonl`);
}
function ensureLogDir() {
  const dir = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions");
  mkdirSync(dir, { recursive: true });
}
function truncate(str, max) {
  if (str.length <= max)
    return str;
  return str.slice(0, max) + "...";
}
function summarizeInput(tool, input) {
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
      if (tool.startsWith("mcp__")) {
        const shortName = tool.split("__").slice(-1)[0];
        return `${shortName}: ${truncate(JSON.stringify(input), 80)}`;
      }
      return truncate(JSON.stringify(input), 100);
  }
}
function summarizeOutput(output) {
  if (!output)
    return "";
  const firstLine = output.split(`
`)[0] ?? "";
  return truncate(firstLine, 100);
}
async function main() {
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
  let input;
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
  if (toolName === "session-logger" || toolName === "auto-memory") {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }
  const inputSummary = summarizeInput(toolName, toolInput);
  const outputSummary = summarizeOutput(toolOutput);
  const summary = outputSummary ? `${inputSummary} → ${outputSummary}` : inputSummary;
  const observation = {
    ts: new Date().toISOString(),
    tool: toolName,
    summary
  };
  try {
    ensureLogDir();
    const logPath = getSessionLogPath(projectCwd);
    appendFileSync(logPath, JSON.stringify(observation) + `
`, "utf-8");
  } catch {}
  console.log(JSON.stringify({ decision: "approve" }));
}
main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
