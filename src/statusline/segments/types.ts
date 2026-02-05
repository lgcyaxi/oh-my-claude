/**
 * Segment types for oh-my-claude statusline
 * Segment-based architecture with toggleable segments
 */

// Segment identifiers
export type SegmentId =
  | "model"
  | "git"
  | "directory"
  | "context"
  | "session"
  | "output-style"
  | "mcp"
  | "memory"
  | "proxy";

// Semantic colors for status indication
export type SemanticColor = "good" | "warning" | "critical" | "neutral";

// Data returned by a segment's collect function
export interface SegmentData {
  primary: string;
  secondary?: string;
  metadata: Record<string, string>;
  color?: SemanticColor;
}

// Context passed to segment collect functions
export interface SegmentContext {
  cwd: string;
  sessionDir: string;
  // Data from Claude Code stdin (when available)
  claudeCodeInput?: ClaudeCodeInput;
}

// Partial Claude Code stdin data we care about
export interface ClaudeCodeInput {
  model?: {
    id?: string;
    display_name?: string;
  };
  output_style?: {
    name?: string;
  };
  // Transcript path for context/token parsing
  transcript_path?: string;
  // Cost/usage data from Claude Code
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_api_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  // Workspace info
  workspace?: {
    current_dir?: string;
  };
  // OAuth config for API calls (if available)
  oauth?: {
    api_base_url?: string;
    access_token?: string;
  };
}

// Per-segment configuration
export interface SegmentConfig {
  enabled: boolean;
  position: number;
}

// Style configuration
export interface StyleConfig {
  separator: string;
  brackets: boolean;
  colors: boolean;
}

// Full statusline configuration
export interface StatusLineConfig {
  enabled: boolean;
  preset: "minimal" | "standard" | "full";
  segments: Record<SegmentId, SegmentConfig>;
  style: StyleConfig;
}

// Segment interface - all segments must implement this
export interface Segment {
  id: SegmentId;
  collect(context: SegmentContext): Promise<SegmentData | null>;
  format(data: SegmentData, config: SegmentConfig, style: StyleConfig): string;
}

// Preset definitions
export const PRESETS: Record<StatusLineConfig["preset"], SegmentId[]> = {
  minimal: ["git", "directory"],
  standard: ["model", "git", "directory", "context", "session", "mcp", "proxy"],
  full: ["model", "git", "directory", "context", "session", "output-style", "mcp", "memory", "proxy"],
};

// Default segment positions
export const DEFAULT_SEGMENT_POSITIONS: Record<SegmentId, number> = {
  model: 1,
  git: 2,
  directory: 3,
  context: 4,
  session: 5,
  "output-style": 6,
  mcp: 7,
  memory: 8,
  proxy: 9,
};
