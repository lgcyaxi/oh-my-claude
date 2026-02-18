/**
 * Memory Timeline Generator
 *
 * Auto-maintains a TIMELINE.md file that acts as a chronological table of contents
 * for all memories. Injected into agent context on every prompt via memory-awareness hook,
 * giving the agent continuous cross-session awareness.
 *
 * Safety: TIMELINE.md lives at the root of `.claude/mem/` and `~/.claude/oh-my-claude/memory/`,
 * NOT inside `notes/` or `sessions/`. Since `listMemories()` only scans those subdirectories
 * (via `getTypeDir()`), the timeline file is invisible to all memory operations.
 *
 * Cleared entries: When memories are cleared via /omc-mem-clear, a "cleared" record is saved
 * to `.claude/mem/cleared/` that tracks what was deleted (title only, no tags). These appear
 * in Timeline with strikethrough format: 🗑️ ~~Title~~
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { MemoryEntry, MemoryScope } from "./types";
import {
  listMemories,
  getProjectMemoryDir,
  getMemoryDir,
} from "./store";

// ---- Types ----

export interface TimelineOptions {
  /** Maximum total lines in the timeline output (default: 120) */
  maxTotalLines?: number;
  /** Maximum entries to show in "This Week" section before collapsing (default: 10) */
  maxWeekEntries?: number;
}

// ---- Constants ----

const TIMELINE_FILENAME = "TIMELINE.md";
const CLEARED_DIRNAME = "cleared";
const DEFAULT_MAX_LINES = 120;
const DEFAULT_MAX_WEEK_ENTRIES = 10;

// ---- Cleared Entry Types ----

/**
 * Represents a memory that was cleared (deleted) via /omc-mem-clear.
 * Stored in .claude/mem/cleared/ directory to preserve "what was done" in Timeline.
 */
export interface ClearedEntry {
  /** Original memory ID */
  id: string;
  /** Original title (displayed with strikethrough) */
  title: string;
  /** Original creation date */
  createdAt: string;
  /** When it was cleared */
  clearedAt: string;
  /** Original type: note or session */
  type: "note" | "session";
}

/**
 * Save a cleared entry record when deleting a memory.
 * This preserves "what was done" in Timeline without the actual content or tags.
 */
export function saveClearedEntry(entry: ClearedEntry, scope: "project" | "global", projectRoot?: string): void {
  const baseDir = scope === "project" ? getProjectMemoryDir(projectRoot) : getMemoryDir();
  if (!baseDir) return;

  const clearedDir = join(baseDir, CLEARED_DIRNAME);
  if (!existsSync(clearedDir)) {
    mkdirSync(clearedDir, { recursive: true });
  }

  const filename = `${entry.id}.json`;
  const filepath = join(clearedDir, filename);
  writeFileSync(filepath, JSON.stringify(entry, null, 2), "utf-8");
}

/**
 * List all cleared entries for a scope.
 */
