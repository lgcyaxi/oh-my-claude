#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/hooks/post-tool-use/post-tool.ts
import {
  readFileSync as readFileSync7,
  writeFileSync as writeFileSync4,
  appendFileSync as appendFileSync2,
  existsSync as existsSync7,
  mkdirSync as mkdirSync4,
  readdirSync as readdirSync3,
  statSync as statSync4,
  unlinkSync as unlinkSync3
} from "node:fs";
import { join as join7, dirname } from "node:path";
import { homedir as homedir7 } from "node:os";
import { createHash as createHash2 } from "node:crypto";

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

// src/memory/hooks/paths.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync2, readFileSync as readFileSync2, statSync as statSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2 } from "node:os";
var STATE_DIR = join2(homedir2(), ".claude", "oh-my-claude", "state");
function shortHash(str) {
  return createHash("sha256").update(str).digest("hex").slice(0, 8);
}
function formatLocalYYYYMMDDLite(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatLocalHHMMSSLite(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}${m}${s}`;
}
function getStateFile(projectCwd) {
  const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
  return join2(STATE_DIR, `context-memory-state${suffix}.json`);
}
function getSessionLogPath(projectCwd) {
  const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
  return join2(homedir2(), ".claude", "oh-my-claude", "memory", "sessions", `active-session${suffix}.jsonl`);
}
function findGitRoot(fromDir) {
  let dir = fromDir;
  while (true) {
    if (existsSync2(join2(dir, ".git"))) {
      return dir;
    }
    const parent = join2(dir, "..");
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}
function resolveCanonicalRoot(projectRoot) {
  const gitPath = join2(projectRoot, ".git");
  if (!existsSync2(gitPath))
    return null;
  try {
    const stat = statSync2(gitPath);
    if (stat.isDirectory())
      return projectRoot;
    const content = readFileSync2(gitPath, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (!match)
      return null;
    const gitdir = match[1].trim();
    const normalized = gitdir.replace(/\\/g, "/");
    const worktreesIdx = normalized.indexOf("/.git/worktrees/");
    if (worktreesIdx === -1)
      return null;
    return gitdir.slice(0, worktreesIdx);
  } catch {
    return null;
  }
}
// src/memory/hooks/proxy.ts
import {
  existsSync as existsSync3,
  readFileSync as readFileSync3,
  writeFileSync as writeFileSync2,
  mkdirSync as mkdirSync2,
  unlinkSync
} from "node:fs";
import { join as join3 } from "node:path";
import { homedir as homedir3 } from "node:os";
var DEFAULT_CONTROL_PORT = 18911;
function getControlPort() {
  const env = process.env.OMC_CONTROL_PORT || process.env.OMC_PROXY_CONTROL_PORT;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed))
      return parsed;
  }
  return DEFAULT_CONTROL_PORT;
}
async function isProxyHealthy(controlPort) {
  const port = controlPort ?? getControlPort();
  try {
    const resp = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(500)
    });
    if (!resp.ok)
      return false;
    const data = await resp.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}
async function ensureProxy(projectCwd) {
  const controlPort = getControlPort();
  if (await isProxyHealthy(controlPort)) {
    return controlPort;
  }
  try {
    const proxyScript = join3(homedir3(), ".claude", "oh-my-claude", "dist", "proxy", "server.js");
    if (!existsSync3(proxyScript)) {
      console.error("[hook:proxy] Proxy script not found, cannot auto-spawn");
      return null;
    }
    let bunPath = "bun";
    try {
      const { execSync: execSync2 } = await import("node:child_process");
      bunPath = execSync2("which bun", {
        encoding: "utf-8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
    } catch {}
    const { spawn: spawnProcess } = await import("node:child_process");
    const child = spawnProcess(bunPath, [
      "run",
      proxyScript,
      "--port",
      "18910",
      "--control-port",
      String(controlPort)
    ], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env },
      windowsHide: true
    });
    child.unref();
    const pid = child.pid;
    if (!pid) {
      console.error("[hook:proxy] Failed to spawn proxy (no PID)");
      return null;
    }
    const sessionHash = projectCwd ? shortHash(projectCwd) : "global";
    const sessionsDir = join3(homedir3(), ".claude", "oh-my-claude", "sessions", sessionHash);
    mkdirSync2(sessionsDir, { recursive: true });
    writeFileSync2(join3(sessionsDir, "auto-proxy.json"), JSON.stringify({
      pid,
      autoSpawned: true,
      startedAt: new Date().toISOString()
    }), "utf-8");
    for (let i = 0;i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (await isProxyHealthy(controlPort)) {
        console.error(`[hook:proxy] Auto-spawned proxy (PID ${pid}) on port ${controlPort}`);
        return controlPort;
      }
    }
    console.error("[hook:proxy] Auto-spawned proxy but health check timed out");
    return null;
  } catch (error) {
    console.error("[hook:proxy] Failed to auto-spawn proxy:", error);
    return null;
  }
}
function cleanupAutoProxy(projectCwd) {
  try {
    const sessionHash = projectCwd ? shortHash(projectCwd) : "global";
    const autoProxyFile = join3(homedir3(), ".claude", "oh-my-claude", "sessions", sessionHash, "auto-proxy.json");
    if (!existsSync3(autoProxyFile))
      return;
    const data = JSON.parse(readFileSync3(autoProxyFile, "utf-8"));
    if (data.autoSpawned && data.pid) {
      try {
        process.kill(data.pid, "SIGTERM");
        console.error(`[hook:proxy] Killed auto-spawned proxy (PID ${data.pid})`);
      } catch {}
    }
    unlinkSync(autoProxyFile);
  } catch {}
}
// src/memory/hooks/config.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { join as join4 } from "node:path";
import { homedir as homedir4 } from "node:os";
var DEFAULT_SESSION_LOG_THRESHOLD_KB = 40;
var DEFAULT_AUTO_ROTATE = {
  enabled: true,
  graceDays: 1,
  thresholdFiles: 3,
  maxDatesPerRun: 2,
  useLLMWhenAvailable: true
};
function coerceAutoRotate(raw) {
  if (!raw || typeof raw !== "object")
    return { ...DEFAULT_AUTO_ROTATE };
  const r = raw;
  const pickNum = (key, fallback) => {
    const v = r[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const pickBool = (key, fallback) => {
    const v = r[key];
    return typeof v === "boolean" ? v : fallback;
  };
  return {
    enabled: pickBool("enabled", DEFAULT_AUTO_ROTATE.enabled),
    graceDays: pickNum("graceDays", DEFAULT_AUTO_ROTATE.graceDays),
    thresholdFiles: pickNum("thresholdFiles", DEFAULT_AUTO_ROTATE.thresholdFiles),
    maxDatesPerRun: pickNum("maxDatesPerRun", DEFAULT_AUTO_ROTATE.maxDatesPerRun),
    useLLMWhenAvailable: pickBool("useLLMWhenAvailable", DEFAULT_AUTO_ROTATE.useLLMWhenAvailable)
  };
}
function loadHookConfig() {
  const configPath = join4(homedir4(), ".claude", "oh-my-claude.json");
  try {
    if (existsSync4(configPath)) {
      const raw = readFileSync4(configPath, "utf-8");
      const config = JSON.parse(raw);
      return {
        threshold: config.memory?.autoSaveThreshold === 0 ? 0 : Math.round((config.memory?.autoSaveThreshold ?? 75) * 1.33),
        autoRotate: coerceAutoRotate(config.memory?.autoRotate)
      };
    }
  } catch {}
  return {
    threshold: DEFAULT_SESSION_LOG_THRESHOLD_KB,
    autoRotate: { ...DEFAULT_AUTO_ROTATE }
  };
}
// src/memory/hooks/session.ts
import {
  existsSync as existsSync5,
  readFileSync as readFileSync5,
  writeFileSync as writeFileSync3,
  mkdirSync as mkdirSync3,
  statSync as statSync3,
  appendFileSync,
  readdirSync as readdirSync2,
  unlinkSync as unlinkSync2
} from "node:fs";
import { join as join5 } from "node:path";
import { homedir as homedir5 } from "node:os";
var STATE_DIR2 = join5(homedir5(), ".claude", "oh-my-claude", "state");
function loadState(projectCwd) {
  try {
    const stateFile = getStateFile(projectCwd);
    if (existsSync5(stateFile)) {
      const raw = readFileSync5(stateFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return { lastSaveTimestamp: null, lastSaveLogSizeKB: null, saveCount: 0 };
}
function saveState(state, projectCwd) {
  try {
    mkdirSync3(STATE_DIR2, { recursive: true });
    writeFileSync3(getStateFile(projectCwd), JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}
function getSessionLogSizeKB(projectCwd) {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (!existsSync5(logPath))
      return 0;
    const stats = statSync3(logPath);
    return Math.round(stats.size / 1024);
  } catch {
    return 0;
  }
}
function readSessionLog(projectCwd) {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (!existsSync5(logPath))
      return "";
    const raw = readFileSync5(logPath, "utf-8").trim();
    if (!raw)
      return "";
    const lines = raw.split(`
`).filter(Boolean);
    const observations = [];
    for (const line of lines) {
      try {
        const obs = JSON.parse(line);
        const time = obs.ts.slice(11, 19);
        observations.push(`  [${time}] ${obs.tool}: ${obs.summary}`);
      } catch {}
    }
    const joined = observations.join(`
`);
    return joined.length > 8000 ? `...
` + joined.slice(-8000) : joined;
  } catch {
    return "";
  }
}
function clearSessionLog(projectCwd) {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (existsSync5(logPath)) {
      unlinkSync2(logPath);
    }
  } catch {}
}
function pruneEmptySessionLogs(options = {}) {
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const currentLogPath = options.currentCwd ? getSessionLogPath(options.currentCwd) : null;
  const sessionsDir = join5(homedir5(), ".claude", "oh-my-claude", "memory", "sessions");
  let removed = 0;
  try {
    if (!existsSync5(sessionsDir))
      return 0;
    const entries = readdirSync2(sessionsDir);
    const now = Date.now();
    for (const name of entries) {
      if (!name.startsWith("active-session") || !name.endsWith(".jsonl")) {
        continue;
      }
      const full = join5(sessionsDir, name);
      if (currentLogPath && full === currentLogPath)
        continue;
      try {
        const s = statSync3(full);
        const stale = now - s.mtimeMs > maxAgeMs;
        if (s.size === 0 || stale) {
          unlinkSync2(full);
          removed += 1;
        }
      } catch {}
    }
  } catch {}
  return removed;
}
function logUserPrompt(prompt, projectCwd) {
  if (!prompt || prompt.length < 5)
    return;
  try {
    const logDir = join5(homedir5(), ".claude", "oh-my-claude", "memory", "sessions");
    if (!existsSync5(logDir)) {
      mkdirSync3(logDir, { recursive: true });
    }
    const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
    const logPath = join5(logDir, `active-session${suffix}.jsonl`);
    const truncated = prompt.length > 200 ? prompt.slice(0, 200) + "..." : prompt;
    const observation = {
      ts: new Date().toISOString(),
      tool: "UserPrompt",
      summary: `user: ${truncated}`
    };
    appendFileSync(logPath, JSON.stringify(observation) + `
`, "utf-8");
  } catch {}
}
// src/memory/hooks/timeline.ts
import { existsSync as existsSync6, readFileSync as readFileSync6 } from "node:fs";
import { join as join6 } from "node:path";
import { homedir as homedir6 } from "node:os";
function getTimelineContent(projectCwd, maxLines = 80) {
  const lines = [];
  if (projectCwd) {
    const projectTimeline = join6(projectCwd, ".claude", "mem", "TIMELINE.md");
    if (existsSync6(projectTimeline)) {
      try {
        const content = readFileSync6(projectTimeline, "utf-8").trim();
        if (content)
          lines.push(content);
      } catch {}
    }
  }
  const globalTimeline = join6(homedir6(), ".claude", "oh-my-claude", "memory", "TIMELINE.md");
  if (existsSync6(globalTimeline)) {
    try {
      const content = readFileSync6(globalTimeline, "utf-8").trim();
      if (content) {
        if (lines.length > 0) {
          lines.push("");
          lines.push("---");
          lines.push("# Global Memory Timeline");
          const globalLines = content.split(`
`);
          const startIdx = globalLines.findIndex((l) => l.startsWith("> "));
          if (startIdx >= 0) {
            lines.push(...globalLines.slice(startIdx));
          } else {
            lines.push(content);
          }
        } else {
          lines.push(content);
        }
      }
    } catch {}
  }
  if (lines.length === 0)
    return null;
  const combined = lines.join(`
`);
  const allLines = combined.split(`
`);
  if (allLines.length > maxLines) {
    return allLines.slice(0, maxLines).join(`
`) + `
> ... truncated`;
  }
  return combined;
}
// src/hooks/post-tool-use/post-tool.ts
function shortHash2(str) {
  return createHash2("sha256").update(str).digest("hex").slice(0, 8);
}
function truncate(str, max) {
  if (str.length <= max)
    return str;
  return str.slice(0, max) + "...";
}
function getSessionLogPath2(projectCwd) {
  const suffix = projectCwd ? `-${shortHash2(projectCwd)}` : "";
  return join7(homedir7(), ".claude", "oh-my-claude", "memory", "sessions", `active-session${suffix}.jsonl`);
}
function summarizeToolInput(tool, input) {
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
function logToolObservation(toolName, toolInput, toolOutput, projectCwd) {
  if (toolName === "session-logger" || toolName === "auto-memory" || toolName === "context-memory")
    return;
  const inputSummary = summarizeToolInput(toolName, toolInput);
  const outputFirstLine = toolOutput ? truncate(toolOutput.split(`
`)[0] ?? "", 100) : "";
  const summary = outputFirstLine ? `${inputSummary} → ${outputFirstLine}` : inputSummary;
  const observation = {
    ts: new Date().toISOString(),
    tool: toolName,
    summary
  };
  try {
    const logDir = join7(homedir7(), ".claude", "oh-my-claude", "memory", "sessions");
    mkdirSync4(logDir, { recursive: true });
    const logPath = getSessionLogPath2(projectCwd);
    appendFileSync2(logPath, JSON.stringify(observation) + `
`, "utf-8");
  } catch {}
}
var AGENT_DISPLAY_NAMES = {
  Bash: "Bash",
  Explore: "Scout",
  Plan: "Planner",
  "general-purpose": "General",
  "claude-code-guide": "Guide"
};
var DEFAULT_MODELS = {
  Plan: "sonnet",
  Explore: "haiku",
  Bash: "haiku",
  "general-purpose": "sonnet",
  "claude-code-guide": "haiku"
};
function loadTaskAgents() {
  try {
    const path = getSessionTaskAgentsPath();
    if (!existsSync7(path))
      return { agents: [] };
    const data = JSON.parse(readFileSync7(path, "utf-8"));
    return Array.isArray(data?.agents) ? data : { agents: [] };
  } catch {
    return { agents: [] };
  }
}
function saveTaskAgents(data) {
  try {
    ensureSessionDir();
    writeFileSync4(getSessionTaskAgentsPath(), JSON.stringify(data, null, 2));
  } catch {}
}
function updateStatusFile(taskAgents) {
  try {
    ensureSessionDir();
    const statusPath = getSessionStatusPath();
    let status = {
      activeTasks: [],
      providers: {},
      updatedAt: new Date().toISOString()
    };
    if (existsSync7(statusPath)) {
      try {
        status = JSON.parse(readFileSync7(statusPath, "utf-8"));
      } catch {}
    }
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const taskAgentTasks = taskAgents.agents.filter((a) => a.startedAt > thirtyMinutesAgo).map((a) => ({
      agent: `@${a.type}`,
      startedAt: a.startedAt,
      model: a.model,
      isTaskTool: true
    }));
    const mcpTasks = (status.activeTasks || []).filter((t) => !t.isTaskTool);
    status.activeTasks = [...mcpTasks, ...taskAgentTasks];
    status.updatedAt = new Date().toISOString();
    writeFileSync4(statusPath, JSON.stringify(status, null, 2));
  } catch {}
}
function handleTaskTool(input) {
  const toolInputData = input.tool_input || input.input || {};
  const subagentType = toolInputData.subagent_type || "unknown";
  const description = toolInputData.description || "";
  const model = toolInputData.model || DEFAULT_MODELS[subagentType] || "?";
  const displayName = AGENT_DISPLAY_NAMES[subagentType] || subagentType;
  const hookEventName = input.hook_event_name;
  const hasResponse = input.tool_response || input.tool_output || input.output;
  const isPreToolUse = hookEventName === "PreToolUse" || hookEventName === undefined && !hasResponse;
  if (isPreToolUse) {
    const taskAgents2 = loadTaskAgents();
    taskAgents2.agents.push({
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: displayName,
      description,
      model,
      startedAt: Date.now()
    });
    saveTaskAgents(taskAgents2);
    updateStatusFile(taskAgents2);
    return null;
  }
  const taskAgents = loadTaskAgents();
  const index = taskAgents.agents.findIndex((a) => a.type === displayName);
  if (index !== -1) {
    const removed = taskAgents.agents.splice(index, 1)[0];
    saveTaskAgents(taskAgents);
    updateStatusFile(taskAgents);
    if (removed) {
      const duration = Math.floor((Date.now() - removed.startedAt) / 1000);
      const durationStr = duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m`;
      return `[@] ${displayName}: completed (${durationStr})`;
    }
  }
  return null;
}
var SIGNALS_DIR = join7(homedir7(), ".claude", "oh-my-claude", "signals", "completed");
var NOTIFIED_FILE = join7(homedir7(), ".claude", "oh-my-claude", "notified-tasks.json");
function scanCompletionSignals() {
  if (!existsSync7(SIGNALS_DIR))
    return [];
  const notifications = [];
  let notified;
  try {
    if (existsSync7(NOTIFIED_FILE)) {
      const data = JSON.parse(readFileSync7(NOTIFIED_FILE, "utf-8"));
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      notified = new Set(Object.entries(data).filter(([_, ts]) => ts > oneHourAgo).map(([id]) => id));
    } else {
      notified = new Set;
    }
  } catch {
    notified = new Set;
  }
  try {
    const files = readdirSync3(SIGNALS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const filePath = join7(SIGNALS_DIR, file);
      try {
        const signal = JSON.parse(readFileSync7(filePath, "utf-8"));
        if (notified.has(signal.taskId)) {
          try {
            unlinkSync3(filePath);
          } catch {}
          continue;
        }
        const age = Date.now() - new Date(signal.completedAt).getTime();
        const durationStr = age < 5000 ? "just now" : formatDuration(age) + " ago";
        notifications.push(`[@] ${signal.agentName}: ${signal.status} (${durationStr})`);
        notified.add(signal.taskId);
        try {
          unlinkSync3(filePath);
        } catch {}
      } catch {
        try {
          unlinkSync3(filePath);
        } catch {}
      }
    }
  } catch {}
  if (notifications.length > 0) {
    try {
      const dir = dirname(NOTIFIED_FILE);
      if (!existsSync7(dir))
        mkdirSync4(dir, { recursive: true });
      const data = {};
      const now = Date.now();
      for (const id of notified)
        data[id] = now;
      writeFileSync4(NOTIFIED_FILE, JSON.stringify(data));
    } catch {}
  }
  return notifications;
}
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60)
    return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}
