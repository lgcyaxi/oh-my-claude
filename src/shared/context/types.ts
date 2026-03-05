/**
 * Context System Types
 *
 * Type definitions for the smart context system that automatically
 * detects and gathers relevant project context for MCP background agents.
 */

export type ContextType =
  | "project-structure" // Directory tree
  | "package-info" // package.json, dependencies
  | "git-status" // Current branch, changes
  | "related-files" // Files matching keywords
  | "config-files" // tsconfig, eslint, etc.
  | "test-patterns" // Test file conventions
  | "api-schema" // OpenAPI, GraphQL schemas
  | "readme" // Project README
  | "recent-changes"; // Recent git commits

export interface ContextItem {
  type: ContextType;
  content: string;
  source: string; // File path or source description
  tokenEstimate: number; // Rough token count
}

export interface ContextProfile {
  agentName: string;
  defaultContexts: ContextType[];
  maxTokens: number; // Budget for context
  priorities: ContextType[]; // Order of importance
}

export interface ContextHints {
  keywords?: string[]; // User-provided keywords
  filePatterns?: string[]; // Specific file patterns to include
  exclude?: ContextType[]; // Contexts to skip
}

export interface GatheredContext {
  items: ContextItem[];
  totalTokens: number;
  truncated: boolean; // If some context was cut for budget
}
