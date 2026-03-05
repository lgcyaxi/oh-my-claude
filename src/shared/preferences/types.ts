/**
 * Preference System Type Definitions
 *
 * Defines the core types for oh-my-claude's preference system.
 * Preferences are "always do X" or "never do Y" rules that get
 * auto-injected into relevant sessions.
 *
 * Hybrid storage: JSON file for fast ID lookups, SQLite for complex queries.
 */

/**
 * Preference storage scope
 * - project: .claude/preferences.json under project root
 * - global: ~/.claude/oh-my-claude/preferences.json
 */
export type PreferenceScope = "global" | "project";

/**
 * Trigger configuration for when a preference should be auto-injected.
 * A preference matches if ANY trigger condition is satisfied.
 */
export interface PreferenceTrigger {
  /** Keywords that activate this preference (matched against user prompt) */
  keywords?: string[];
  /** Categories that activate this preference (matched against task category) */
  categories?: string[];
  /** If true, always inject this preference regardless of context */
  always?: boolean;
}

/**
 * Core preference entry
 */
export interface Preference {
  /** Unique identifier (format: pref-YYYYMMDD-slug) */
  id: string;
  /** Display title (e.g., "Never use co-author in commits") */
  title: string;
  /** Rule content (e.g., "Always commit without co-author") */
  content: string;
  /** Storage scope */
  scope: PreferenceScope;
  /** Whether to auto-inject into matching sessions */
  autoInject: boolean;
  /** Trigger configuration for auto-injection */
  trigger: PreferenceTrigger;
  /** Tags for categorization and search */
  tags: string[];
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
}

/**
 * Result of matching a preference to the current context
 */
export interface PreferenceMatch {
  /** The matched preference */
  preference: Preference;
  /** Relevance score (0-1, higher is more relevant) */
  score: number;
  /** How the preference was matched */
  matchedBy: "keyword" | "category" | "always";
  /** Specific terms that triggered the match (for keyword/category matches) */
  matchedTerms?: string[];
}

/**
 * Context used for matching preferences against the current session
 */
export interface PreferenceContext {
  /** Current user prompt or message */
  prompt?: string;
  /** Current task category (e.g., "git", "testing", "refactoring") */
  category?: string;
  /** Additional keywords from the current context */
  keywords?: string[];
}

/**
 * Input for creating a new preference
 */
export interface CreatePreferenceInput {
  /** Rule title */
  title: string;
  /** Rule content */
  content: string;
  /** Storage scope (default: global) */
  scope?: PreferenceScope;
  /** Whether to auto-inject (default: true) */
  autoInject?: boolean;
  /** Trigger configuration */
  trigger?: PreferenceTrigger;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Options for listing preferences
 */
export interface PreferenceListOptions {
  /** Filter by scope */
  scope?: PreferenceScope;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by auto-inject status */
  autoInject?: boolean;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Preference store statistics
 */
export interface PreferenceStats {
  /** Total preference count */
  total: number;
  /** Count by scope */
  byScope: Record<PreferenceScope, number>;
  /** Count of auto-injectable preferences */
  autoInjectCount: number;
  /** Global storage path */
  globalPath: string;
  /** Project storage path (if in a git repo) */
  projectPath?: string;
  /** Whether SQLite index is available */
  sqliteAvailable: boolean;
}

/**
 * Result of a preference operation
 */
export interface PreferenceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Hybrid storage interface for the preference system.
 * JSON file provides fast lookups by ID.
 * SQLite table enables complex queries (trigger matching, category filtering).
 */
export interface PreferenceStorage {
  /** Create a new preference */
  create(input: CreatePreferenceInput): PreferenceResult<Preference>;
  /** Get a preference by ID */
  get(id: string): PreferenceResult<Preference>;
  /** Update an existing preference */
  update(
    id: string,
    updates: Partial<Pick<Preference, "title" | "content" | "autoInject" | "trigger" | "tags">>,
  ): PreferenceResult<Preference>;
  /** Delete a preference by ID */
  delete(id: string): PreferenceResult;
  /** List preferences with optional filtering */
  list(options?: PreferenceListOptions): Preference[];
  /** Find preferences matching the current context */
  match(context: PreferenceContext): PreferenceMatch[];
  /** Get store statistics */
  stats(): PreferenceStats;
}

/**
 * JSON file structure for preferences.json
 * Maps preference ID -> Preference entry
 */
export type PreferenceJsonStore = Record<string, Preference>;
