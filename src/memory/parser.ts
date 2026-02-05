/**
 * Memory Markdown Parser
 *
 * Parses and serializes memory entries as markdown files with YAML frontmatter.
 * Follows the same frontmatter convention as the styles system.
 *
 * File format:
 * ```
 * ---
 * title: My Memory
 * type: note
 * tags: [pattern, convention]
 * created: 2026-01-29T10:00:00.000Z
 * updated: 2026-01-29T10:00:00.000Z
 * ---
 *
 * Memory content in markdown...
 * ```
 */

import type { MemoryEntry, MemoryFrontmatter, MemoryType } from "./types";

/**
 * Parse a memory markdown file into a MemoryEntry
 */
export function parseMemoryFile(id: string, raw: string): MemoryEntry | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return null;
  }

  const frontmatterRaw = match[1] ?? "";
  const content = (match[2] ?? "").trim();

  const frontmatter = parseFrontmatter(frontmatterRaw);

  return {
    id,
    title: frontmatter.title || id,
    type: frontmatter.type,
    tags: frontmatter.tags,
    content,
    createdAt: frontmatter.created,
    updatedAt: frontmatter.updated,
  };
}

/**
 * Serialize a MemoryEntry to markdown with YAML frontmatter
 */
export function serializeMemoryFile(entry: MemoryEntry): string {
  const tagsStr = entry.tags.length > 0 ? `[${entry.tags.join(", ")}]` : "[]";

  return `---
title: ${entry.title}
type: ${entry.type}
tags: ${tagsStr}
created: ${entry.createdAt}
updated: ${entry.updatedAt}
---

${entry.content}
`;
}

/**
 * Generate a memory ID from a title and timestamp.
 * Format: YYYY-MM-DD-slugified-title
 */
export function generateMemoryId(title: string, date?: Date): string {
  const d = date ?? new Date();
  const datePrefix = d.toISOString().slice(0, 10); // YYYY-MM-DD
  const slug = slugify(title);
  return `${datePrefix}-${slug}`;
}

/**
 * Auto-generate a title from content (first line or first N chars)
 */
export function generateTitle(content: string): string {
  // Use first non-empty line, strip markdown heading prefix
  const firstLine = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (!firstLine) return "untitled";

  // Strip heading markers
  const cleaned = firstLine.replace(/^#+\s*/, "").trim();

  // Truncate to reasonable length
  if (cleaned.length > 80) {
    return cleaned.slice(0, 77) + "...";
  }

  return cleaned;
}

/**
 * Get the current timestamp in ISO 8601 format
 */
export function nowISO(): string {
  return new Date().toISOString();
}

// ---- Internal helpers ----

/**
 * Parse YAML frontmatter string into MemoryFrontmatter
 */
function parseFrontmatter(raw: string): MemoryFrontmatter {
  const now = nowISO();
  const result: MemoryFrontmatter = {
    title: "",
    type: "note",
    tags: [],
    created: now,
    updated: now,
  };

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    // title
    const titleMatch = trimmed.match(/^title:\s*(.+)$/);
    if (titleMatch?.[1]) {
      result.title = titleMatch[1].trim();
      continue;
    }

    // type
    const typeMatch = trimmed.match(/^type:\s*(.+)$/);
    if (typeMatch?.[1]) {
      const t = typeMatch[1].trim();
      if (t === "session" || t === "note") {
        result.type = t as MemoryType;
      }
      continue;
    }

    // tags (supports [tag1, tag2] and tag1, tag2 formats)
    const tagsMatch = trimmed.match(/^tags:\s*(.+)$/);
    if (tagsMatch?.[1]) {
      result.tags = parseTags(tagsMatch[1].trim());
      continue;
    }

    // created
    const createdMatch = trimmed.match(/^created:\s*(.+)$/);
    if (createdMatch?.[1]) {
      result.created = createdMatch[1].trim();
      continue;
    }

    // updated
    const updatedMatch = trimmed.match(/^updated:\s*(.+)$/);
    if (updatedMatch?.[1]) {
      result.updated = updatedMatch[1].trim();
      continue;
    }
  }

  return result;
}

/**
 * Parse a tags string into an array
 * Supports: [tag1, tag2], "tag1, tag2", [tag1,tag2]
 */
function parseTags(raw: string): string[] {
  // Strip brackets
  const stripped = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!stripped) return [];

  return stripped
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Slugify a string for use as a filename
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric except spaces and hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, "") // Trim leading/trailing hyphens
    .slice(0, 50); // Limit length
}
