/**
 * StatusLine Formatter
 *
 * Formats task data into a compact status line string
 * for display in Claude Code's statusLine feature.
 *
 * Features:
 * - ANSI color support for visual distinction
 * - Spinner animation for active tasks
 * - Mode tracking (MCP vs fallback)
 */

// ANSI Color codes
const colors = {
  reset: "\x1b[0m",
  // Agent types
  mcp: "\x1b[36m", // Cyan for MCP agents
  task: "\x1b[33m", // Yellow for Task agents
  fallback: "\x1b[31m", // Red for fallback
  // Status
  ready: "\x1b[32m", // Green for ready
  active: "\x1b[33m", // Yellow for active
};

/**
 * Apply ANSI color to text
 */
function colorize(text: string, color: string): string {
  return `${color}${text}${colors.reset}`;
}

// Spinner animation frames
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = 80; // ms per frame

/**
 * Get current spinner frame based on elapsed time
 */
function getSpinnerFrame(startedAt: number): string {
  const elapsed = Date.now() - startedAt;
  const frameIndex = Math.floor(elapsed / SPINNER_INTERVAL) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[frameIndex] ?? "⠋";
}

export interface ActiveTask {
  agent: string;
  startedAt: number;
  mode?: "mcp" | "fallback"; // Track execution mode
  model?: string; // Model being used
  provider?: string; // Provider name (deepseek, zhipu, minimax)
  prompt?: string; // Truncated prompt for preview
}

export interface ConcurrencyInfo {
  active: number;
  limit: number;
  queued: number;
}

export interface StatusLineData {
  activeTasks: ActiveTask[];
  concurrency?: ConcurrencyInfo;
  updatedAt: string;
}

// Agent name abbreviations for compact display (MCP agents)
const AGENT_ABBREV: Record<string, string> = {
  oracle: "Oracle",
  analyst: "Analyst",
  librarian: "Lib",
  "frontend-ui-ux": "UI",
  "document-writer": "Doc",
  prometheus: "Prom",
};

// Task tool agent abbreviations (Claude-subscription agents)
const TASK_AGENT_ABBREV: Record<string, string> = {
  Scout: "Scout",
  Planner: "Plan",
  General: "Gen",
  Guide: "Guide",
  Bash: "Bash",
};

// Provider name abbreviations
const PROVIDER_ABBREV: Record<string, string> = {
  deepseek: "DS",
  zhipu: "ZP",
  minimax: "MM",
  openrouter: "OR",
};

/**
 * Format duration in seconds to compact string
 * e.g., 45 -> "45s", 125 -> "2m"
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

/**
 * Get abbreviated agent name
 * Handles both MCP agents and Task tool agents (prefixed with @)
 */
function getAgentAbbrev(agent: string): string {
  // Task tool agents are prefixed with @
  if (agent.startsWith("@")) {
    const taskAgent = agent.slice(1);
    return `@${TASK_AGENT_ABBREV[taskAgent] || taskAgent.slice(0, 4)}`;
  }
  return AGENT_ABBREV[agent.toLowerCase()] || agent.slice(0, 4);
}

/**
 * Get abbreviated provider name
 */
function getProviderAbbrev(provider: string): string {
  return PROVIDER_ABBREV[provider.toLowerCase()] || provider.slice(0, 2).toUpperCase();
}

// Model name abbreviations for compact display
const MODEL_ABBREV: Record<string, string> = {
  sonnet: "S",
  opus: "O",
  haiku: "H",
  "claude-sonnet-4.5": "S",
  "claude-opus-4.5": "O",
  "claude-haiku-4.5": "H",
  // DeepSeek models
  "deepseek-reasoner": "R",
  "deepseek-chat": "C",
  // ZhiPu models
  "glm-4.7": "G4",
  "glm-4v-flash": "V",
  // MiniMax models
  "minimax-m2.1": "M2",
};

/**
 * Get abbreviated model name
 */
function getModelAbbrev(model: string): string {
  const lower = model.toLowerCase();
  return MODEL_ABBREV[lower] || model.slice(0, 2).toUpperCase();
}

/**
 * Truncate prompt for display (max 30 chars)
 */
function truncatePrompt(prompt: string, maxLen: number = 30): string {
  if (!prompt) return "";
  // Clean up whitespace and newlines
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + "...";
}

/**
 * Format a single task with spinner, colors, and rich info
 */
function formatTask(task: ActiveTask): string {
  const spinner = getSpinnerFrame(task.startedAt);
  const durationSec = Math.floor((Date.now() - task.startedAt) / 1000);
  const duration = formatDuration(durationSec);
  const agentName = getAgentAbbrev(task.agent);

  // Determine color based on agent type and mode
  let color: string;
  if (task.mode === "fallback") {
    color = colors.fallback;
  } else if (task.agent.startsWith("@")) {
    // Task tool agents (Claude subscription)
    color = colors.task;
  } else {
    // MCP agents (external providers)
    color = colors.mcp;
  }

  // Build info suffix: provider/model
  let infoSuffix = "";
  if (task.provider && task.model) {
    infoSuffix = ` ${getProviderAbbrev(task.provider)}/${getModelAbbrev(task.model)}`;
  } else if (task.provider) {
    infoSuffix = ` ${getProviderAbbrev(task.provider)}`;
  } else if (task.model) {
    infoSuffix = ` ${getModelAbbrev(task.model)}`;
  }

  // Build prompt preview
  const promptPreview = task.prompt ? ` "${truncatePrompt(task.prompt)}"` : "";

  return `[${spinner} ${colorize(agentName, color)}: ${duration}${infoSuffix}]${promptPreview}`;
}

/**
 * Format concurrency info for display
 * e.g., "(2/10)" or "(2/10 +3q)" if there are queued tasks
 */
function formatConcurrency(concurrency: ConcurrencyInfo): string {
  if (concurrency.queued > 0) {
    return `(${concurrency.active}/${concurrency.limit} +${concurrency.queued}q)`;
  }
  return `(${concurrency.active}/${concurrency.limit})`;
}

/**
 * Format the status line data into a compact string
 *
 * Output format examples:
 * - No tasks: "omc ● ready (0/10)"
 * - With tasks: "omc [⠙ Oracle: 32s DS/R] "Analyze..." (2/10)"
 * - With queue: "omc [⠙ Oracle: 32s DS/R] (5/5 +2q)"
 */
export function formatStatusLine(data: StatusLineData): string {
  const parts: string[] = ["omc"];

  // Format active tasks with spinners and colors
  if (data.activeTasks.length > 0) {
    // Limit to 3 tasks max for readability
    const tasksToShow = data.activeTasks.slice(0, 3);

    for (const task of tasksToShow) {
      parts.push(formatTask(task));
    }

    if (data.activeTasks.length > 3) {
      parts.push(`+${data.activeTasks.length - 3}`);
    }
  }

  // Add concurrency info if available
  if (data.concurrency) {
    parts.push(formatConcurrency(data.concurrency));
  }

  return parts.join(" ");
}

/**
 * Format a minimal status line when no data is available
 * Shows "omc ● ready" with green indicator
 */
export function formatEmptyStatusLine(): string {
  const readyIndicator = colorize("●", colors.ready);
  return `omc ${readyIndicator} ready`;
}

/**
 * Format idle status line
 * Shows "omc ● ready" with green indicator
 */
export function formatIdleStatusLine(): string {
  return formatEmptyStatusLine();
}
