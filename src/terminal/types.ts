/**
 * Unique identifier for a terminal pane.
 */
export type PaneId = string;

/**
 * Supported terminal backend names.
 */
export type TerminalBackendName = "tmux" | "wezterm" | "windows-terminal";

/**
 * Options for controlling how a new pane is created.
 */
export interface PaneCreateOptions {
  /**
   * Split direction:
   * - "h" = horizontal split (creates a left/right layout)
   * - "v" = vertical split (creates a top/bottom layout)
   * - undefined = default behavior (new window when inside session, split otherwise)
   */
  split?: "h" | "v";

  /**
   * Target pane to split from. When provided, the new pane is created
   * by splitting the target pane rather than the active pane.
   * Use this to stack multiple AIs on the right side of the screen.
   */
  targetPane?: PaneId;

  /**
   * Percentage of the split that the new pane should occupy (1-99).
   * Default: 50 (equal split).
   */
  splitPercent?: number;

  /**
   * Working directory for the new pane.
   * If not provided, the pane inherits the terminal's default cwd.
   */
  cwd?: string;
}

/**
 * Canonical pane metadata exposed by terminal backends.
 */
export interface PaneInfo {
  /** Runtime pane identifier from the terminal backend. */
  id: PaneId;
  /** Human-readable pane name. */
  name: string;
  /** Startup command used when the pane was created. */
  command: string;
  /** Creation timestamp tracked by the backend. */
  createdAt: Date;
}
