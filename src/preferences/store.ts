/**
 * Preference Store — Hybrid JSON + SQLite storage
 *
 * JSON file (preferences.json) is the source of truth for fast ID-based lookups.
 * SQLite table provides complex queries for trigger matching and category filtering.
 *
 * Storage locations:
 *   Global: ~/.claude/oh-my-claude/preferences.json
 *   Project: .claude/preferences.json
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { cwd } from "node:process";

import type {
  Preference,
  PreferenceScope,
  PreferenceStats,
  PreferenceResult,
  PreferenceListOptions,
  PreferenceMatch,
  PreferenceContext,
  PreferenceStorage,
  PreferenceJsonStore,
  CreatePreferenceInput,
} from "./types";

// ---- Constants ----

const PREFERENCES_FILENAME = "preferences.json";

// ---- Project detection (mirrors memory/store.ts) ----

function findProjectRoot(fromDir?: string): string | null {
  let dir = fromDir ?? cwd();
  const root = dirname(dir);

  while (dir !== root) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (existsSync(join(dir, ".git"))) {
    return dir;
  }

  return null;
}

// ---- Path helpers ----

export function getGlobalPreferencesDir(): string {
  return join(homedir(), ".claude", "oh-my-claude");
}

export function getGlobalPreferencesPath(): string {
  return join(getGlobalPreferencesDir(), PREFERENCES_FILENAME);
}

export function getProjectPreferencesDir(projectRoot?: string): string | null {
  const root = projectRoot ?? findProjectRoot();
  if (!root) return null;
  return join(root, ".claude");
}

export function getProjectPreferencesPath(projectRoot?: string): string | null {
  const dir = getProjectPreferencesDir(projectRoot);
  if (!dir) return null;
  return join(dir, PREFERENCES_FILENAME);
}

// ---- ID generation ----

export function generatePreferenceId(title: string, date?: Date): string {
  const d = date ?? new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `pref-${dateStr}-${slug}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

// ---- JSON file I/O ----

function readJsonStore(path: string): PreferenceJsonStore {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as PreferenceJsonStore;
  } catch {
    return {};
  }
}

function writeJsonStore(path: string, store: PreferenceJsonStore): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

// ---- Preference Store Implementation ----

export class PreferenceStore implements PreferenceStorage {
  private projectRoot?: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot;
  }

  private getPathForScope(scope: PreferenceScope): string {
    if (scope === "project") {
      const path = getProjectPreferencesPath(this.projectRoot);
      if (!path) throw new Error("No project directory found. Use scope: 'global' or initialize a git repo.");
      return path;
    }
    return getGlobalPreferencesPath();
  }

  private getAllStores(): Array<{ scope: PreferenceScope; path: string; store: PreferenceJsonStore }> {
    const stores: Array<{ scope: PreferenceScope; path: string; store: PreferenceJsonStore }> = [];

    const globalPath = getGlobalPreferencesPath();
    stores.push({ scope: "global", path: globalPath, store: readJsonStore(globalPath) });

    const projectPath = getProjectPreferencesPath(this.projectRoot);
    if (projectPath) {
      stores.push({ scope: "project", path: projectPath, store: readJsonStore(projectPath) });
    }

    return stores;
  }

  create(input: CreatePreferenceInput): PreferenceResult<Preference> {
    try {
      const scope = input.scope ?? "global";
      const path = this.getPathForScope(scope);
      const store = readJsonStore(path);

      const now = nowISO();
      let id = generatePreferenceId(input.title);

      let counter = 1;
      while (store[id]) {
        id = `${generatePreferenceId(input.title)}-${counter}`;
        counter++;
      }

      const preference: Preference = {
        id,
        title: input.title,
        content: input.content,
        scope,
        autoInject: input.autoInject ?? true,
        trigger: input.trigger ?? {},
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };

      store[id] = preference;
      writeJsonStore(path, store);

      return { success: true, data: preference };
    } catch (error) {
      return { success: false, error: `Failed to create preference: ${error}` };
    }
  }

  get(id: string): PreferenceResult<Preference> {
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

  update(
    id: string,
    updates: Partial<Pick<Preference, "title" | "content" | "autoInject" | "trigger" | "tags">>,
  ): PreferenceResult<Preference> {
    try {
      for (const { path, store } of this.getAllStores()) {
        if (store[id]) {
          const existing = store[id];
          const updated: Preference = {
            ...existing,
            ...updates,
            updatedAt: nowISO(),
          };
          store[id] = updated;
          writeJsonStore(path, store);
          return { success: true, data: updated };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to update preference: ${error}` };
    }
  }

  delete(id: string): PreferenceResult {
    try {
      for (const { path, store } of this.getAllStores()) {
        if (store[id]) {
          delete store[id];
          writeJsonStore(path, store);
          return { success: true };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to delete preference: ${error}` };
    }
  }

  list(options?: PreferenceListOptions): Preference[] {
    const allPrefs: Preference[] = [];

    for (const { scope, store } of this.getAllStores()) {
      if (options?.scope && options.scope !== scope) continue;

      for (const pref of Object.values(store)) {
        if (options?.autoInject !== undefined && pref.autoInject !== options.autoInject) continue;

        if (options?.tags && options.tags.length > 0) {
          const hasMatchingTag = options.tags.some((t) => pref.tags.includes(t));
          if (!hasMatchingTag) continue;
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

  match(context: PreferenceContext): PreferenceMatch[] {
    const matches: PreferenceMatch[] = [];
    const allPrefs = this.list({ autoInject: true });

    const promptLower = context.prompt?.toLowerCase() ?? "";
    const contextKeywords = (context.keywords ?? []).map((k) => k.toLowerCase());

    for (const pref of allPrefs) {
      const trigger = pref.trigger;

      if (trigger.always) {
        matches.push({
          preference: pref,
          score: 1.0,
          matchedBy: "always",
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
            score: Math.min(score, 1.0),
            matchedBy: "keyword",
            matchedTerms: matched,
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
            matchedTerms: matched,
          });
        }
      }
    }

    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  stats(): PreferenceStats {
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
        project: projectCount,
      },
      autoInjectCount,
      globalPath,
      projectPath: projectPath ?? undefined,
      sqliteAvailable: false,
    };
  }
}
