/**
 * StatusLine Formatter
 *
 * Formats task and provider data into a compact status line string
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
  // Provider capacity
  full: "\x1b[32m", // Green (available)
  partial: "\x1b[33m", // Yellow (some used)
  busy: "\x1b[31m", // Red (near limit)
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
  model?: string; // Model being used (sonnet, opus, haiku) for Task agents
  provider?: string; // Provider name (deepseek, zhipu, minimax) for MCP agents
}

export interface ProviderStatus {
  active: number;
  limit: number;
}

export interface StatusLineData {
  activeTasks: ActiveTask[];
  providers: Record<string, ProviderStatus>;
  updatedAt: string;
}

// Agent name abbreviations for compact display (MCP agents)
const AGENT_ABBREV: Record<string, string> = {
  oracle: "Oracle",
  librarian: "Lib",
  explore: "Exp",
  "frontend-ui-ux": "UI",
  "document-writer": "Doc",
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
  "claude-sonnet-4-5": "S",
  "claude-opus-4-5": "O",
  "claude-haiku-4-5": "H",
};

/**
 * Get abbreviated model name
 */
function getModelAbbrev(model: string): string {
  return MODEL_ABBREV[model.toLowerCase()] || model.slice(0, 1).toUpperCase();
}

/**
 * Format a single task with spinner and colors
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

  // Include model info for Task tool agents, or provider info for MCP agents
  let infoSuffix = "";
  if (task.model) {
    // Task tool agents show model (S/O/H)
    infoSuffix = ` (${getModelAbbrev(task.model)})`;
  } else if (task.provider) {
    // MCP agents show provider (DS/ZP/MM)
    infoSuffix = ` (${getProviderAbbrev(task.provider)})`;
  }

  return `[${spinner} ${colorize(agentName, color)}: ${duration}${infoSuffix}]`;
}

/**
 * Format provider capacity with color based on availability
 */
function formatProviderCapacity(abbrev: string, status: ProviderStatus): string {
  const available = status.limit - status.active;
  const ratio = status.limit > 0 ? available / status.limit : 0;

  let color: string;
  if (ratio >= 0.7) {
    color = colors.full; // 70%+ available = green
  } else if (ratio >= 0.3) {
    color = colors.partial; // 30-70% = yellow
  } else {
    color = colors.busy; // <30% = red
  }

  return `${abbrev}: ${colorize(String(available), color)}`;
}

/**
 * Format the status line data into a compact string
 *
 * Output format examples:
 * - No tasks: "omc"
 * - With tasks: "omc [⠙ Oracle: 32s] [⠹ Lib: 12s] | DS: 9 ZP: 10"
 * - Tasks only: "omc [⠙ Oracle: 32s]"
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

  // Format provider concurrency with colors (show available capacity)
  const providerParts: string[] = [];
  const providersToShow = ["deepseek", "zhipu", "minimax"];

  for (const provider of providersToShow) {
    const status = data.providers[provider];
    if (status && (status.active > 0 || data.activeTasks.length > 0)) {
      const abbrev = getProviderAbbrev(provider);
      providerParts.push(formatProviderCapacity(abbrev, status));
    }
  }

  if (providerParts.length > 0) {
    parts.push("|");
    parts.push(...providerParts);
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
 * Format idle status line with provider info
 * Shows availability even when no tasks are running
 * Output: "omc ● ready | DS: 10 ZP: 10 MM: 5" (with colors)
 */
export function formatIdleStatusLine(providers: Record<string, ProviderStatus>): string {
  const readyIndicator = colorize("●", colors.ready);
  const parts: string[] = [`omc ${readyIndicator} ready`];

  // Show provider availability with colors
  const providerParts: string[] = [];
  const providersToShow = ["deepseek", "zhipu", "minimax"];

  for (const provider of providersToShow) {
    const status = providers[provider];
    if (status && status.limit > 0) {
      const abbrev = getProviderAbbrev(provider);
      // For idle state, show full capacity in green
      providerParts.push(`${abbrev}: ${colorize(String(status.limit), colors.full)}`);
    }
  }

  if (providerParts.length > 0) {
    parts.push("|");
    parts.push(...providerParts);
  }

  return parts.join(" ");
}
