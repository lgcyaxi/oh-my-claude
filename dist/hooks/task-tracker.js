#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/hooks/pre-tool-use/task-tracker.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2 } from "node:os";

// src/statusline/session.ts
import { join } from "node:path";
import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
var SESSIONS_DIR = join(homedir(), ".claude", "oh-my-claude", "sessions");
var PPID_FILE = join(homedir(), ".claude", "oh-my-claude", "current-ppid.txt");
var _sessionId = null;
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function getProcessInfo(pid) {
  if (process.platform === "win32") {
    try {
      const result = spawnSync("powershell", [
        "-NoProfile",
        "-Command",
        `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object @{Name='Name';Expression={$_.ProcessName}}, @{Name='ParentId';Expression={$_.ParentProcessId}} | ConvertTo-Json`
      ], {
        encoding: "utf-8",
        timeout: 5000
      });
      if (result.status !== 0 || !result.stdout) {
        return null;
      }
      const data = JSON.parse(result.stdout.trim());
      if (!data || !data.Name || !data.ParentId) {
        return null;
      }
      return { comm: data.Name, ppid: data.ParentId };
    } catch {
      return null;
    }
  }
  try {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "comm=,ppid="], {
      encoding: "utf-8",
      timeout: 1000
    });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }
    const output = result.stdout.trim();
    const parts = output.split(/\s+/);
    if (parts.length < 2)
      return null;
    const ppidStr = parts[parts.length - 1] ?? "";
    const comm = parts.slice(0, -1).join(" ");
    const ppid = parseInt(ppidStr, 10);
    if (isNaN(ppid))
      return null;
    return { comm, ppid };
  } catch {
    return null;
  }
}
function findClaudeCodePID() {
  let currentPid = process.ppid;
  const maxDepth = 10;
  for (let i = 0;i < maxDepth; i++) {
    const info = getProcessInfo(currentPid);
    if (!info)
      break;
    const commLower = info.comm.toLowerCase();
    const isClaude = process.platform === "win32" ? commLower === "claude" || commLower === "claude.exe" : commLower === "claude" || commLower.endsWith("/claude");
    if (isClaude) {
      return currentPid;
    }
    const minPid = process.platform === "win32" ? 0 : 1;
    if (info.ppid <= minPid)
      break;
    currentPid = info.ppid;
  }
  return null;
}
function getClaudeCodePPID() {
  const claudePid = findClaudeCodePID();
  if (claudePid !== null) {
    return claudePid;
  }
  try {
    if (existsSync(PPID_FILE)) {
      const content = readFileSync(PPID_FILE, "utf-8").trim();
      const parts = content.split(":");
      const pidStr = parts[0] ?? "";
      const timestampStr = parts[1] ?? "";
      const savedPpid = parseInt(pidStr, 10);
      const savedTimestamp = parseInt(timestampStr, 10);
      if (!isNaN(savedPpid) && savedPpid > 0 && isProcessRunning(savedPpid) && Date.now() - savedTimestamp < 30 * 60 * 1000) {
        return savedPpid;
      }
    }
  } catch {}
  return process.ppid;
}
function writeCurrentPPID() {
  try {
    const ppid = process.ppid;
    const timestamp = Date.now();
    const dir = join(homedir(), ".claude", "oh-my-claude");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(PPID_FILE, `${ppid}:${timestamp}`);
  } catch {}
}
function getSessionId() {
  if (!_sessionId) {
    const ppid = getClaudeCodePPID();
    _sessionId = `pid-${ppid}`;
    cleanupStaleSessions();
  }
  return _sessionId;
}
function getSessionStatusPath(sessionId) {
  const id = sessionId ?? getSessionId();
  return join(SESSIONS_DIR, id, "status.json");
}
function getSessionTaskAgentsPath(sessionId) {
  const id = sessionId ?? getSessionId();
  return join(SESSIONS_DIR, id, "task-agents.json");
}
function ensureSessionDir(sessionId) {
  const id = sessionId ?? getSessionId();
  const sessionDir = join(SESSIONS_DIR, id);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}
