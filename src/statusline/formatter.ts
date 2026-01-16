/**
 * StatusLine Formatter
 *
 * Formats task and provider data into a compact status line string
 * for display in Claude Code's statusLine feature.
 */

export interface ActiveTask {
  agent: string;
  startedAt: number;
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

/**
 * Format the status line data into a compact string
 *
 * Output format examples:
 * - No tasks: "omc"
 * - With tasks: "omc [Oracle: 32s] [Lib: 12s] | DS: 2/10 ZP: 1/10"
 * - Tasks only: "omc [Oracle: 32s]"
 */
export function formatStatusLine(data: StatusLineData): string {
  const parts: string[] = ["omc"];
  const now = Date.now();

  // Format active tasks
  if (data.activeTasks.length > 0) {
    // Limit to 3 tasks max for readability
    const tasksToShow = data.activeTasks.slice(0, 3);

    for (const task of tasksToShow) {
      const durationSec = Math.floor((now - task.startedAt) / 1000);
      const agentName = getAgentAbbrev(task.agent);
      const duration = formatDuration(durationSec);
      parts.push(`[${agentName}: ${duration}]`);
    }

    if (data.activeTasks.length > 3) {
      parts.push(`+${data.activeTasks.length - 3}`);
    }
  }

  // Format provider concurrency (only show non-zero or if there are active tasks)
  const providerParts: string[] = [];
  const providersToShow = ["deepseek", "zhipu", "minimax"];

  for (const provider of providersToShow) {
    const status = data.providers[provider];
    if (status && (status.active > 0 || data.activeTasks.length > 0)) {
      const abbrev = getProviderAbbrev(provider);
      providerParts.push(`${abbrev}: ${status.active}/${status.limit}`);
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
 * Shows "omc ready" to indicate the system is available
 */
export function formatEmptyStatusLine(): string {
  return "omc ready";
}

/**
 * Format idle status line with provider info
 * Shows availability even when no tasks are running
 */
export function formatIdleStatusLine(providers: Record<string, ProviderStatus>): string {
  const parts: string[] = ["omc ready"];

  // Show provider availability
  const providerParts: string[] = [];
  const providersToShow = ["deepseek", "zhipu", "minimax"];

  for (const provider of providersToShow) {
    const status = providers[provider];
    if (status && status.limit > 0) {
      const abbrev = getProviderAbbrev(provider);
      providerParts.push(`${abbrev}: ${status.limit}`);
    }
  }

  if (providerParts.length > 0) {
    parts.push("|");
    parts.push(...providerParts);
  }

  return parts.join(" ");
}
