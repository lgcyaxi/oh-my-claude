#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/hooks/user-prompt-submit/memory-awareness.ts
import {
  readFileSync as readFileSync7,
  existsSync as existsSync7,
  readdirSync as readdirSync2,
  mkdirSync as mkdirSync4,
  writeFileSync as writeFileSync3
} from "node:fs";
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
// src/hooks/user-prompt-submit/memory-awareness.ts
function warnIfNonOmcProxyBaseUrl(sessionId) {
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || "").trim();
  if (!baseUrl)
    return;
  if ((process.env.OMC_PROXY_CONTROL_PORT || "").trim()) {
    return;
  }
  let actualPort = null;
  let hostname = "";
  try {
    const parsed = new URL(baseUrl);
    hostname = parsed.hostname;
    actualPort = parsed.port ? Number.parseInt(parsed.port, 10) : parsed.protocol === "https:" ? 443 : 80;
  } catch {
    actualPort = null;
  }
  const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  if (isLoopback && actualPort !== null) {
    if (actualPort === 18910 || actualPort === 18920)
      return;
    const registryPorts = loadRegistryPorts();
    if (registryPorts.has(actualPort))
      return;
  }
  try {
    const runDir = join6(homedir6(), ".claude", "oh-my-claude", "run");
    if (!existsSync7(runDir))
      mkdirSync4(runDir, { recursive: true });
    const suffix = sessionId ? `-${sessionId}` : "";
    const marker = join6(runDir, `non-omc-proxy-warned${suffix}.flag`);
    if (existsSync7(marker))
      return;
    writeFileSync3(marker, String(Date.now()), "utf-8");
  } catch {}
  process.stderr.write(`⚠️  Proxy not detected. Running natively — proxy-only routing features limited.
`);
}
function loadRegistryPorts() {
  const ports = new Set;
  const base = join6(homedir6(), ".claude", "oh-my-claude");
  for (const rel of ["proxy-sessions.json", "proxy-instances.json"]) {
    try {
      const file = join6(base, rel);
      if (!existsSync7(file))
        continue;
      const raw = readFileSync7(file, "utf-8");
      const data = JSON.parse(raw);
      if (!Array.isArray(data))
        continue;
      for (const entry of data) {
        const p = entry?.port;
        const cp = entry?.controlPort;
        if (typeof p === "number" && Number.isFinite(p))
          ports.add(p);
        if (typeof cp === "number" && Number.isFinite(cp))
          ports.add(cp);
      }
    } catch {}
  }
  return ports;
}
function countMemoryFilesInDir(baseDir) {
  let count = 0;
  for (const subdir of ["notes", "sessions"]) {
    const dir = join6(baseDir, subdir);
    if (existsSync7(dir)) {
      try {
        count += readdirSync2(dir).filter((f) => f.endsWith(".md")).length;
      } catch {}
    }
  }
  return count;
}
function getMemoryCount(projectCwd) {
  let count = 0;
  const globalDir = join6(homedir6(), ".claude", "oh-my-claude", "memory");
  count += countMemoryFilesInDir(globalDir);
  const seenDirs = new Set;
  if (projectCwd) {
    const projectMemDir = join6(projectCwd, ".claude", "mem");
    if (existsSync7(projectMemDir)) {
      count += countMemoryFilesInDir(projectMemDir);
      seenDirs.add(projectMemDir);
    }
    const canonicalRoot = resolveCanonicalRoot(projectCwd);
    if (canonicalRoot && canonicalRoot !== projectCwd) {
      const canonicalMemDir = join6(canonicalRoot, ".claude", "mem");
      if (existsSync7(canonicalMemDir) && !seenDirs.has(canonicalMemDir)) {
        count += countMemoryFilesInDir(canonicalMemDir);
      }
    }
  }
  return count;
}
function getClaudeNativeMemory(projectCwd) {
  if (!projectCwd)
    return null;
  try {
    const claudeProjectsDir = join6(homedir6(), ".claude", "projects");
    if (!existsSync7(claudeProjectsDir))
      return null;
    const projectKey = projectCwd.replace(/[\\/]/g, "-").replace(/^-/, "");
    const memoryFile = join6(claudeProjectsDir, projectKey, "MEMORY.md");
    if (existsSync7(memoryFile)) {
      const content = readFileSync7(memoryFile, "utf-8").trim();
      if (content && content.length > 10)
        return content;
    }
  } catch {}
  return null;
}
var STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "because",
  "but",
  "and",
  "or",
  "if",
  "while",
  "about",
  "up",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "they",
  "them",
  "what",
  "which",
  "who",
  "whom",
  "make",
  "like",
  "use",
  "please",
  "help",
  "want",
  "need",
  "get",
  "let",
  "also",
  "new",
  "implement",
  "fix",
  "refactor",
  "add",
  "update",
  "create",
  "debug"
]);
function extractKeywords(prompt) {
  return prompt.toLowerCase().replace(/[^a-z0-9\s\-_.]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w)).slice(0, 8);
}
function quickRecall(keywords, projectCwd, limit = 3) {
  if (keywords.length === 0)
    return [];
  const scored = [];
  const scanDir = (baseDir, scope) => {
    for (const subdir of ["notes", "sessions"]) {
      const dir = join6(baseDir, subdir);
      if (!existsSync7(dir))
        continue;
      let files;
      try {
        files = readdirSync2(dir).filter((f) => f.endsWith(".md"));
      } catch {
        continue;
      }
      for (const file of files) {
        try {
          const content = readFileSync7(join6(dir, file), "utf-8");
          const lower = content.toLowerCase();
          let score = 0;
          for (const kw of keywords) {
            const idx = lower.indexOf(kw);
            if (idx !== -1) {
              score += 2;
              if (idx < 200)
                score += 1;
            }
          }
          if (score === 0)
            continue;
          const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
          const title = titleMatch?.[1]?.trim() ?? file.replace(".md", "");
          const fmEnd = content.indexOf(`
---
`, 4);
          const body = fmEnd !== -1 ? content.slice(fmEnd + 5).trim() : content;
          const snippet = body.length > 300 ? body.slice(0, 300) + "..." : body;
          scored.push({ title, snippet, scope, score });
        } catch {}
      }
    }
  };
  const seenDirs = new Set;
  if (projectCwd) {
    const projectMemDir = join6(projectCwd, ".claude", "mem");
    if (existsSync7(projectMemDir)) {
      scanDir(projectMemDir, "project");
      seenDirs.add(projectMemDir);
    }
    const canonicalRoot = resolveCanonicalRoot(projectCwd);
    if (canonicalRoot && canonicalRoot !== projectCwd) {
      const canonicalMemDir = join6(canonicalRoot, ".claude", "mem");
      if (existsSync7(canonicalMemDir) && !seenDirs.has(canonicalMemDir)) {
        scanDir(canonicalMemDir, "project");
      }
    }
  }
  const globalDir = join6(homedir6(), ".claude", "oh-my-claude", "memory");
  scanDir(globalDir, "global");
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ title, snippet, scope }) => ({ title, snippet, scope }));
}
var SIGNALS_DIR = join6(homedir6(), ".claude", "oh-my-claude", "signals", "completed");
function scanCompletionSignals() {
  if (!existsSync7(SIGNALS_DIR))
    return [];
  const notifications = [];
  try {
    const { unlinkSync: unlinkSync4 } = __require("node:fs");
    const files = readdirSync2(SIGNALS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const filePath = join6(SIGNALS_DIR, file);
      try {
        const signal = JSON.parse(readFileSync7(filePath, "utf-8"));
        notifications.push(`[@] ${signal.agentName}: ${signal.status}`);
        unlinkSync4(filePath);
      } catch {
        try {
          unlinkSync4(filePath);
        } catch {}
      }
    }
  } catch {}
  return notifications;
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
  const projectCwd = input.cwd;
  const workerRole = process.env.OMC_WORKER_ROLE;
  if (workerRole) {
    const rolePrompts = {
      code: "You are the CODE worker. Implement, edit, refactor, and fix code directly. Do NOT delegate or spawn sub-workers. Complete tasks autonomously.",
      audit: "You are the AUDIT worker. Review, analyze, and inspect code thoroughly. Do NOT delegate or spawn sub-workers. Return findings directly.",
      docs: "You are the DOCS worker. Write documentation, READMEs, comments, and specs. Do NOT delegate or spawn sub-workers. Complete writing tasks directly.",
      design: "You are the DESIGN worker. Handle UI, images, media, and visual tasks. Do NOT delegate or spawn sub-workers. Complete design tasks directly.",
      general: "You are a coworker task runner. Complete tasks directly. Do NOT delegate or spawn sub-workers."
    };
    const response = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: rolePrompts[workerRole] ?? rolePrompts.general
      }
    };
    console.log(JSON.stringify(response));
    return;
  }
  warnIfNonOmcProxyBaseUrl(input.session_id);
  const taskNotifications = scanCompletionSignals();
  const memoryCount = getMemoryCount(projectCwd);
  const prompt = input.prompt?.toLowerCase() ?? "";
  const rawPrompt = input.prompt ?? "";
  logUserPrompt(rawPrompt, projectCwd);
  const isSignificantWork = prompt.length > 50 || prompt.includes("implement") || prompt.includes("fix") || prompt.includes("refactor") || prompt.includes("add") || prompt.includes("update") || prompt.includes("create") || prompt.includes("debug") || prompt.includes("plan");
  const isCompletionTrigger = prompt.includes("commit") || prompt.includes("/commit") || prompt.includes("done") || prompt.includes("finish") || prompt.includes("complete") || prompt.includes("ship it") || prompt.includes("session-end") || prompt.includes("/session-end");
  const timeline = getTimelineContent(projectCwd);
  const taskPrefix = taskNotifications.length > 0 ? taskNotifications.join(`
`) + `

` : "";
  if (isCompletionTrigger) {
    let context = `[omc-memory] Task completion detected. ` + `IMPORTANT: Before finishing, call remember() to store key decisions, patterns, or findings from this session. ` + `This ensures cross-session continuity.` + (memoryCount > 0 ? ` (${memoryCount} existing memories)` : "");
    if (timeline) {
      context += `

${timeline}`;
    }
    const response = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: taskPrefix + context
      }
    };
    console.log(JSON.stringify(response));
    return;
  }
  if (memoryCount > 0 && isSignificantWork) {
    const keywords = extractKeywords(rawPrompt);
    const topMemories = quickRecall(keywords, projectCwd, 3);
    let context;
    if (topMemories.length > 0) {
      context = `[omc-memory] ${memoryCount} memories available. Relevant memories auto-recalled below.
` + `After completing work, call mcp__oh-my-claude__remember to store key decisions.

` + `# Relevant Memories (auto-recalled)
`;
      for (const mem of topMemories) {
        context += `
## ${mem.title} (${mem.scope})
${mem.snippet}
`;
      }
    } else {
      context = `[omc-memory] ${memoryCount} memories available. ` + `Call mcp__oh-my-claude__recall with keywords from the user's request if relevant context might exist. ` + `After completing work, call mcp__oh-my-claude__remember to store key decisions.`;
    }
    if (timeline) {
      context += `

${timeline}`;
    }
    const nativeMemory = getClaudeNativeMemory(projectCwd);
    if (nativeMemory) {
      const maxNative = 2000;
      const truncated = nativeMemory.length > maxNative ? nativeMemory.slice(0, maxNative) + `
... (truncated)` : nativeMemory;
      context += `

# Claude Native Memory
${truncated}`;
    }
    const response = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: taskPrefix + context
      }
    };
    console.log(JSON.stringify(response));
    return;
  }
  if (taskPrefix) {
    const response = {
      decision: "approve",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: taskPrefix.trim()
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