export function listClearedEntries(scope: "project" | "global", projectRoot?: string): ClearedEntry[] {
  const baseDir = scope === "project" ? getProjectMemoryDir(projectRoot) : getMemoryDir();
  if (!baseDir) return [];

  const clearedDir = join(baseDir, CLEARED_DIRNAME);
  if (!existsSync(clearedDir)) return [];

  const entries: ClearedEntry[] = [];
  try {
    const files = readdirSync(clearedDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = readFileSync(join(clearedDir, file), "utf-8");
        entries.push(JSON.parse(content) as ClearedEntry);
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    return [];
  }

  return entries.sort((a, b) => new Date(b.clearedAt).getTime() - new Date(a.clearedAt).getTime());
}

// ---- Date helpers ----

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatMonthDayShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---- Grouping logic ----

interface TimeGroup {
  label: string;
  entries: MemoryEntry[];
  period: "today" | "yesterday" | "this_week" | "this_month" | "older";
  /** For older months: key like "2026-01" */
  monthKey?: string;
  /** Whether this group contains cleared entries */
  isCleared?: boolean;
}

interface ClearedTimeGroup {
  label: string;
  clearedEntries: ClearedEntry[];
  period: "today" | "yesterday" | "this_week" | "this_month" | "older";
  monthKey?: string;
  isCleared: true;
}

function groupClearedEntriesByPeriod(entries: ClearedEntry[], now: Date): ClearedTimeGroup[] {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = getWeekStart(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: Map<string, ClearedTimeGroup> = new Map();
  const todayLabel = `Today (${formatMonthDay(now)})`;
  const yesterdayLabel = `Yesterday (${formatMonthDay(yesterday)})`;

  for (const entry of entries) {
    const date = new Date(entry.createdAt);

    if (isSameDay(date, now)) {
      const key = "cleared_today";
      if (!groups.has(key)) {
        groups.set(key, { label: todayLabel, clearedEntries: [], period: "today", isCleared: true });
      }
      groups.get(key)!.clearedEntries.push(entry);
    } else if (isSameDay(date, yesterday)) {
      const key = "cleared_yesterday";
      if (!groups.has(key)) {
        groups.set(key, { label: yesterdayLabel, clearedEntries: [], period: "yesterday", isCleared: true });
      }
      groups.get(key)!.clearedEntries.push(entry);
    } else if (date >= weekStart && date < yesterday) {
      const weekEndDay = new Date(yesterday);
      weekEndDay.setDate(weekEndDay.getDate() - 1);
      const key = "cleared_this_week";
      if (!groups.has(key)) {
        const rangeLabel = `This Week (${formatMonthDayShort(weekStart)}-${formatMonthDayShort(weekEndDay)})`;
        groups.set(key, { label: rangeLabel, clearedEntries: [], period: "this_week", isCleared: true });
      }
      groups.get(key)!.clearedEntries.push(entry);
    } else if (date >= monthStart && date < weekStart) {
      const key = "cleared_this_month";
      if (!groups.has(key)) {
        groups.set(key, { label: "Earlier This Month", clearedEntries: [], period: "this_month", isCleared: true });
      }
      groups.get(key)!.clearedEntries.push(entry);
    } else if (date < monthStart) {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const key = `cleared_older_${monthKey}`;
      if (!groups.has(key)) {
        groups.set(key, {
          label: formatMonthYear(date),
          clearedEntries: [],
          period: "older",
          monthKey,
          isCleared: true,
        });
      }
      groups.get(key)!.clearedEntries.push(entry);
    }
  }

  return Array.from(groups.values());
}

function groupEntriesByPeriod(entries: MemoryEntry[], now: Date): TimeGroup[] {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = getWeekStart(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: Map<string, TimeGroup> = new Map();

  // Initialize known groups in order
  const todayLabel = `Today (${formatMonthDay(now)})`;
  const yesterdayLabel = `Yesterday (${formatMonthDay(yesterday)})`;

  for (const entry of entries) {
    const date = new Date(entry.createdAt);

    if (isSameDay(date, now)) {
      const key = "today";
      if (!groups.has(key)) {
        groups.set(key, { label: todayLabel, entries: [], period: "today" });
      }
      groups.get(key)!.entries.push(entry);
    } else if (isSameDay(date, yesterday)) {
      const key = "yesterday";
      if (!groups.has(key)) {
        groups.set(key, { label: yesterdayLabel, entries: [], period: "yesterday" });
      }
      groups.get(key)!.entries.push(entry);
    } else if (date >= weekStart && date < yesterday) {
      const weekEndDay = new Date(yesterday);
      weekEndDay.setDate(weekEndDay.getDate() - 1);
      const key = "this_week";
      if (!groups.has(key)) {
        const rangeLabel = `This Week (${formatMonthDayShort(weekStart)}-${formatMonthDayShort(weekEndDay)})`;
        groups.set(key, { label: rangeLabel, entries: [], period: "this_week" });
      }
      groups.get(key)!.entries.push(entry);
    } else if (date >= monthStart && date < weekStart) {
      const key = "this_month";
      if (!groups.has(key)) {
        groups.set(key, { label: "Earlier This Month", entries: [], period: "this_month" });
      }
      groups.get(key)!.entries.push(entry);
    } else if (date < monthStart) {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const key = `older_${monthKey}`;
      if (!groups.has(key)) {
        groups.set(key, {
          label: formatMonthYear(date),
          entries: [],
          period: "older",
          monthKey,
        });
      }
      groups.get(key)!.entries.push(entry);
    }
  }

  // Return in chronological order (newest first)
  return Array.from(groups.values());
}

// ---- Entry formatting ----

function formatEntryFull(entry: MemoryEntry, includeDate: boolean): string {
  const date = new Date(entry.createdAt);
  const timeStr = includeDate ? formatMonthDay(date) : formatTime(date);
  const typeTag = `[${entry.type}]`;
  const tags = entry.tags.length > 0 ? ` \`${entry.tags.join(", ")}\`` : "";
  return `- ${timeStr} ${typeTag} **${entry.title}**${tags}`;
}

/**
 * Format a cleared entry with strikethrough and no tags.
 * Cleared entries show "what was done" but are not searchable via recall.
 */
function formatClearedEntry(entry: ClearedEntry, includeDate: boolean): string {
  const date = new Date(entry.createdAt);
  const timeStr = includeDate ? formatMonthDay(date) : formatTime(date);
  // Strikethrough title, no tags (makes it unsearchable)
  return `- 🗑️ ${timeStr} ~~${entry.title}~~`;
}

function formatCollapsedGroup(entries: MemoryEntry[]): string {
  const notes = entries.filter(e => e.type === "note").length;
  const sessions = entries.filter(e => e.type === "session").length;

  const typeParts: string[] = [];
  if (notes > 0) typeParts.push(`${notes} note${notes > 1 ? "s" : ""}`);
  if (sessions > 0) typeParts.push(`${sessions} session${sessions > 1 ? "s" : ""}`);

  const allTags = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      allTags.add(tag);
    }
  }
  const tagStr = allTags.size > 0 ? ` | tags: ${Array.from(allTags).slice(0, 8).join(", ")}` : "";

  return `${entries.length} memories (${typeParts.join(", ")})${tagStr}`;
}

// ---- Main generator ----

export interface GenerateTimelineOptions extends TimelineOptions {
  /** Cleared entries to include in timeline (shown with strikethrough) */
  clearedEntries?: ClearedEntry[];
}

/**
 * Generate a timeline markdown string from memory entries.
 * Pure function — no side effects.
 */
export function generateTimeline(entries: MemoryEntry[], options?: GenerateTimelineOptions): string {
  if (entries.length === 0 && (!options?.clearedEntries || options.clearedEntries.length === 0)) return "";

  const maxLines = options?.maxTotalLines ?? DEFAULT_MAX_LINES;
  const maxWeekEntries = options?.maxWeekEntries ?? DEFAULT_MAX_WEEK_ENTRIES;
  const clearedEntries = options?.clearedEntries ?? [];
  const now = new Date();

  const groups = groupEntriesByPeriod(entries, now);
  const clearedGroups = groupClearedEntriesByPeriod(clearedEntries, now);

  const lines: string[] = [];
  const totalMemories = entries.length;
  const totalCleared = clearedEntries.length;
  const statsLine = totalCleared > 0
    ? `> ${totalMemories} memories, ${totalCleared} cleared | Updated: ${now.toISOString()}`
    : `> ${totalMemories} memories | Updated: ${now.toISOString()}`;

  lines.push("# Memory Timeline");
  lines.push(statsLine);
  lines.push("");

  // Merge regular and cleared groups, interleaving by date
  const allGroups = [...groups, ...clearedGroups].sort((a, b) => {
    // Sort by period priority: today > yesterday > this_week > this_month > older
    const periodOrder = { today: 0, yesterday: 1, this_week: 2, this_month: 3, older: 4 };
    return (periodOrder[a.period] ?? 5) - (periodOrder[b.period] ?? 5);
  });

  for (const group of allGroups) {
    // Handle cleared groups
    if ("isCleared" in group && group.isCleared && "clearedEntries" in group) {
      const clearedGroup = group as ClearedTimeGroup;
      if (clearedGroup.clearedEntries.length === 0) continue;

      lines.push(`## ${clearedGroup.label} (Cleared)`);

      for (const entry of clearedGroup.clearedEntries) {
        lines.push(formatClearedEntry(entry, clearedGroup.period !== "today" && clearedGroup.period !== "yesterday"));
      }
      lines.push("");
      continue;
    }

    // Handle regular groups
    const regularGroup = group as TimeGroup;
    if (regularGroup.entries.length === 0) continue;

    lines.push(`## ${regularGroup.label}`);

    switch (regularGroup.period) {
      case "today":
      case "yesterday":
        // Full detail, no date needed (section header has it)
        for (const entry of regularGroup.entries) {
          lines.push(formatEntryFull(entry, false));
        }
        break;

      case "this_week":
        // Full detail with date, but cap at maxWeekEntries
        if (regularGroup.entries.length <= maxWeekEntries) {
          for (const entry of regularGroup.entries) {
            lines.push(formatEntryFull(entry, true));
          }
        } else {
          // Show first maxWeekEntries, then collapse rest
          for (let i = 0; i < maxWeekEntries; i++) {
            lines.push(formatEntryFull(regularGroup.entries[i]!, true));
          }
          const remaining = regularGroup.entries.slice(maxWeekEntries);
          lines.push(`- ... and ${remaining.length} more`);
        }
        break;

      case "this_month":
        // Collapse if >10 entries
        if (regularGroup.entries.length <= 10) {
          for (const entry of regularGroup.entries) {
            lines.push(formatEntryFull(entry, true));
          }
        } else {
          lines.push(formatCollapsedGroup(regularGroup.entries));
        }
        break;

      case "older":
        // Always collapsed
        lines.push(formatCollapsedGroup(regularGroup.entries));
        break;
    }

    lines.push("");
  }

  // Auto-scaling: truncate from bottom if exceeding maxLines
  if (lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines - 1);
    truncated.push(`\n> ... truncated (${lines.length - maxLines + 1} lines omitted)`);
    return truncated.join("\n");
  }

  return lines.join("\n");
}

