#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/hooks/session-start/auto-rotate.ts
import {
  readFileSync as readFileSync6,
  writeFileSync as writeFileSync3,
  readdirSync as readdirSync2,
  unlinkSync as unlinkSync3,
  existsSync as existsSync6,
  mkdirSync as mkdirSync3,
  appendFileSync as appendFileSync2
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
  existsSync as existsSync4,
  readFileSync as readFileSync4,
  writeFileSync as writeFileSync2,
  mkdirSync as mkdirSync2,
  statSync as statSync2,
  appendFileSync,
  readdirSync,
  unlinkSync as unlinkSync2
} from "node:fs";
import { join as join4 } from "node:path";
import { homedir as homedir4 } from "node:os";
var STATE_DIR2 = join4(homedir4(), ".claude", "oh-my-claude", "state");
function loadState(projectCwd) {
  try {
    const stateFile = getStateFile(projectCwd);
    if (existsSync4(stateFile)) {
      const raw = readFileSync4(stateFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return { lastSaveTimestamp: null, lastSaveLogSizeKB: null, saveCount: 0 };
}
function saveState(state, projectCwd) {
  try {
    mkdirSync2(STATE_DIR2, { recursive: true });
    writeFileSync2(getStateFile(projectCwd), JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}
function getSessionLogSizeKB(projectCwd) {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (!existsSync4(logPath))
      return 0;
    const stats = statSync2(logPath);
    return Math.round(stats.size / 1024);
  } catch {
    return 0;
  }
}
function readSessionLog(projectCwd) {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (!existsSync4(logPath))
      return "";
    const raw = readFileSync4(logPath, "utf-8").trim();
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
    if (existsSync4(logPath)) {
      unlinkSync2(logPath);
    }
  } catch {}
}
function pruneEmptySessionLogs(options = {}) {
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const currentLogPath = options.currentCwd ? getSessionLogPath(options.currentCwd) : null;
  const sessionsDir = join4(homedir4(), ".claude", "oh-my-claude", "memory", "sessions");
  let removed = 0;
  try {
    if (!existsSync4(sessionsDir))
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
        const s = statSync2(full);
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
    const logDir = join4(homedir4(), ".claude", "oh-my-claude", "memory", "sessions");
    if (!existsSync4(logDir)) {
      mkdirSync2(logDir, { recursive: true });
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
import { existsSync as existsSync5, readFileSync as readFileSync5 } from "node:fs";
import { join as join5 } from "node:path";
import { homedir as homedir5 } from "node:os";
function getTimelineContent(projectCwd, maxLines = 80) {
  const lines = [];
  if (projectCwd) {
    const projectTimeline = join5(projectCwd, ".claude", "mem", "TIMELINE.md");
    if (existsSync5(projectTimeline)) {
      try {
        const content = readFileSync5(projectTimeline, "utf-8").trim();
        if (content)
          lines.push(content);
      } catch {}
    }
  }
  const globalTimeline = join5(homedir5(), ".claude", "oh-my-claude", "memory", "TIMELINE.md");
  if (existsSync5(globalTimeline)) {
    try {
      const content = readFileSync5(globalTimeline, "utf-8").trim();
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
// src/memory/ai-ops-shared.ts
var BOILERPLATE_TAGS = new Set([
  "auto-capture",
  "session-end",
  "context-threshold"
]);
function buildDailyNarrativePrompt(date, entries) {
  return `You are a technical session historian. Generate a comprehensive daily narrative for ${date} from these ${entries.length} session memories. Preserve ALL important details including:
- Decisions made and their rationale
- Bugs found and how they were fixed
- Architecture/design choices
- Key code changes and files modified
- Patterns discovered or gotchas encountered

Write as a structured markdown narrative:

## Daily Narrative: ${date}

### Session Flow
[Chronological story of what happened across all sessions]

### Key Decisions
[Important decisions with rationale]

### Technical Details
[Specific bugs, fixes, patterns, file changes worth remembering]

### Accomplishments
[What was achieved]

Here are the full session contents:

${entries.map((e) => `=== Session: ${e.title} (${e.created ?? "unknown"}) ===
${e.content}`).join(`

`)}`;
}

// src/hooks/session-start/auto-rotate.ts
var HOOK_WALL_CLOCK_MS = 20000;
var AI_CALL_TIMEOUT_MS = 45000;
function getGlobalMemoryDir() {
  return join6(homedir6(), ".claude", "oh-my-claude", "memory");
}
function getProjectMemoryDir(projectCwd) {
  if (!projectCwd)
    return null;
  const gitRoot = findGitRoot(projectCwd);
  if (!gitRoot)
    return null;
  const canonical = resolveCanonicalRoot(gitRoot) ?? gitRoot;
  return join6(canonical, ".claude", "mem");
}
function getAuditLogPath() {
  return join6(getGlobalMemoryDir(), ".rotation-log.jsonl");
}
function appendAudit(entry) {
  try {
    const dir = getGlobalMemoryDir();
    if (!existsSync6(dir))
      mkdirSync3(dir, { recursive: true });
    appendFileSync2(getAuditLogPath(), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + `
`, "utf-8");
  } catch (e) {
    console.error("[auto-rotate] audit append failed:", e);
  }
}
function localYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function extractDatePrefix(filename) {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
function daysBetween(olderDate, newerDate) {
  const o = new Date(`${olderDate}T00:00:00`);
  const n = new Date(`${newerDate}T00:00:00`);
  const ms = n.getTime() - o.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
function scanScope(baseDir, scope) {
  const out = [];
  if (!existsSync6(baseDir))
    return out;
  for (const subdir of ["sessions", "notes"]) {
    const dir = join6(baseDir, subdir);
    if (!existsSync6(dir))
      continue;
    let entries = [];
    try {
      entries = readdirSync2(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".md"))
        continue;
      if (subdir === "notes" && !name.startsWith("auto-commit-")) {
        continue;
      }
      const id = name.slice(0, -3);
      if (id.includes("daily-rollup") || id.includes("daily-narrative") || id.includes("-summary-") || id.includes("-compact-")) {
        continue;
      }
      const date = extractDatePrefix(name);
      if (!date)
        continue;
      out.push({
        scope,
        subdir,
        dir,
        id,
        path: join6(dir, name),
        date
      });
    }
  }
  return out;
}
function parseMemoryFile(md) {
  if (md.charCodeAt(0) === 65279)
    md = md.slice(1);
  if (!md.startsWith("---"))
    return { body: md };
  const end = md.indexOf(`
---`, 3);
  if (end === -1)
    return { body: md };
  const fmRaw = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\n+/, "");
  const title = fmRaw.match(/^title:\s*"?([^"\n]+?)"?$/m)?.[1]?.trim();
  const created = fmRaw.match(/^created:\s*"?([^"\n]+?)"?$/m)?.[1]?.trim();
  const tagLine = fmRaw.match(/^tags:\s*\[([^\]]*)\]/m)?.[1];
  const tags = tagLine ? tagLine.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : [];
  return { title, created, tags, body };
}
function groupByDate(files) {
  const byDate = new Map;
  for (const f of files) {
    const arr = byDate.get(f.date) ?? [];
    arr.push(f);
    byDate.set(f.date, arr);
  }
  const groups = [];
  for (const [date, groupFiles] of byDate.entries()) {
    const scopes = new Set(groupFiles.map((f) => f.scope));
    const scope = scopes.size === 1 ? groupFiles[0].scope : "mixed";
    groups.push({ date, files: groupFiles, scope });
  }
  groups.sort((a, b) => a.date.localeCompare(b.date));
  return groups;
}
async function callNarrativeAI(controlPort, prompt) {
  try {
    const resp = await fetch(`http://localhost:${controlPort}/internal/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000
      }),
      signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS)
    });
    if (!resp.ok) {
      console.error(`[auto-rotate] /internal/complete returned ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (!data.content)
      return null;
    return {
      content: data.content,
      provider: data.provider ?? "unknown"
    };
  } catch (e) {
    console.error("[auto-rotate] narrative AI call failed:", e);
    return null;
  }
}
function chooseWriteBaseDir(group, projectCwd) {
  const projectDir = getProjectMemoryDir(projectCwd);
  if (group.scope === "global")
    return getGlobalMemoryDir();
  if (group.scope === "project")
    return projectDir ?? getGlobalMemoryDir();
  return projectDir ?? getGlobalMemoryDir();
}
function writeRollupFile(baseDir, date, body, sources, mode, provider) {
  const notesDir = join6(baseDir, "notes");
  mkdirSync3(notesDir, { recursive: true });
  const id = `${date}-daily-rollup`;
  const filePath = join6(notesDir, `${id}.md`);
  const now = new Date().toISOString();
  const tags = [
    "auto-rollup",
    mode === "fallback" ? "fallback" : "narrative",
    `rotation-${date}`
  ];
  const sourceList = sources.map((s) => `- ${s.scope}:${s.subdir}/${s.id}`).join(`
`);
  const frontmatter = [
    "---",
    `title: "Daily rollup ${date}"`,
    `type: note`,
    `tags: [${tags.join(", ")}]`,
    `created: "${date}T00:00:00.000Z"`,
    `updated: "${now}"`,
    `rollupMode: ${mode}`,
    ...provider ? [`rollupProvider: ${provider}`] : [],
    "---",
    "",
    `> Auto-generated daily rollup of ${sources.length} memory file(s) from ${date}.`,
    `> Mode: ${mode}${provider ? ` (via ${provider})` : ""}.`,
    "",
    "### Source files (archived)",
    sourceList,
    "",
    "---",
    ""
  ].join(`
`);
  writeFileSync3(filePath, frontmatter + body.trim() + `
`, "utf-8");
  return filePath;
}
function archiveSources(sources) {
  let archived = 0;
  let errors = 0;
  for (const s of sources) {
    try {
      if (existsSync6(s.path)) {
        unlinkSync3(s.path);
        archived += 1;
      }
    } catch (e) {
      errors += 1;
      console.error("[auto-rotate] archive unlink failed:", s.path, e);
    }
  }
  return { archived, errors };
}
function buildDeterministicRollup(date, sources) {
  const sections = [`## Daily rollup: ${date}`, ""];
  sections.push("_Proxy was unreachable at rotation time; this is a raw concat of " + "the source memories. Run `/omc-mem-summary` when a provider " + "is available to upgrade this to a narrative._", "");
  for (const src of sources) {
    let md;
    try {
      md = readFileSync6(src.path, "utf-8");
    } catch (e) {
      console.error("[auto-rotate] could not read source for rollup:", src.path, e);
      continue;
    }
    const parsed = parseMemoryFile(md);
    const title = parsed.title ?? src.id.replace(/^session-/, "").replace(/^auto-commit-/, "commit ").replace(/^context-save-/, "checkpoint ");
    sections.push(`### ${title}`);
    sections.push("");
    if (parsed.created) {
      sections.push(`_created: ${parsed.created}_`);
      sections.push("");
    }
    sections.push(parsed.body.trim());
    sections.push("");
    sections.push("---");
    sections.push("");
  }
  return sections.join(`
`);
}
function buildNarrativeEntries(sources) {
  const entries = [];
  for (const src of sources) {
    let md = "";
    try {
      md = readFileSync6(src.path, "utf-8");
    } catch {
      continue;
    }
    const parsed = parseMemoryFile(md);
    entries.push({
      title: parsed.title ?? src.id,
      content: parsed.body.trim(),
      created: parsed.created
    });
  }
  return entries;
}
async function rotateGroup(group, opts) {
  const baseDir = chooseWriteBaseDir(group, opts.projectCwd);
  if (!baseDir) {
    return { mode: "skipped", files: group.files.length };
  }
  let body = null;
  let provider;
  let mode = "fallback";
  if (opts.useLLM && opts.controlPort !== null && Date.now() < opts.deadlineMs) {
    const entries = buildNarrativeEntries(group.files);
    if (entries.length > 0) {
      const prompt = buildDailyNarrativePrompt(group.date, entries);
      const result = await callNarrativeAI(opts.controlPort, prompt);
      if (result) {
        body = result.content;
        provider = result.provider;
        mode = "ai";
      }
    }
  }
  if (body === null) {
    body = buildDeterministicRollup(group.date, group.files);
    mode = "fallback";
  }
  const path = writeRollupFile(baseDir, group.date, body, group.files, mode, provider);
  const { archived, errors } = archiveSources(group.files);
  appendAudit({
    event: "rotate",
    date: group.date,
    scope: group.scope,
    mode,
    provider: provider ?? null,
    files: group.files.length,
    archived,
    archiveErrors: errors,
    rollup: path
  });
  return { mode, path, files: group.files.length };
}
async function runAutoRotate(input) {
  const projectCwd = input.cwd;
  const config = loadHookConfig().autoRotate;
  const pruned = pruneEmptySessionLogs({ currentCwd: projectCwd });
  if (pruned > 0) {
    appendAudit({ event: "prune", pruned });
  }
  if (!config.enabled)
    return;
  const startedAt = Date.now();
  const deadlineMs = startedAt + HOOK_WALL_CLOCK_MS;
  const candidates = [];
  candidates.push(...scanScope(getGlobalMemoryDir(), "global"));
  const projectDir = getProjectMemoryDir(projectCwd);
  if (projectDir) {
    candidates.push(...scanScope(projectDir, "project"));
  }
  if (candidates.length === 0)
    return;
  const today = localYYYYMMDD(new Date);
  const eligible = candidates.filter((f) => {
    if (f.date === today)
      return false;
    return daysBetween(f.date, today) >= config.graceDays + 1;
  });
  const groups = groupByDate(eligible).filter((g) => g.files.length >= config.thresholdFiles);
  if (groups.length === 0)
    return;
  let controlPort = null;
  if (config.useLLMWhenAvailable) {
    const port = getControlPort();
    const healthy = await isProxyHealthy(port).catch(() => false);
    if (healthy)
      controlPort = port;
  }
  const toRotate = groups.slice(0, config.maxDatesPerRun);
  const deferred = groups.length - toRotate.length;
  for (const g of toRotate) {
    if (Date.now() > deadlineMs) {
      appendAudit({
        event: "deadline",
        skipped: g.date,
        elapsedMs: Date.now() - startedAt
      });
      break;
    }
    try {
      await rotateGroup(g, {
        projectCwd,
        useLLM: controlPort !== null,
        controlPort,
        deadlineMs
      });
    } catch (e) {
      console.error("[auto-rotate] group rotation failed:", g.date, e);
      appendAudit({
        event: "error",
        date: g.date,
        message: e instanceof Error ? e.message : String(e)
      });
    }
  }
  if (deferred > 0) {
    appendAudit({
      event: "deferred",
      remainingDates: deferred,
      reason: "maxDatesPerRun"
    });
  }
}
async function main() {
  let inputData = "";
  try {
    inputData = readFileSync6(0, "utf-8");
  } catch {
    emit({ decision: "approve" });
    return;
  }
  let input = {};
  if (inputData.trim()) {
    try {
      input = JSON.parse(inputData);
    } catch {
      emit({ decision: "approve" });
      return;
    }
  }
  try {
    await runAutoRotate(input);
  } catch (e) {
    console.error("[auto-rotate] runAutoRotate failed:", e);
  }
  emit({ decision: "approve" });
}
function emit(response) {
  console.log(JSON.stringify(response));
}
main().catch((e) => {
  console.error("[auto-rotate] fatal:", e);
  emit({ decision: "approve" });
});