function findGitRoot2(fromDir) {
  let dir = fromDir;
  while (true) {
    if (existsSync7(join7(dir, ".git")))
      return dir;
    const parent = join7(dir, "..");
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}
function resolveCanonicalRoot2(projectRoot) {
  const gitPath = join7(projectRoot, ".git");
  try {
    const stat = statSync4(gitPath);
    if (stat.isDirectory())
      return projectRoot;
    const content = readFileSync7(gitPath, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (!match)
      return projectRoot;
    const gitdir = match[1].trim().replace(/\\/g, "/");
    const idx = gitdir.indexOf("/.git/worktrees/");
    return idx === -1 ? projectRoot : gitdir.slice(0, idx);
  } catch {
    return projectRoot;
  }
}
function saveMiniNote(toolInput, projectCwd) {
  const command = String(toolInput.command ?? "");
  if (!command.includes("git commit"))
    return;
  try {
    const logPath = getSessionLogPath2(projectCwd);
    if (!existsSync7(logPath))
      return;
    const raw = readFileSync7(logPath, "utf-8").trim();
    if (!raw || raw.length < 200)
      return;
    const lines = raw.split(`
`).filter(Boolean);
    const lastLines = lines.slice(-10);
    const body = lastLines.map((l) => {
      try {
        const obs = JSON.parse(l);
        return `[${obs.ts?.slice(11, 19) ?? "?"}] ${obs.tool}: ${obs.summary}`;
      } catch {
        return l;
      }
    }).join(`
`);
    let notesDir;
    if (projectCwd) {
      const gitRoot = findGitRoot2(projectCwd);
      if (gitRoot) {
        notesDir = join7(resolveCanonicalRoot2(gitRoot), ".claude", "mem", "notes");
      } else {
        notesDir = join7(homedir7(), ".claude", "oh-my-claude", "memory", "notes");
      }
    } else {
      notesDir = join7(homedir7(), ".claude", "oh-my-claude", "memory", "notes");
    }
    mkdirSync4(notesDir, { recursive: true });
    const now = new Date;
    const dateStr = formatLocalYYYYMMDDLite(now);
    const timeStr = formatLocalHHMMSSLite(now);
    const content = [
      "---",
      `title: "Commit checkpoint ${dateStr}"`,
      `type: note`,
      `tags: [auto-extract, completion]`,
      `created: "${now.toISOString()}"`,
      `updated: "${now.toISOString()}"`,
      "---",
      "",
      "Recent activity before commit:",
      "",
      body,
      ""
    ].join(`
`);
    writeFileSync4(join7(notesDir, `auto-commit-${dateStr}-${timeStr}.md`), content, "utf-8");
    console.error(`[post-tool] Commit mini-note saved`);
  } catch {}
}
async function main() {
  writeCurrentPPID();
  let inputData = "";
  try {
    inputData = readFileSync7(0, "utf-8");
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
  logToolObservation(toolName, toolInput, toolOutput, projectCwd);
  let taskContext = null;
  if (toolName === "Task") {
    taskContext = handleTaskTool(input);
  }
  const signalNotifications = scanCompletionSignals();
  if (toolName === "Bash") {
    saveMiniNote(toolInput, projectCwd);
  }
  const contextParts = [];
  if (taskContext)
    contextParts.push(taskContext);
  if (signalNotifications.length > 0)
    contextParts.push(...signalNotifications);
  if (contextParts.length > 0) {
    const response = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `
` + contextParts.join(`
`)
      }
    };
    console.log(JSON.stringify(response));
  } else {
    console.log(JSON.stringify({ decision: "approve" }));
  }
}
main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
