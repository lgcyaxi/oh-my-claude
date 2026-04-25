#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/hooks/user-prompt-submit/preference-awareness.ts
import { readFileSync as readFileSync2, existsSync as existsSync3 } from "node:fs";
import { join as join2 } from "node:path";
import { tmpdir } from "node:os";

// src/shared/preferences/store.ts
import {
  existsSync as existsSync2,
  mkdirSync as mkdirSync2
} from "node:fs";
import { join, dirname as dirname2 } from "node:path";
import { homedir } from "node:os";
import { cwd } from "node:process";

// src/shared/fs/file-lock.ts
import {
  openSync,
  closeSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
  statSync,
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
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      return openSync(lockPath, "wx");
    } catch (err) {
      const code = err?.code;
      if (code !== "EEXIST") {
        return null;
      }
      try {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > opts.staleMs) {
          try {
            unlinkSync(lockPath);
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
    unlinkSync(lockPath);
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
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
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
  writeFileSync(tmp, text, "utf-8");
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
  if (!existsSync(path))
    return null;
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
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

// src/shared/preferences/store.ts
var PREFERENCES_FILENAME = "preferences.json";
function findProjectRoot(fromDir) {
  let dir = fromDir ?? cwd();
  const root = dirname2(dir);
  while (dir !== root) {
    if (existsSync2(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname2(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  if (existsSync2(join(dir, ".git"))) {
    return dir;
  }
  return null;
}
function getGlobalPreferencesDir() {
  return join(homedir(), ".claude", "oh-my-claude");
}
function getGlobalPreferencesPath() {
  return join(getGlobalPreferencesDir(), PREFERENCES_FILENAME);
}
function getProjectPreferencesDir(projectRoot) {
  const root = projectRoot ?? findProjectRoot();
  if (!root)
    return null;
  return join(root, ".claude");
}
function getProjectPreferencesPath(projectRoot) {
  const dir = getProjectPreferencesDir(projectRoot);
  if (!dir)
    return null;
  return join(dir, PREFERENCES_FILENAME);
}
function generatePreferenceId(title, date) {
  const d = date ?? new Date;
  const input = `${title}${d.toISOString()}`;
  let hash = 0;
  for (let i = 0;i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(6, "0").slice(0, 6);
  return `pref-${hex}`;
}
function nowISO() {
  return new Date().toISOString();
}
var PreferenceJsonSchema = {
  parse(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("preferences.json must be a JSON object");
    }
    const raw = input;
    const store = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        console.error(`[omc preferences] dropping malformed entry "${key}" (expected object)`);
        continue;
      }
      const pref = value;
      if (typeof pref.id !== "string" || typeof pref.title !== "string" || typeof pref.content !== "string" || typeof pref.scope !== "string") {
        console.error(`[omc preferences] dropping malformed entry "${key}" (missing required fields)`);
        continue;
      }
      store[key] = pref;
    }
    return store;
  }
};
function getLockPath(path) {
  return path + ".lock";
}
function readJsonStore(path) {
  try {
    const loaded = loadJsonOrBackup(path, PreferenceJsonSchema, {
      onCorrupt: (backupPath) => {
        console.error(`[omc preferences] ${path} was corrupt; backed up to ${backupPath}. ` + `Starting with empty store for this scope.`);
      }
    });
    return loaded ?? {};
  } catch (err) {
    if (err instanceof JsonCorruptError) {
      return {};
    }
    throw err;
  }
}
function writeJsonStore(path, store) {
  const dir = dirname2(path);
  mkdirSync2(dir, { recursive: true });
  atomicWriteJson(path, store, {
    indent: 2,
    trailingNewline: false,
    mode: 384
  });
}

class PreferenceStore {
  projectRoot;
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }
  getPathForScope(scope) {
    if (scope === "project") {
      const path = getProjectPreferencesPath(this.projectRoot);
      if (!path)
        throw new Error("No project directory found. Use scope: 'global' or initialize a git repo.");
      return path;
    }
    return getGlobalPreferencesPath();
  }
  getAllStores() {
    const stores = [];
    const globalPath = getGlobalPreferencesPath();
    stores.push({ scope: "global", path: globalPath, store: readJsonStore(globalPath) });
    const projectPath = getProjectPreferencesPath(this.projectRoot);
    if (projectPath) {
      stores.push({ scope: "project", path: projectPath, store: readJsonStore(projectPath) });
    }
    return stores;
  }
  create(input) {
    try {
      const scope = input.scope ?? "global";
      const path = this.getPathForScope(scope);
      return withFileLockSync(getLockPath(path), () => {
        const store = readJsonStore(path);
        const now = nowISO();
        const baseId = generatePreferenceId(input.title);
        let id = baseId;
        let counter = 1;
        while (store[id]) {
          id = `${baseId}-${counter}`;
          counter++;
        }
        const preference = {
          id,
          title: input.title,
          content: input.content,
          scope,
          autoInject: input.autoInject ?? true,
          trigger: input.trigger ?? {},
          tags: input.tags ?? [],
          createdAt: now,
          updatedAt: now
        };
        store[id] = preference;
        writeJsonStore(path, store);
        return { success: true, data: preference };
      });
    } catch (error) {
      return { success: false, error: `Failed to create preference: ${error}` };
    }
  }
  get(id) {
    try {
      for (const { store } of this.getAllStores()) {
        if (store[id]) {
          return { success: true, data: store[id] };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to read preference: ${error}` };
    }
  }
  resolve(idOrPrefix) {
    const exact = this.get(idOrPrefix);
    if (exact.success)
      return exact;
    const candidates = [];
    for (const { store } of this.getAllStores()) {
      for (const [key, pref] of Object.entries(store)) {
        if (key.startsWith(idOrPrefix))
          candidates.push(pref);
      }
    }
    if (candidates.length === 1)
      return { success: true, data: candidates[0] };
    if (candidates.length === 0)
      return { success: false, error: `No preference matching "${idOrPrefix}"` };
    const ids = candidates.map((p) => p.id).join(", ");
    return { success: false, error: `Ambiguous: ${candidates.length} preferences match "${idOrPrefix}" (${ids}). Be more specific.` };
  }
  update(id, updates) {
    try {
      for (const { path } of this.getAllStores()) {
        const lockPath = getLockPath(path);
        const result = withFileLockSync(lockPath, () => {
          const store = readJsonStore(path);
          if (!store[id])
            return null;
          const existing = store[id];
          const updated = {
            ...existing,
            ...updates,
            updatedAt: nowISO()
          };
          store[id] = updated;
          writeJsonStore(path, store);
          return updated;
        });
        if (result) {
          return { success: true, data: result };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to update preference: ${error}` };
    }
  }
  delete(id) {
    try {
      for (const { path } of this.getAllStores()) {
        const lockPath = getLockPath(path);
        const found = withFileLockSync(lockPath, () => {
          const store = readJsonStore(path);
          if (!store[id])
            return false;
          delete store[id];
          writeJsonStore(path, store);
          return true;
        });
        if (found) {
          return { success: true };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to delete preference: ${error}` };
    }
  }
  list(options) {
    const allPrefs = [];
    for (const { scope, store } of this.getAllStores()) {
      if (options?.scope && options.scope !== scope)
        continue;
      for (const pref of Object.values(store)) {
        if (options?.autoInject !== undefined && pref.autoInject !== options.autoInject)
          continue;
        if (options?.tags && options.tags.length > 0) {
          const hasMatchingTag = options.tags.some((t) => pref.tags.includes(t));
          if (!hasMatchingTag)
            continue;
        }
        allPrefs.push(pref);
      }
    }
    allPrefs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (options?.limit && options.limit > 0) {
      return allPrefs.slice(0, options.limit);
    }
    return allPrefs;
  }
  match(context) {
    const matches = [];
    const allPrefs = this.list({ autoInject: true });
    const promptLower = context.prompt?.toLowerCase() ?? "";
    const contextKeywords = (context.keywords ?? []).map((k) => k.toLowerCase());
    for (const pref of allPrefs) {
      const trigger = pref.trigger;
      if (trigger.always) {
        matches.push({
          preference: pref,
          score: 1,
          matchedBy: "always"
        });
        continue;
      }
      if (trigger.keywords && trigger.keywords.length > 0) {
        const matched = trigger.keywords.filter((kw) => {
          const kwLower = kw.toLowerCase();
          return promptLower.includes(kwLower) || contextKeywords.includes(kwLower);
        });
        if (matched.length > 0) {
          const score = matched.length / trigger.keywords.length;
          matches.push({
            preference: pref,
            score: Math.min(score, 1),
            matchedBy: "keyword",
            matchedTerms: matched
          });
          continue;
        }
      }
      if (trigger.categories && trigger.categories.length > 0 && context.category) {
        const catLower = context.category.toLowerCase();
        const matched = trigger.categories.filter((c) => c.toLowerCase() === catLower);
        if (matched.length > 0) {
          matches.push({
            preference: pref,
            score: matched.length / trigger.categories.length,
            matchedBy: "category",
            matchedTerms: matched
          });
          continue;
        }
      }
      if (pref.tags.length > 0 && (promptLower || contextKeywords.length > 0)) {
        const matched = pref.tags.filter((tag) => {
          const tagLower = tag.toLowerCase();
          return promptLower.includes(tagLower) || contextKeywords.includes(tagLower);
        });
        if (matched.length > 0) {
          const score = matched.length / pref.tags.length * 0.6;
          matches.push({
            preference: pref,
            score: Math.min(score, 0.6),
            matchedBy: "tag",
            matchedTerms: matched
          });
        }
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }
  stats() {
    const globalPath = getGlobalPreferencesPath();
    const projectPath = getProjectPreferencesPath(this.projectRoot);
    const globalStore = readJsonStore(globalPath);
    const projectStore = projectPath ? readJsonStore(projectPath) : {};
    const globalCount = Object.keys(globalStore).length;
    const projectCount = Object.keys(projectStore).length;
    const allPrefs = [...Object.values(globalStore), ...Object.values(projectStore)];
    const autoInjectCount = allPrefs.filter((p) => p.autoInject).length;
    return {
      total: globalCount + projectCount,
      byScope: {
        global: globalCount,
        project: projectCount
      },
      autoInjectCount,
      globalPath,
      projectPath: projectPath ?? undefined,
      sqliteAvailable: false
    };
  }
}

// src/shared/preferences/injection.ts
var CATEGORY_KEYWORDS = {
  git: {
    commit: 1,
    push: 0.9,
    pull: 0.8,
    merge: 0.9,
    rebase: 0.9,
    branch: 0.8,
    checkout: 0.7,
    stash: 0.7,
    "cherry-pick": 0.9,
    tag: 0.6,
    diff: 0.7,
    log: 0.5,
    blame: 0.7,
    bisect: 0.8,
    amend: 0.9,
    squash: 0.9,
    "co-author": 1,
    git: 0.8,
    pr: 0.7,
    "pull request": 0.8
  },
  testing: {
    test: 1,
    tests: 1,
    spec: 0.8,
    "unit test": 1,
    "integration test": 1,
    e2e: 0.9,
    coverage: 0.8,
    mock: 0.7,
    stub: 0.7,
    fixture: 0.7,
    assert: 0.8,
    expect: 0.7,
    describe: 0.6,
    vitest: 0.9,
    jest: 0.9,
    playwright: 0.8,
    "test suite": 0.9,
    "test case": 0.9,
    tdd: 0.9
  },
  refactoring: {
    refactor: 1,
    restructure: 0.9,
    reorganize: 0.8,
    rename: 0.7,
    extract: 0.8,
    inline: 0.7,
    "move to": 0.6,
    simplify: 0.7,
    "clean up": 0.8,
    cleanup: 0.8,
    decompose: 0.8,
    modularize: 0.8,
    decouple: 0.8,
    "dead code": 0.7,
    "code smell": 0.8,
    optimize: 0.6,
    consolidate: 0.7
  },
  coding: {
    implement: 0.9,
    create: 0.7,
    add: 0.6,
    build: 0.8,
    feature: 0.8,
    function: 0.6,
    class: 0.5,
    module: 0.6,
    component: 0.7,
    endpoint: 0.7,
    api: 0.6,
    handler: 0.6,
    service: 0.6,
    scaffold: 0.8,
    generate: 0.6,
    write: 0.5,
    develop: 0.7
  },
  docs: {
    document: 0.9,
    documentation: 1,
    readme: 0.9,
    jsdoc: 0.9,
    comment: 0.7,
    changelog: 0.8,
    "api docs": 0.9,
    explain: 0.6,
    describe: 0.5,
    annotate: 0.8,
    markdown: 0.6,
    wiki: 0.7,
    guide: 0.7,
    tutorial: 0.7,
    docstring: 0.9
  },
  debugging: {
    debug: 1,
    fix: 0.8,
    bug: 0.9,
    error: 0.7,
    issue: 0.6,
    crash: 0.8,
    broken: 0.8,
    failing: 0.7,
    "doesn't work": 0.8,
    "not working": 0.8,
    investigate: 0.7,
    diagnose: 0.8,
    troubleshoot: 0.9,
    trace: 0.6,
    "stack trace": 0.8,
    exception: 0.7,
    regression: 0.8
  }
};
var MIN_CONFIDENCE = 0.15;
function analyzeTaskCategory(prompt) {
  if (!prompt || prompt.trim().length === 0) {
    return { category: null, confidence: 0, scores: [] };
  }
  const promptLower = prompt.toLowerCase();
  const scores = [];
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let matchedWeight = 0;
    let maxWeight = 0;
    for (const [keyword, weight] of Object.entries(keywords)) {
      maxWeight += weight;
      if (keyword.includes(" ")) {
        if (promptLower.includes(keyword)) {
          matchedWeight += weight;
        }
      } else {
        const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
        if (regex.test(promptLower)) {
          matchedWeight += weight;
        }
      }
    }
    const score = maxWeight > 0 ? matchedWeight / maxWeight : 0;
    if (score > 0) {
      scores.push({ category: cat, score });
    }
  }
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (!top || top.score < MIN_CONFIDENCE) {
    return { category: null, confidence: 0, scores };
  }
  return {
    category: top.category,
    confidence: top.score,
    scores
  };
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
  "need",
  "must",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  "what",
  "which",
  "who",
  "whom",
  "where",
  "when",
  "how",
  "why",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "not",
  "only",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "but",
  "and",
  "or",
  "if",
  "then",
  "else",
  "for",
  "from",
  "in",
  "into",
  "on",
  "of",
  "to",
  "with",
  "about",
  "at",
  "by",
  "as",
  "up",
  "out",
  "off",
  "over",
  "after",
  "before",
  "between",
  "under",
  "again",
  "please",
  "make",
  "sure",
  "let",
  "want",
  "also",
  "like"
]);
function extractKeywords(prompt) {
  if (!prompt || prompt.trim().length === 0)
    return [];
  const tokens = prompt.toLowerCase().replace(/[^\w\s-]/g, " ").split(/\s+/).filter((t) => t.length > 0);
  const keywords = new Set;
  for (const token of tokens) {
    if (STOP_WORDS.has(token) || token.length < 3)
      continue;
    if (/^\d+$/.test(token))
      continue;
    keywords.add(token);
  }
  return [...keywords].sort((a, b) => b.length - a.length);
}
function buildPreferenceContext(prompt, category) {
  const keywords = extractKeywords(prompt);
  let detectedCategory = category;
  if (!detectedCategory) {
    const analysis = analyzeTaskCategory(prompt);
    detectedCategory = analysis.category ?? undefined;
  }
  return {
    prompt,
    category: detectedCategory,
    keywords
  };
}
function injectPreferences(context, projectRoot) {
  const store = new PreferenceStore(projectRoot);
  return store.match(context);
}
function formatPreferenceInjection(matches) {
  if (!matches || matches.length === 0)
    return "";
  const lines = [];
  lines.push("[Preferences Active]");
  for (const m of matches) {
    const reason = formatMatchReason(m);
    lines.push(`- ${m.preference.title} (${reason})`);
  }
  const detailed = matches.filter((m) => m.score >= 0.5);
  if (detailed.length > 0) {
    lines.push("");
    lines.push("[Preference Details]");
    for (const m of detailed) {
      lines.push(`> ${m.preference.title}: ${m.preference.content}`);
    }
  }
  return lines.join(`
`);
}
function formatMatchReason(match) {
  switch (match.matchedBy) {
    case "always":
      return "always active";
    case "keyword":
      return `matched: ${match.matchedTerms?.join(", ") ?? "keyword"}`;
    case "category":
      return `category: ${match.matchedTerms?.join(", ") ?? "detected"}`;
    case "tag":
      return `tag: ${match.matchedTerms?.join(", ") ?? "tag"}`;
    default:
      return "matched";
  }
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/hooks/user-prompt-submit/preference-awareness.ts
var CACHE_TTL_MS = 8000;
var MAX_MATCHES = 5;
var CACHE_PATH = join2(tmpdir(), "omc-pref-awareness-cache.json");
var CACHE_LOCK_PATH = CACHE_PATH + ".lock";
function quickHash(str) {
  let hash = 0;
  for (let i = 0;i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
  }
  return hash.toString(36);
}
function getCached(promptHash) {
  try {
    if (!existsSync3(CACHE_PATH))
      return null;
    const raw = readFileSync2(CACHE_PATH, "utf-8");
    const cache = JSON.parse(raw);
    if (cache.hash === promptHash && Date.now() - cache.ts < CACHE_TTL_MS) {
      return cache.result;
    }
  } catch {}
  return null;
}
function setCache(promptHash, result) {
  try {
    withFileLockSync(CACHE_LOCK_PATH, () => {
      const entry = {
        ts: Date.now(),
        hash: promptHash,
        result
      };
      atomicWriteJson(CACHE_PATH, entry, {
        indent: 0,
        trailingNewline: false
      });
    }, { retries: 3, backoffMs: 10 });
  } catch {}
}
function approve() {
  return JSON.stringify({ decision: "approve" });
}
function approveWithContext(context) {
  const response = {
    decision: "approve",
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context
    }
  };
  return JSON.stringify(response);
}
async function main() {
  let inputData = "";
  try {
    inputData = readFileSync2(0, "utf-8");
  } catch {
    console.log(approve());
    return;
  }
  if (!inputData.trim()) {
    console.log(approve());
    return;
  }
  let input;
  try {
    input = JSON.parse(inputData);
  } catch {
    console.log(approve());
    return;
  }
  const prompt = input.prompt ?? "";
  if (prompt.length < 3) {
    console.log(approve());
    return;
  }
  const cacheKey = `${input.cwd ?? ""}:::${prompt}`;
  const hash = quickHash(cacheKey);
  const cached = getCached(hash);
  if (cached !== null) {
    console.log(cached === "" ? approve() : approveWithContext(cached));
    return;
  }
  try {
    const context = buildPreferenceContext(prompt);
    const matches = injectPreferences(context, input.cwd);
    const topMatches = matches.slice(0, MAX_MATCHES);
    if (topMatches.length === 0) {
      setCache(hash, "");
      console.log(approve());
      return;
    }
    const formatted = formatPreferenceInjection(topMatches);
    if (!formatted) {
      setCache(hash, "");
      console.log(approve());
      return;
    }
    setCache(hash, formatted);
    console.log(approveWithContext(formatted));
  } catch {
    console.log(approve());
  }
}
main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
