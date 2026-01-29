/**
 * Context Detector
 *
 * Keyword-based heuristics for detecting what context types
 * are relevant for a given prompt.
 */

import type { ContextType, ContextHints } from "./types";

// Keyword to context type mapping
const KEYWORD_PATTERNS: Record<string, ContextType[]> = {
  // Architecture & Structure
  architecture: ["project-structure", "config-files", "readme"],
  structure: ["project-structure", "config-files"],
  refactor: ["project-structure", "related-files", "test-patterns"],

  // Implementation
  implement: ["related-files", "config-files", "test-patterns"],
  "add feature": ["related-files", "project-structure"],
  create: ["project-structure", "config-files"],

  // Debugging
  bug: ["related-files", "git-status", "recent-changes"],
  fix: ["related-files", "test-patterns"],
  error: ["related-files", "config-files"],

  // Testing
  test: ["test-patterns", "related-files"],
  spec: ["test-patterns", "related-files"],

  // Dependencies
  dependency: ["package-info"],
  package: ["package-info", "config-files"],
  install: ["package-info"],

  // API
  api: ["api-schema", "related-files"],
  endpoint: ["api-schema", "related-files"],
  schema: ["api-schema", "config-files"],

  // Git/Version
  commit: ["git-status", "recent-changes"],
  branch: ["git-status"],
  merge: ["git-status", "recent-changes"],
};

export function detectContextNeeds(
  prompt: string,
  hints?: ContextHints
): ContextType[] {
  const detected = new Set<ContextType>();
  const lowerPrompt = prompt.toLowerCase();

  // Keyword matching
  for (const [keyword, contexts] of Object.entries(KEYWORD_PATTERNS)) {
    if (lowerPrompt.includes(keyword)) {
      contexts.forEach((c) => detected.add(c));
    }
  }

  // User-provided keywords override
  if (hints?.keywords) {
    for (const keyword of hints.keywords) {
      const keywordLower = keyword.toLowerCase();
      for (const [pattern, contexts] of Object.entries(KEYWORD_PATTERNS)) {
        if (keywordLower.includes(pattern) || pattern.includes(keywordLower)) {
          contexts.forEach((c) => detected.add(c));
        }
      }
    }
  }

  // File pattern detection
  if (hints?.filePatterns?.length) {
    detected.add("related-files");
  }

  // Remove excluded contexts
  if (hints?.exclude) {
    hints.exclude.forEach((c) => detected.delete(c));
  }

  // Default fallback - always include minimal context
  if (detected.size === 0) {
    detected.add("project-structure");
  }

  return Array.from(detected);
}
