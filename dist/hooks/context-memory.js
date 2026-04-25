#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/hooks/stop/context-memory.ts
import { readFileSync as readFileSync7, writeFileSync as writeFileSync3, mkdirSync as mkdirSync4 } from "node:fs";
import { join as join6 } from "node:path";
import { homedir as homedir6 } from "node:os";

// src/memory/hooks/paths.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
var STATE_DIR = join(homedir(), ".claude", "oh-my-claude", "state");
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
  return join(STATE_DIR, `context-memory-state${suffix}.json`);
}
function getSessionLogPath(projectCwd) {
  const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
  return join(homedir(), ".claude", "oh-my-claude", "memory", "sessions", `active-session${suffix}.jsonl`);
}
function findGitRoot(fromDir) {
  let dir = fromDir;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = join(dir, "..");
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}
function resolveCanonicalRoot(projectRoot) {
  const gitPath = join(projectRoot, ".git");
  if (!existsSync(gitPath))
    return null;
  try {
    const stat = statSync(gitPath);
    if (stat.isDirectory())
      return projectRoot;
    const content = readFileSync(gitPath, "utf-8").trim();
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
  existsSync as existsSync2,
  readFileSync as readFileSync2,
  writeFileSync,
  mkdirSync,
  unlinkSync
} from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2 } from "node:os";
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
    const proxyScript = join2(homedir2(), ".claude", "oh-my-claude", "dist", "proxy", "server.js");
    if (!existsSync2(proxyScript)) {
      console.error("[hook:proxy] Proxy script not found, cannot auto-spawn");
      return null;
    }
    let bunPath = "bun";
    try {
      const { execSync } = await import("node:child_process");
      bunPath = execSync("which bun", {
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
    const sessionsDir = join2(homedir2(), ".claude", "oh-my-claude", "sessions", sessionHash);
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join2(sessionsDir, "auto-proxy.json"), JSON.stringify({
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
    const autoProxyFile = join2(homedir2(), ".claude", "oh-my-claude", "sessions", sessionHash, "auto-proxy.json");
    if (!existsSync2(autoProxyFile))
      return;
    const data = JSON.parse(readFileSync2(autoProxyFile, "utf-8"));
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
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { join as join3 } from "node:path";
import { homedir as homedir3 } from "node:os";
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
  const configPath = join3(homedir3(), ".claude", "oh-my-claude.json");
  try {
    if (existsSync3(configPath)) {
      const raw = readFileSync3(configPath, "utf-8");
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
  mkdirSync as mkdirSync3,
  statSync as statSync3,
  appendFileSync,
  readdirSync,
  unlinkSync as unlinkSync3
} from "node:fs";
import { join as join4 } from "node:path";
import { homedir as homedir4 } from "node:os";

// src/shared/fs/file-lock.ts
import {
  openSync,
  closeSync,
  unlinkSync as unlinkSync2,
  existsSync as existsSync4,
  mkdirSync as mkdirSync2,
  writeFileSync as writeFileSync2,
  renameSync,
  readFileSync as readFileSync4,
  statSync as statSync2,
  chmodSync,
  copyFileSync
} from "fs";
import { dirname } from "path";
var DEFAULT_RETRIES = 10;
var DEFAULT_BACKOFF_MS = 20;
var DEFAULT_STALE_MS = 5000;
function sleepBlockingMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}
function acquireLock(lockPath, opts) {
  const dir = dirname(lockPath);
  for (let i = 0;i < opts.retries; i++) {
    try {
      if (!existsSync4(dir)) {
        mkdirSync2(dir, { recursive: true });
      }
      return openSync(lockPath, "wx");
    } catch (err) {
      const code = err?.code;
      if (code !== "EEXIST") {
        return null;
      }
      try {
        const stat = statSync2(lockPath);
        if (Date.now() - stat.mtimeMs > opts.staleMs) {
          try {
            unlinkSync2(lockPath);
          } catch {}
          continue;
        }
      } catch {}
      sleepBlockingMs(opts.backoffMs + Math.random() * opts.backoffMs);
    }
  }
  return null;
}
function releaseLock(fd, lockPath) {
  if (fd === null)
    return;
  try {
    closeSync(fd);
  } catch {}
  try {
    unlinkSync2(lockPath);
  } catch {}
}
function withFileLockSync(lockPath, fn, opts = {}) {
  const resolved = {
    retries: opts.retries ?? DEFAULT_RETRIES,
    backoffMs: opts.backoffMs ?? DEFAULT_BACKOFF_MS,
    staleMs: opts.staleMs ?? DEFAULT_STALE_MS
  };
  const fd = acquireLock(lockPath, resolved);
  try {
    return fn();
  } finally {
    releaseLock(fd, lockPath);
  }
}
function atomicTempPath(path) {
  return `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}
function ensureParentDir(path) {
  const dir = dirname(path);
  if (!existsSync4(dir)) {
    mkdirSync2(dir, { recursive: true });
  }
}
function applyMode(path, mode) {
  if (mode === undefined || process.platform === "win32")
    return;
  try {
    chmodSync(path, mode);
  } catch {}
}
function atomicWriteText(path, text, opts = {}) {
  ensureParentDir(path);
  const tmp = atomicTempPath(path);
  writeFileSync2(tmp, text, "utf-8");
  applyMode(tmp, opts.mode);
  renameSync(tmp, path);
  applyMode(path, opts.mode);
}
function atomicWriteJson(path, value, opts = {}) {
  const indent = opts.indent ?? "\t";
  const trailing = opts.trailingNewline ?? true;
  const text = JSON.stringify(value, null, indent) + (trailing ? `
` : "");
  atomicWriteText(path, text, { mode: opts.mode });
}

class JsonCorruptError extends Error {
  path;
  backupPath;
  cause;
  name = "JsonCorruptError";
  constructor(message, path, backupPath, cause) {
    super(message);
    this.path = path;
    this.backupPath = backupPath;
    this.cause = cause;
  }
}
function backupCorruptFile(path) {
  const backupPath = `${path}.corrupt-${Date.now()}.bak`;
  try {
    copyFileSync(path, backupPath);
  } catch {}
  return backupPath;
}
function loadJsonOrBackup(path, schema, opts = {}) {
  if (!existsSync4(path))
    return null;
  let raw;
  try {
    raw = readFileSync4(path, "utf-8");
  } catch (err) {
    const backupPath = backupCorruptFile(path);
    opts.onCorrupt?.(backupPath, err);
    throw new JsonCorruptError(`Failed to read JSON file at ${path}: ${err.message}`, path, backupPath, err);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const backupPath = backupCorruptFile(path);
    opts.onCorrupt?.(backupPath, err);
    throw new JsonCorruptError(`Failed to parse JSON at ${path}: ${err.message}`, path, backupPath, err);
  }
  try {
    return schema.parse(parsed);
  } catch (err) {
    const backupPath = backupCorruptFile(path);
    opts.onCorrupt?.(backupPath, err);
    throw new JsonCorruptError(`Schema validation failed for ${path}: ${err.message}`, path, backupPath, err);
  }
}

// src/memory/hooks/session.ts
var STATE_DIR2 = join4(homedir4(), ".claude", "oh-my-claude", "state");
var SessionStateSchema = {
  parse(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("session state must be an object");
    }
    const raw = input;
    const lastSaveTimestamp = typeof raw.lastSaveTimestamp === "string" ? raw.lastSaveTimestamp : raw.lastSaveTimestamp === null ? null : null;
    const lastSaveLogSizeKB = typeof raw.lastSaveLogSizeKB === "number" ? raw.lastSaveLogSizeKB : raw.lastSaveLogSizeKB === null ? null : null;
    const saveCount = typeof raw.saveCount === "number" && Number.isFinite(raw.saveCount) ? raw.saveCount : 0;
    return { lastSaveTimestamp, lastSaveLogSizeKB, saveCount };
  }
};
var corruptStatePaths = new Set;
function loadState(projectCwd) {
  const stateFile = getStateFile(projectCwd);
  try {
    const loaded = loadJsonOrBackup(stateFile, SessionStateSchema, {
      onCorrupt: (backupPath) => {
        console.error(`[omc memory] session state at ${stateFile} was corrupt; ` + `backed up to ${backupPath}. Save skipped this run.`);
      }
    });
    if (loaded !== null)
      return loaded;
  } catch (err) {
    if (err instanceof JsonCorruptError) {
      corruptStatePaths.add(stateFile);
    } else {
      console.error(`[omc memory] unexpected error loading session state at ${stateFile}: ${err.message}`);
      corruptStatePaths.add(stateFile);
    }
  }
  return { lastSaveTimestamp: null, lastSaveLogSizeKB: null, saveCount: 0 };
}
function saveState(state, projectCwd) {
  try {
    const stateFile = getStateFile(projectCwd);
    if (corruptStatePaths.has(stateFile))
      return;
    mkdirSync3(STATE_DIR2, { recursive: true });
    atomicWriteJson(stateFile, state, {
      indent: 2,
      trailingNewline: false
    });
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
      unlinkSync3(logPath);
    }
  } catch {}
}
function pruneEmptySessionLogs(options = {}) {
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const currentLogPath = options.currentCwd ? getSessionLogPath(options.currentCwd) : null;
  const sessionsDir = join4(homedir4(), ".claude", "oh-my-claude", "memory", "sessions");
  let removed = 0;
  try {
    if (!existsSync5(sessionsDir))
      return 0;
    const entries = readdirSync(sessionsDir);
    const now = Date.now();
    for (const name of entries) {
      if (!name.startsWith("active-session") || !name.endsWith(".jsonl")) {
        continue;
      }
      const full = join4(sessionsDir, name);
      if (currentLogPath && full === currentLogPath)
        continue;
      try {
        const s = statSync3(full);
        const stale = now - s.mtimeMs > maxAgeMs;
        if (s.size === 0 || stale) {
          unlinkSync3(full);
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
    const logDir = join4(homedir4(), ".claude", "oh-my-claude", "memory", "sessions");
    if (!existsSync5(logDir)) {
      mkdirSync3(logDir, { recursive: true });
    }
    const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
    const logPath = join4(logDir, `active-session${suffix}.jsonl`);
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
import { join as join5 } from "node:path";
import { homedir as homedir5 } from "node:os";
function getTimelineContent(projectCwd, maxLines = 80) {
  const lines = [];
  if (projectCwd) {
    const projectTimeline = join5(projectCwd, ".claude", "mem", "TIMELINE.md");
    if (existsSync6(projectTimeline)) {
      try {
        const content = readFileSync6(projectTimeline, "utf-8").trim();
        if (content)
          lines.push(content);
      } catch {}
    }
  }
  const globalTimeline = join5(homedir5(), ".claude", "oh-my-claude", "memory", "TIMELINE.md");
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
// src/hooks/stop/context-memory.ts
async function callMemoryAI(context, prompt, controlPort) {
  try {
    const resp = await fetch(`http://localhost:${controlPort}/internal/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: `${prompt}

---

Session context:
${context}`
          }
        ],
        temperature: 0.1,
        max_tokens: 1024
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!resp.ok) {
      console.error(`[context-memory] /internal/complete returned ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data.content) {
      return { text: data.content, provider: data.provider ?? "unknown" };
    }
    return null;
  } catch (error) {
    console.error("[context-memory] callMemoryAI failed:", error);
    return null;
  }
}
var CHECKPOINT_PROMPT = `You are a session summarizer. Extract KEY LEARNINGS from this coding session.

Output in this exact format:

CONCEPTS: concept1, concept2, concept3
FILES: path/to/file1.ts, path/to/file2.ts

---

- **Decision**: [what was decided and WHY]
- **Pattern**: [any convention or pattern discovered]
- **Problem/Solution**: [problem → solution]
- **Preference**: [any user preference expressed]

Rules:
- CONCEPTS: 3-7 semantic concepts (e.g., authentication, error-handling, proxy-config)
- FILES: Only files actually read or modified (extract from tool log)
- Body: Bullet points, specific and actionable, 200-400 words max
- Skip trivial details and boilerplate
- Do NOT include step-by-step implementation details (code is in git)`;
var SESSION_END_PROMPT = `You are a session summarizer. This session is ending. Extract KEY LEARNINGS from the RECENT activity (since any previous checkpoint).

Output in this exact format:

CONCEPTS: concept1, concept2, concept3
FILES: path/to/file1.ts, path/to/file2.ts

---

- **Decision**: [what was decided and WHY]
- **Pattern**: [any convention or pattern discovered]
- **Problem/Solution**: [problem → solution]
- **Preference**: [any user preference expressed]

Rules:
- CONCEPTS: 3-7 semantic concepts (e.g., authentication, error-handling, proxy-config)
- FILES: Only files actually read or modified (extract from tool log)
- Body: Bullet points, specific and actionable, 200-400 words max
- Skip trivial details, boilerplate, and content already covered in previous checkpoints
- Do NOT include step-by-step implementation details (code is in git)`;
function parseStructuredResponse(text) {
  const result = { concepts: [], files: [], body: text };
  const conceptsMatch = text.match(/^CONCEPTS:\s*(.+)$/m);
  if (conceptsMatch?.[1]) {
    result.concepts = conceptsMatch[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  const filesMatch = text.match(/^FILES:\s*(.+)$/m);
  if (filesMatch?.[1]) {
    result.files = filesMatch[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  const separatorIdx = text.indexOf(`
---
`);
  if (separatorIdx !== -1) {
    result.body = text.slice(separatorIdx + 5).trim();
  } else if (conceptsMatch || filesMatch) {
    result.body = text.replace(/^CONCEPTS:\s*.+$/m, "").replace(/^FILES:\s*.+$/m, "").trim();
  }
  return result;
}
function resolveCanonicalRoot2(projectRoot) {
  return resolveCanonicalRoot(projectRoot) ?? projectRoot;
}
function saveSessionMemory(summary, _providerUsed, trigger, logSizeKB, projectCwd) {
  let memoryDir;
  let projectRoot = null;
  if (projectCwd) {
    const gitRoot = findGitRoot(projectCwd);
    if (gitRoot) {
      projectRoot = resolveCanonicalRoot2(gitRoot);
    }
  }
  if (projectRoot) {
    memoryDir = join6(projectRoot, ".claude", "mem", "sessions");
  } else {
    memoryDir = join6(homedir6(), ".claude", "oh-my-claude", "memory", "sessions");
  }
  mkdirSync4(memoryDir, { recursive: true });
  const now = new Date;
  const dateStr = formatLocalYYYYMMDDLite(now);
  const timeStr = formatLocalHHMMSSLite(now);
  const prefix = trigger === "session-end" ? "session" : "context-save";
  const id = `${prefix}-${dateStr}-${timeStr}`;
  const parsed = parseStructuredResponse(summary);
  const titleText = trigger === "session-end" ? `Session summary ${dateStr}` : `Context checkpoint ${dateStr} (${logSizeKB}KB log)`;
  const triggerTag = trigger === "session-end" ? "session-end" : "context-checkpoint";
  const tagList = [triggerTag, ...parsed.concepts];
  const tags = `[${tagList.join(", ")}]`;
  const frontmatterLines = [
    "---",
    `title: "${titleText}"`,
    `type: session`,
    `tags: ${tags}`
  ];
  if (parsed.files.length > 0) {
    frontmatterLines.push(`files: [${parsed.files.join(", ")}]`);
  }
  frontmatterLines.push(`created: "${now.toISOString()}"`);
  frontmatterLines.push(`updated: "${now.toISOString()}"`);
  frontmatterLines.push("---");
  const content = `${frontmatterLines.join(`
`)}

${parsed.body}
`;
  const filePath = join6(memoryDir, `${id}.md`);
  writeFileSync3(filePath, content, "utf-8");
  return filePath;
}
function isCompletionTool(toolName, toolInput) {
  if (toolName === "Bash" && typeof toolInput?.command === "string") {
    return toolInput.command.includes("git commit");
  }
  return false;
}
function saveMiniNote(projectCwd) {
  const sessionLog = readSessionLog(projectCwd);
  if (!sessionLog || sessionLog.length < 200)
    return;
  const recentLog = sessionLog.length > 2000 ? sessionLog.slice(-2000) : sessionLog;
  const lines = recentLog.trim().split(`
`).filter(Boolean);
  const lastLines = lines.slice(-10);
  const body = lastLines.join(`
`);
  let notesDir;
  if (projectCwd) {
    const gitRoot = findGitRoot(projectCwd);
    if (gitRoot) {
      const canonical = resolveCanonicalRoot2(gitRoot);
      notesDir = join6(canonical, ".claude", "mem", "notes");
    } else {
      notesDir = join6(homedir6(), ".claude", "oh-my-claude", "memory", "notes");
    }
  } else {
    notesDir = join6(homedir6(), ".claude", "oh-my-claude", "memory", "notes");
  }
  mkdirSync4(notesDir, { recursive: true });
  const now = new Date;
  const dateStr = formatLocalYYYYMMDDLite(now);
  const timeStr = formatLocalHHMMSSLite(now);
  const id = `auto-commit-${dateStr}-${timeStr}`;
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
  writeFileSync3(join6(notesDir, `${id}.md`), content, "utf-8");
  console.error(`[context-memory] Commit mini-note saved: ${id}.md`);
}
async function handlePostToolUse(input) {
  const toolName = input.tool || input.tool_name || "";
  if (toolName.includes("memory") || toolName.includes("context-memory")) {
    return { decision: "approve" };
  }
  const projectCwd = input.cwd;
  if (isCompletionTool(toolName, input.tool_input)) {
    try {
      saveMiniNote(projectCwd);
    } catch {}
  }
  const config = loadHookConfig();
  if (config.threshold === 0) {
    return { decision: "approve" };
  }
  const logSizeKB = getSessionLogSizeKB(projectCwd);
  if (logSizeKB < config.threshold) {
    return { decision: "approve" };
  }
  const state = loadState(projectCwd);
  if (state.lastSaveLogSizeKB !== null && logSizeKB <= state.lastSaveLogSizeKB + 10) {
    return { decision: "approve" };
  }
  const sessionLog = readSessionLog(projectCwd);
  if (!sessionLog || sessionLog.length < 500) {
    return { decision: "approve" };
  }
  const controlPort = await ensureProxy(projectCwd);
  if (!controlPort) {
    return { decision: "approve" };
  }
  const context = `Session activity log (${logSizeKB}KB, threshold: ${config.threshold}KB):

${sessionLog}`;
  try {
    const result = await callMemoryAI(context, CHECKPOINT_PROMPT, controlPort);
    if (result) {
      const filePath = saveSessionMemory(result.text, result.provider, "checkpoint", logSizeKB, projectCwd);
      saveState({
        lastSaveTimestamp: new Date().toISOString(),
        lastSaveLogSizeKB: logSizeKB,
        saveCount: state.saveCount + 1
      }, projectCwd);
      console.error(`[context-memory] Checkpoint saved at ${logSizeKB}KB: ${filePath}`);
      return {
        decision: "approve",
        message: `Context memory auto-saved (${logSizeKB}KB activity, via ${result.provider})`
      };
    }
  } catch (error) {
    console.error("[context-memory] Checkpoint error:", error);
  }
  return { decision: "approve" };
}
async function handleStop(input) {
  const projectCwd = input.cwd;
  const state = loadState(projectCwd);
  const controlPort = await ensureProxy(projectCwd);
  if (!controlPort) {
    clearSessionLog(projectCwd);
    cleanupAutoProxy(projectCwd);
    return { decision: "approve" };
  }
  const parts = [];
  if (input.reason) {
    parts.push(`Session end reason: ${input.reason}`);
  }
  if (input.todos && input.todos.length > 0) {
    parts.push(`
Task list:`);
    for (const todo of input.todos) {
      const icon = todo.status === "completed" ? "+" : todo.status === "in_progress" ? ">" : "o";
      parts.push(`  ${icon} [${todo.status}] ${todo.content}`);
    }
  }
  const sessionLog = readSessionLog(projectCwd);
  if (sessionLog) {
    const maxLen = 6000;
    const trimmed = sessionLog.length > maxLen ? `...
` + sessionLog.slice(-maxLen) : sessionLog;
    parts.push(`
Tool usage timeline:
${trimmed}`);
  }
  let transcriptText = input.transcript || "";
  if (!transcriptText && input.transcript_path) {
    try {
      const raw = readFileSync7(input.transcript_path, "utf-8");
      const lines = raw.split(`
`).filter(Boolean);
      const summaryParts = [];
      for (const line of lines.slice(-100)) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === "human" && entry.message?.content) {
            const text = typeof entry.message.content === "string" ? entry.message.content : JSON.stringify(entry.message.content);
            summaryParts.push(`[user] ${text.slice(0, 200)}`);
          } else if (entry.type === "tool_result" && entry.tool_name) {
            summaryParts.push(`[${entry.tool_name}] ${(entry.output || "").slice(0, 100)}`);
          } else if (entry.type === "tool_use" && entry.name) {
            const args = entry.input ? JSON.stringify(entry.input).slice(0, 100) : "";
            summaryParts.push(`[→${entry.name}] ${args}`);
          }
        } catch {
          continue;
        }
      }
      transcriptText = summaryParts.join(`
`);
    } catch {}
  }
  if (transcriptText) {
    const maxLen = 6000;
    const transcript = transcriptText.length > maxLen ? "..." + transcriptText.slice(-maxLen) : transcriptText;
    parts.push(`
Recent conversation:
${transcript}`);
  }
  if (input.last_assistant_message) {
    const msg = input.last_assistant_message.length > 1000 ? input.last_assistant_message.slice(0, 1000) + "..." : input.last_assistant_message;
    parts.push(`
Last response:
${msg}`);
  }
  const context = parts.join(`
`);
  if (context.length < 500) {
    clearSessionLog(projectCwd);
    return { decision: "approve" };
  }
  try {
    const result = await callMemoryAI(context, SESSION_END_PROMPT, controlPort);
    if (result) {
      const logSizeKB = getSessionLogSizeKB(projectCwd);
      const filePath = saveSessionMemory(result.text, result.provider, "session-end", logSizeKB, projectCwd);
      saveState({
        lastSaveTimestamp: new Date().toISOString(),
        lastSaveLogSizeKB: 0,
        saveCount: 0
      }, projectCwd);
      clearSessionLog(projectCwd);
      cleanupAutoProxy(projectCwd);
      console.error(`[context-memory] Session-end saved: ${filePath}`);
      return {
        decision: "approve",
        message: `Session memory saved via proxy (${result.provider})`
      };
    }
  } catch (error) {
    console.error("[context-memory] Session-end error:", error);
  }
  clearSessionLog(projectCwd);
  cleanupAutoProxy(projectCwd);
  return { decision: "approve" };
}
async function main() {
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
  const isStopEvent = input.reason !== undefined || input.hook_event_name === "Stop";
  let response;
  if (isStopEvent) {
    response = await handleStop(input);
  } else {
    response = await handlePostToolUse(input);
  }
  console.log(JSON.stringify(response));
}
main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
