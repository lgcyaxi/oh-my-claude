import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { cwd } from "node:process";

import type { Preference } from "./types";
import { PreferenceStore } from "./store";

// ---- Constants ----

export const CLAUDE_MD_MARKERS = {
  start: "<!-- OMC-CONTEXT-AUTO - Managed by oh-my-claude. Do not edit manually. -->",
  end: "<!-- OMC-CONTEXT-AUTO-END -->",
} as const;

const CLAUDE_MD_FILENAME = "CLAUDE.md";

// ---- Path helpers ----

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

function getProjectClaudeMdPath(projectRoot?: string): string | null {
  const root = projectRoot ?? findProjectRoot();
  if (!root) return null;
  const path = join(root, CLAUDE_MD_FILENAME);
  return existsSync(path) ? path : null;
}

function getGlobalClaudeMdPath(): string | null {
  const path = join(homedir(), ".claude", CLAUDE_MD_FILENAME);
  return existsSync(path) ? path : null;
}

// ---- Preference grouping ----

interface GroupedPreferences {
  always: Preference[];
  categories: Map<string, Preference[]>;
  keywords: Map<string, Preference[]>;
}

function groupPreferences(preferences: Preference[]): GroupedPreferences {
  const result: GroupedPreferences = {
    always: [],
    categories: new Map(),
    keywords: new Map(),
  };

  for (const pref of preferences) {
    if (!pref.autoInject) continue;

    const trigger = pref.trigger;

    if (trigger.always) {
      result.always.push(pref);
      continue;
    }

    if (trigger.categories && trigger.categories.length > 0) {
      for (const cat of trigger.categories) {
        const label = capitalizeFirst(cat);
        if (!result.categories.has(label)) {
          result.categories.set(label, []);
        }
        result.categories.get(label)!.push(pref);
      }
      continue;
    }

    if (trigger.keywords && trigger.keywords.length > 0) {
      const label = "Keyword-Triggered";
      if (!result.keywords.has(label)) {
        result.keywords.set(label, []);
      }
      result.keywords.get(label)!.push(pref);
    }
  }

  return result;
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- Formatting ----

function formatPrefLine(pref: Preference): string {
  return `- **${pref.title}** — ${pref.content}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Format preferences into markdown for the managed Claude.md section.
 * Groups by trigger type: always, category-based, keyword-based.
 */
export function formatPreferencesForClaudeMd(preferences: Preference[]): string {
  const injectable = preferences.filter((p) => p.autoInject);

  if (injectable.length === 0) {
    return [
      CLAUDE_MD_MARKERS.start,
      "## Active Preferences",
      "",
      "*No active preferences configured. Use `remember_preference` to add rules.*",
      "",
      "---",
      `*This section is automatically maintained by oh-my-claude. Last updated: ${formatDate(new Date())}*`,
      CLAUDE_MD_MARKERS.end,
    ].join("\n");
  }

  const grouped = groupPreferences(injectable);
  const lines: string[] = [];

  lines.push(CLAUDE_MD_MARKERS.start);
  lines.push("## Active Preferences");
  lines.push("");

  if (grouped.always.length > 0) {
    lines.push("### Global Preferences (Always Active)");
    for (const pref of grouped.always) {
      lines.push(formatPrefLine(pref));
    }
    lines.push("");
  }

  for (const [category, prefs] of grouped.categories) {
    lines.push(`### ${category} Preferences`);
    for (const pref of prefs) {
      lines.push(formatPrefLine(pref));
    }
    lines.push("");
  }

  for (const [label, prefs] of grouped.keywords) {
    lines.push(`### ${label}`);
    for (const pref of prefs) {
      const keywords = pref.trigger.keywords?.join(", ") ?? "";
      lines.push(`${formatPrefLine(pref)} *(triggers: ${keywords})*`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*This section is automatically maintained by oh-my-claude. Last updated: ${formatDate(new Date())}*`);
  lines.push(CLAUDE_MD_MARKERS.end);

  return lines.join("\n");
}

// ---- Section read/write ----

function extractSection(content: string): string | null {
  const startIdx = content.indexOf(CLAUDE_MD_MARKERS.start);
  const endIdx = content.indexOf(CLAUDE_MD_MARKERS.end);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }

  return content.slice(startIdx, endIdx + CLAUDE_MD_MARKERS.end.length);
}

export function readClaudeMdSection(projectRoot?: string): string | null {
  const paths = [getProjectClaudeMdPath(projectRoot), getGlobalClaudeMdPath()].filter(Boolean) as string[];

  for (const filePath of paths) {
    const content = readFileSync(filePath, "utf-8");
    const section = extractSection(content);
    if (section !== null) return section;
  }

  return null;
}

function updateFile(filePath: string, preferences: Preference[]): void {
  const content = readFileSync(filePath, "utf-8");
  const section = formatPreferencesForClaudeMd(preferences);

  const startIdx = content.indexOf(CLAUDE_MD_MARKERS.start);
  const endIdx = content.indexOf(CLAUDE_MD_MARKERS.end);

  let newContent: string;

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + CLAUDE_MD_MARKERS.end.length);
    newContent = before + section + after;
  } else {
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    newContent = content + separator + section + "\n";
  }

  writeFileSync(filePath, newContent, "utf-8");
}

export function updateClaudeMdSection(projectRoot?: string, preferences?: Preference[]): void {
  const store = new PreferenceStore(projectRoot);
  const allPrefs = preferences ?? store.list({ autoInject: true });

  const globalPrefs = allPrefs.filter((p) => p.scope === "global");
  const projectPrefs = allPrefs.filter((p) => p.scope === "project");

  const projectPath = getProjectClaudeMdPath(projectRoot);
  if (projectPath) {
    updateFile(projectPath, [...globalPrefs, ...projectPrefs]);
  }

  const globalPath = getGlobalClaudeMdPath();
  if (globalPath) {
    updateFile(globalPath, globalPrefs);
  }
}