function cleanupStaleSessions(maxAgeMs = 60 * 60 * 1000) {
  if (!existsSync(SESSIONS_DIR)) {
    return 0;
  }
  const now = Date.now();
  let cleaned = 0;
  try {
    const entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionDir = join(SESSIONS_DIR, entry.name);
        const dirName = entry.name;
        if (dirName.startsWith("pid-")) {
          const pidStr = dirName.substring(4);
          const pid = parseInt(pidStr, 10);
          if (!isNaN(pid) && pid > 0 && !isProcessRunning(pid)) {
            rmSync(sessionDir, { recursive: true, force: true });
            cleaned++;
            continue;
          }
        }
        const statusPath = join(sessionDir, "status.json");
        let isStale = false;
        if (existsSync(statusPath)) {
          const stat = statSync(statusPath);
          isStale = now - stat.mtimeMs > maxAgeMs;
        } else {
          const stat = statSync(sessionDir);
          isStale = now - stat.mtimeMs > maxAgeMs;
        }
        if (isStale) {
          rmSync(sessionDir, { recursive: true, force: true });
          cleaned++;
        }
      }
    }
  } catch {}
  return cleaned;
}

// src/hooks/pre-tool-use/task-tracker.ts
var CONFIG_FILES = [
  join2(homedir2(), ".claude", "oh-my-claude.json"),
  join2(homedir2(), ".claude", "oh-my-claude", "config.json")
];
function loadDebugSetting() {
  if (process.env.DEBUG_TASK_TRACKER === "1") {
    return true;
  }
  for (const configPath of CONFIG_FILES) {
    try {
      if (existsSync2(configPath)) {
        const config = JSON.parse(readFileSync2(configPath, "utf-8"));
        if (config.debugTaskTracker === true) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}
var debug = loadDebugSetting();
var debugLog = (...args) => {
  if (debug) {
    const timestamp = new Date().toISOString();
    try {
      const debugPath = join2(homedir2(), ".claude", "oh-my-claude", "task-tracker-debug.log");
      writeFileSync2(debugPath, `[${timestamp}] ${args.join(" ")}
`, {
        flag: "a"
      });
    } catch {}
  }
};
function loadTaskAgents() {
  try {
    const taskAgentsPath = getSessionTaskAgentsPath();
    if (!existsSync2(taskAgentsPath)) {
      return { agents: [] };
    }
    const content = readFileSync2(taskAgentsPath, "utf-8");
    const data = JSON.parse(content);
    if (!data || !Array.isArray(data.agents)) {
      return { agents: [] };
    }
    return data;
  } catch {
    return { agents: [] };
  }
}
function saveTaskAgents(data) {
  try {
    ensureSessionDir();
    const taskAgentsPath = getSessionTaskAgentsPath();
    writeFileSync2(taskAgentsPath, JSON.stringify(data, null, 2));
    debugLog("Saved task agents:", JSON.stringify(data));
  } catch (error) {
    debugLog("Failed to save task agents:", error);
  }
}
function updateStatusFile() {
  try {
    ensureSessionDir();
    const statusPath = getSessionStatusPath();
    let status = {
      activeTasks: [],
      providers: {},
      updatedAt: new Date().toISOString()
    };
    if (existsSync2(statusPath)) {
      try {
        status = JSON.parse(readFileSync2(statusPath, "utf-8"));
      } catch {}
    }
    const taskAgents = loadTaskAgents();
    const taskAgentTasks = taskAgents.agents.map((agent) => ({
      agent: `@${agent.type}`,
      startedAt: agent.startedAt,
      model: agent.model,
      isTaskTool: true
    }));
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const activeTaskAgents = taskAgentTasks.filter((t) => t.startedAt > thirtyMinutesAgo);
    const mcpTasks = (status.activeTasks || []).filter((t) => !t.isTaskTool);
    status.activeTasks = [...mcpTasks, ...activeTaskAgents];
    status.updatedAt = new Date().toISOString();
    writeFileSync2(statusPath, JSON.stringify(status, null, 2));
  } catch {}
}
function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}
function getAgentDisplayName(subagentType) {
  const mapping = {
    Bash: "Bash",
    Explore: "Scout",
    Plan: "Planner",
    "general-purpose": "General",
    "claude-code-guide": "Guide"
  };
  return mapping[subagentType] || subagentType;
}
function inferDefaultModel(subagentType) {
  const defaultModels = {
    Plan: "sonnet",
    Explore: "haiku",
    Bash: "haiku",
    "general-purpose": "sonnet",
    "claude-code-guide": "haiku"
  };
  return defaultModels[subagentType] ?? "?";
}
async function main() {
  debugLog("task-tracker hook invoked");
  writeCurrentPPID();
  let inputData = "";
  try {
    inputData = readFileSync2(0, "utf-8");
  } catch (error) {
    debugLog("Failed to read stdin:", error);
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }
  debugLog("Raw input:", inputData);
  if (!inputData.trim()) {
    debugLog("Empty input, approving");
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }
  let toolInput;
  try {
    toolInput = JSON.parse(inputData);
  } catch (error) {
    debugLog("Failed to parse JSON:", error);
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }
  debugLog("Parsed toolInput:", JSON.stringify(toolInput));
  const toolName = toolInput.tool || toolInput.tool_name || "";
  if (toolName !== "Task") {
    debugLog("Not a Task tool, approving:", toolName);
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }
  const inputDataFields = toolInput.tool_input || toolInput.input || {};
  const subagentType = inputDataFields.subagent_type || "unknown";
  const description = inputDataFields.description || "";
  const model = inputDataFields.model || inferDefaultModel(subagentType);
  debugLog("Task tool detected - subagent:", subagentType, "model:", model, "(inferred:", !inputDataFields.model, ")");
  const hookEventName = toolInput.hook_event_name;
  const hasResponse = toolInput.tool_response || toolInput.tool_output || toolInput.output;
  const isPreToolUse = hookEventName === "PreToolUse" || hookEventName === undefined && !hasResponse;
  debugLog("Hook event:", hookEventName, "hasResponse:", hasResponse, "isPreToolUse:", isPreToolUse);
  if (isPreToolUse) {
    const taskAgents = loadTaskAgents();
    debugLog("Current task agents:", taskAgents.agents.length);
    const newAgent = {
      id: generateId(),
      type: getAgentDisplayName(subagentType),
      description,
      model,
      startedAt: Date.now()
    };
    debugLog("Adding new agent:", JSON.stringify(newAgent));
    taskAgents.agents.push(newAgent);
    saveTaskAgents(taskAgents);
    updateStatusFile();
    if (debug) {
      const taskAgentsPath = getSessionTaskAgentsPath();
      if (existsSync2(taskAgentsPath)) {
        const verifyData = readFileSync2(taskAgentsPath, "utf-8");
        debugLog("Verified task-agents.json:", verifyData);
      }
    }
    const response = {
      decision: "approve"
    };
    console.log(JSON.stringify(response));
  } else {
    const taskAgents = loadTaskAgents();
    debugLog("Task completion - current agents:", taskAgents.agents.length);
    const displayName = getAgentDisplayName(subagentType);
    const index = taskAgents.agents.findIndex((a) => a.type === displayName);
    debugLog("Looking for agent type:", displayName, "index:", index);
    if (index !== -1) {
      const removedArr = taskAgents.agents.splice(index, 1);
      const removed = removedArr[0];
      if (!removed) {
        console.log(JSON.stringify({ decision: "approve" }));
        return;
      }
      const duration = Math.floor((Date.now() - removed.startedAt) / 1000);
      debugLog("Agent completed, duration:", duration, "seconds");
      saveTaskAgents(taskAgents);
      updateStatusFile();
      const durationStr = duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m`;
      const response = {
        decision: "approve",
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `
[@] ${displayName}: completed (${durationStr})`
        }
      };
      console.log(JSON.stringify(response));
      return;
    }
    debugLog("Agent not found for removal:", displayName);
    console.log(JSON.stringify({ decision: "approve" }));
  }
}
main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
