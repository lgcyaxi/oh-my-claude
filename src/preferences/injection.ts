/**
 * Preference Injection Engine
 *
 * Context-aware engine that determines WHICH preferences to inject into
 * the current session based on task category detection and keyword matching.
 *
 * Workflow:
 *   1. analyzeTaskCategory(prompt) → detect task type with confidence
 *   2. buildPreferenceContext(prompt, category?) → build matching context
 *   3. injectPreferences(context) → find & score matching preferences
 *   4. formatPreferenceInjection(matches) → format for hook injection
 *
 * Designed to be called from UserPromptSubmit or PreToolUse hooks.
 */

import type { PreferenceContext, PreferenceMatch } from "./types";
import { PreferenceStore } from "./store";

// ---- Task Category Detection ----

/**
 * Supported task categories for preference matching.
 */
export type TaskCategory =
  | "git"
  | "testing"
  | "refactoring"
  | "coding"
  | "docs"
  | "debugging";

/**
 * Result of task category analysis.
 */
export interface CategoryAnalysis {
  /** Detected category (null if confidence too low) */
  category: TaskCategory | null;
  /** Confidence score 0-1 */
  confidence: number;
  /** All categories with their scores, sorted descending */
  scores: Array<{ category: TaskCategory; score: number }>;
}

/**
 * Keyword-to-weight map for each category.
 * Higher weight = stronger signal for that category.
 */
const CATEGORY_KEYWORDS: Record<TaskCategory, Record<string, number>> = {
  git: {
    commit: 1.0,
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
    "co-author": 1.0,
    "git": 0.8,
    "pr": 0.7,
    "pull request": 0.8,
  },
  testing: {
    test: 1.0,
    tests: 1.0,
    spec: 0.8,
    "unit test": 1.0,
    "integration test": 1.0,
    "e2e": 0.9,
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
    tdd: 0.9,
  },
  refactoring: {
    refactor: 1.0,
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
    consolidate: 0.7,
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
    develop: 0.7,
  },
  docs: {
    document: 0.9,
    documentation: 1.0,
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
    docstring: 0.9,
  },
  debugging: {
    debug: 1.0,
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
    regression: 0.8,
  },
};

/** Minimum confidence threshold for category detection */
const MIN_CONFIDENCE = 0.15;

/**
 * Analyze a user prompt to detect the most likely task category.
 *
 * Uses weighted keyword matching: each category has keywords with
 * individual weights. The category score is the sum of matched keyword
 * weights normalized by the max possible score for that category.
 *
 * @param prompt - The user's prompt text
 * @returns CategoryAnalysis with detected category and confidence
 */
export function analyzeTaskCategory(prompt: string): CategoryAnalysis {
  if (!prompt || prompt.trim().length === 0) {
    return { category: null, confidence: 0, scores: [] };
  }

  const promptLower = prompt.toLowerCase();
  const scores: Array<{ category: TaskCategory; score: number }> = [];

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [TaskCategory, Record<string, number>]
  >) {
    let matchedWeight = 0;
    let maxWeight = 0;

    for (const [keyword, weight] of Object.entries(keywords)) {
      maxWeight += weight;

      if (keyword.includes(" ")) {
        if (promptLower.includes(keyword)) {
          matchedWeight += weight;
        }
      } else {
        // Word boundary match — "test" shouldn't match "contest"
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
    scores,
  };
}

// ---- Context Building ----

/** Common stop words to exclude from keyword extraction */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "its", "our", "their",
  "this", "that", "these", "those", "what", "which", "who", "whom",
  "where", "when", "how", "why", "all", "each", "every", "both",
  "few", "more", "most", "other", "some", "such", "no", "not",
  "only", "same", "so", "than", "too", "very", "just", "but",
  "and", "or", "if", "then", "else", "for", "from", "in", "into",
  "on", "of", "to", "with", "about", "at", "by", "as", "up", "out",
  "off", "over", "after", "before", "between", "under", "again",
  "please", "make", "sure", "let", "want", "also", "like",
]);

/**
 * Extract meaningful keywords from a prompt for preference matching.
 *
 * Filters out stop words, short tokens, and noise. Returns unique
 * lowercase keywords sorted by length (longer = more specific).
 *
 * @param prompt - The user's prompt text
 * @returns Array of extracted keywords
 */
export function extractKeywords(prompt: string): string[] {
  if (!prompt || prompt.trim().length === 0) return [];

  const tokens = prompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const keywords = new Set<string>();

  for (const token of tokens) {
    if (STOP_WORDS.has(token) || token.length < 3) continue;
    if (/^\d+$/.test(token)) continue;
    keywords.add(token);
  }

  return [...keywords].sort((a, b) => b.length - a.length);
}

/**
 * Build a PreferenceContext from a user prompt and optional category override.
 *
 * This is the primary entry point for constructing the context object
 * that drives preference matching. It:
 *   1. Extracts keywords from the prompt
 *   2. Detects the task category (unless overridden)
 *   3. Returns a PreferenceContext ready for store.match()
 *
 * @param prompt - The user's prompt text
 * @param category - Optional category override (skips detection)
 * @returns PreferenceContext for matching
 */
export function buildPreferenceContext(
  prompt: string,
  category?: string,
): PreferenceContext {
  const keywords = extractKeywords(prompt);

  let detectedCategory = category;
  if (!detectedCategory) {
    const analysis = analyzeTaskCategory(prompt);
    detectedCategory = analysis.category ?? undefined;
  }

  return {
    prompt,
    category: detectedCategory,
    keywords,
  };
}

// ---- Preference Injection ----

/**
 * Find all preferences matching the current context.
 *
 * Creates a PreferenceStore instance and delegates to its match() method.
 * Returns matches sorted by score (highest first).
 *
 * @param context - PreferenceContext from buildPreferenceContext()
 * @param projectRoot - Optional project root for scoped preferences
 * @returns Sorted array of PreferenceMatch
 */
export function injectPreferences(
  context: PreferenceContext,
  projectRoot?: string,
): PreferenceMatch[] {
  const store = new PreferenceStore(projectRoot);
  return store.match(context);
}

// ---- Formatting ----

/**
 * Format matched preferences for injection into Claude's context.
 *
 * Produces a compact, structured block suitable for additionalContext
 * in UserPromptSubmit hooks. Format:
 *
 *   [Preferences Active]
 *   - Title (matched: keyword1, keyword2)
 *   - Title (always active)
 *
 *   [Preference Details]
 *   > Title: Content
 *
 * @param matches - Array of PreferenceMatch from injectPreferences()
 * @returns Formatted string, or empty string if no matches
 */
export function formatPreferenceInjection(matches: PreferenceMatch[]): string {
  if (!matches || matches.length === 0) return "";

  const lines: string[] = [];

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

  return lines.join("\n");
}

/**
 * Format the match reason for display.
 *
 * @param match - A single PreferenceMatch
 * @returns Human-readable match reason string
 */
function formatMatchReason(match: PreferenceMatch): string {
  switch (match.matchedBy) {
    case "always":
      return "always active";
    case "keyword":
      return `matched: ${match.matchedTerms?.join(", ") ?? "keyword"}`;
    case "category":
      return `category: ${match.matchedTerms?.join(", ") ?? "detected"}`;
    default:
      return "matched";
  }
}

// ---- Utilities ----

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