// ---- Disk I/O ----

/**
 * Get the path to TIMELINE.md for a given scope.
 */
function getTimelinePath(scope: "project" | "global", projectRoot?: string): string | null {
  if (scope === "project") {
    const dir = getProjectMemoryDir(projectRoot);
    return dir ? join(dir, TIMELINE_FILENAME) : null;
  }
  return join(getMemoryDir(), TIMELINE_FILENAME);
}

/**
 * Write TIMELINE.md to the appropriate directory for a scope.
 */
export function writeTimeline(scope: "project" | "global", content: string, projectRoot?: string): void {
  const path = getTimelinePath(scope, projectRoot);
  if (!path) return;

  // Ensure parent directory exists
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, content, "utf-8");
}

/**
 * Read TIMELINE.md from disk for a given scope.
 * Returns null if the file doesn't exist.
 */
export function readTimeline(scope: "project" | "global", projectRoot?: string): string | null {
  const path = getTimelinePath(scope, projectRoot);
  if (!path || !existsSync(path)) return null;

  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Regenerate TIMELINE.md for both project and global scopes.
 * Orchestrator: list → generate → write.
 *
 * This is called after every memory mutation (remember, forget, compact, clear, summarize)
 * and on indexer startup. Best-effort — errors are silently caught.
 */
export function regenerateTimelines(projectRoot?: string): void {
  // Generate project timeline
  const projectDir = getProjectMemoryDir(projectRoot);
  if (projectDir && existsSync(projectDir)) {
    const projectEntries = listMemories({ scope: "project" }, projectRoot);
    const projectCleared = listClearedEntries("project", projectRoot);
    if (projectEntries.length > 0 || projectCleared.length > 0) {
      const content = generateTimeline(projectEntries, { clearedEntries: projectCleared });
      writeTimeline("project", content, projectRoot);
    } else {
      // Clear timeline if no entries
      writeTimeline("project", "", projectRoot);
    }
  }

  // Generate global timeline
  const globalEntries = listMemories({ scope: "global" });
  const globalCleared = listClearedEntries("global");
  if (globalEntries.length > 0 || globalCleared.length > 0) {
    const content = generateTimeline(globalEntries, { clearedEntries: globalCleared });
    writeTimeline("global", content);
  } else {
    writeTimeline("global", "", undefined);
  }
}
