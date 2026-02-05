/**
 * Memory Search Module
 *
 * Simple in-memory text search for the MVP.
 * No SQLite/FTS5 dependency — keeps things simple (KISS/YAGNI).
 * Can be upgraded to FTS5 later if needed.
 *
 * Search strategy:
 * 1. Tokenize query into lowercase words
 * 2. Score each memory by matching tokens against title, content, and tags
 * 3. Return results sorted by relevance score
 */

import type { MemoryEntry, MemorySearchOptions } from "./types";
import { listMemories } from "./store";

/**
 * Search result with relevance score
 */
export interface SearchResult {
  entry: MemoryEntry;
  score: number;
  /** Matched fields */
  matchedFields: ("title" | "content" | "tags")[];
}

/**
 * Search memories with text matching and filtering
 */
export function searchMemories(options: MemorySearchOptions): SearchResult[] {
  // Load all memories (filtered by type if specified)
  const entries = listMemories({ type: options.type });

  // If no query, return entries as-is (with score 1)
  if (!options.query || options.query.trim().length === 0) {
    const results = entries.map((entry) => ({
      entry,
      score: 1,
      matchedFields: [] as ("title" | "content" | "tags")[],
    }));
    return applyLimitAndSort(results, options);
  }

  // Filter by tags if specified
  let filtered = entries;
  if (options.tags && options.tags.length > 0) {
    const filterTags = new Set(options.tags.map((t) => t.toLowerCase()));
    filtered = filtered.filter((entry) =>
      entry.tags.some((t) => filterTags.has(t.toLowerCase()))
    );
  }

  // Tokenize query
  const tokens = tokenize(options.query);
  if (tokens.length === 0) {
    const results = filtered.map((entry) => ({
      entry,
      score: 1,
      matchedFields: [] as ("title" | "content" | "tags")[],
    }));
    return applyLimitAndSort(results, options);
  }

  // Score each memory
  const results: SearchResult[] = [];
  for (const entry of filtered) {
    const result = scoreEntry(entry, tokens);
    if (result.score > 0) {
      results.push(result);
    }
  }

  return applyLimitAndSort(results, options);
}

// ---- Internal helpers ----

/**
 * Tokenize a query string into lowercase words
 */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Score a memory entry against query tokens
 * Weighting: title (3x), tags (2x), content (1x)
 */
function scoreEntry(entry: MemoryEntry, tokens: string[]): SearchResult {
  const titleLower = entry.title.toLowerCase();
  const contentLower = entry.content.toLowerCase();
  const tagsLower = entry.tags.map((t) => t.toLowerCase());

  let score = 0;
  const matchedFields = new Set<"title" | "content" | "tags">();

  for (const token of tokens) {
    // Title match (weight: 3)
    if (titleLower.includes(token)) {
      score += 3;
      matchedFields.add("title");
    }

    // Tags match (weight: 2)
    if (tagsLower.some((t) => t.includes(token))) {
      score += 2;
      matchedFields.add("tags");
    }

    // Content match (weight: 1)
    if (contentLower.includes(token)) {
      score += 1;
      matchedFields.add("content");
    }
  }

  // Bonus for exact title match
  const queryJoined = tokens.join(" ");
  if (titleLower === queryJoined) {
    score += 5;
  }

  return {
    entry,
    score,
    matchedFields: Array.from(matchedFields),
  };
}

/**
 * Apply sorting and limit to search results
 */
function applyLimitAndSort(
  results: SearchResult[],
  options: MemorySearchOptions
): SearchResult[] {
  // Sort
  const sort = options.sort ?? "relevance";
  switch (sort) {
    case "relevance":
      results.sort((a, b) => b.score - a.score);
      break;
    case "newest":
      results.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
      break;
    case "oldest":
      results.sort((a, b) => a.entry.createdAt.localeCompare(b.entry.createdAt));
      break;
  }

  // Limit
  if (options.limit && options.limit > 0) {
    return results.slice(0, options.limit);
  }

  return results;
}
