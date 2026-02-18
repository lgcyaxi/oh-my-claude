/**
 * MCP segment - shows background task status
 * Refactored from formatter.ts to work as a segment
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { SEMANTIC_COLORS } from "./index";

// Spinner animation frames
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = 80; // ms per frame

// ANSI Color codes for task types
const TASK_COLORS = {
  mcp: "\x1b[36m", // Cyan for MCP agents
  task: "\x1b[33m", // Yellow for Task agents
  fallback: "\x1b[31m", // Red for fallback
  reset: "\x1b[0m",
} as const;

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
  kimi: "KM",
};

// Model name abbreviations
const MODEL_ABBREV: Record<string, string> = {
  sonnet: "S",
  opus: "O",
  haiku: "H",
  "deepseek-reasoner": "R",
  "deepseek-chat": "C",
  "GLM-5": "G5",
  "glm-4v-flash": "V",
  "minimax-m2.5": "M2",
  "k2.5": "K2",
};

interface ActiveTask {
  agent: string;
  startedAt: number;
  mode?: "mcp" | "fallback";
  model?: string;
  provider?: string;
  prompt?: string;
}

interface ConcurrencyInfo {
  active: number;
  limit: number;
  queued: number;
}

interface StatusFileData {
  activeTasks: ActiveTask[];
  concurrency?: ConcurrencyInfo;
  updatedAt: string;
}

/**
 * Get current spinner frame based on elapsed time
 */
function getSpinnerFrame(startedAt: number): string {
  const elapsed = Date.now() - startedAt;
  const frameIndex = Math.floor(elapsed / SPINNER_INTERVAL) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[frameIndex] ?? "⠋";
}

/**
 * Format duration in seconds to compact string
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
 */
function getAgentAbbrev(agent: string): string {
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
 * Get abbreviated model name
 */
function getModelAbbrev(model: string): string {
  const lower = model.toLowerCase();
  return MODEL_ABBREV[lower] || model.slice(0, 2).toUpperCase();
}

/**
 * Format a single task with spinner and info
 */
function formatTask(task: ActiveTask, useColors: boolean): string {
  const spinner = getSpinnerFrame(task.startedAt);
  const durationSec = Math.floor((Date.now() - task.startedAt) / 1000);
  const duration = formatDuration(durationSec);
  const agentName = getAgentAbbrev(task.agent);

  // Determine color based on agent type and mode
  let color: string = TASK_COLORS.mcp;
  if (task.mode === "fallback") {
    color = TASK_COLORS.fallback;
  } else if (task.agent.startsWith("@")) {
    color = TASK_COLORS.task;
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

  const agentDisplay = useColors
    ? `${color}${agentName}${TASK_COLORS.reset}`
    : agentName;

  return `${spinner} ${agentDisplay}: ${duration}${infoSuffix}`;
}

/**
 * Read status data from session directory
 */
function readStatusData(sessionDir: string): StatusFileData | null {
  try {
    const statusPath = join(sessionDir, "status.json");
    if (!existsSync(statusPath)) {
      return null;
    }

    const content = readFileSync(statusPath, "utf-8");
    const data = JSON.parse(content) as StatusFileData;

    // Check staleness (5 minutes)
    const updatedAt = new Date(data.updatedAt).getTime();
    if (Date.now() - updatedAt > 5 * 60 * 1000) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Collect MCP task information
 */
async function collectMcpData(context: SegmentContext): Promise<SegmentData | null> {
  const { sessionDir } = context;

  if (!sessionDir) {
    return null;
  }

  const data = readStatusData(sessionDir);
  if (!data || data.activeTasks.length === 0) {
    return null;
  }

  // Count by type for metadata
  const mcpCount = data.activeTasks.filter((t) => !t.agent.startsWith("@")).length;
  const taskCount = data.activeTasks.filter((t) => t.agent.startsWith("@")).length;

  // Determine color based on status
  let color: SegmentData["color"] = "neutral";
  if (data.concurrency && data.concurrency.queued > 0) {
    color = "warning"; // Tasks are queued
  }
  if (data.activeTasks.some((t) => t.mode === "fallback")) {
    color = "critical"; // Fallback mode
  }

  return {
    primary: String(data.activeTasks.length),
    secondary: data.concurrency
      ? `${data.concurrency.active}/${data.concurrency.limit}`
      : undefined,
    metadata: {
      mcpCount: String(mcpCount),
      taskCount: String(taskCount),
      tasks: JSON.stringify(data.activeTasks),
      concurrency: data.concurrency ? JSON.stringify(data.concurrency) : "",
      newLine: "true",
    },
    color,
  };
}

/**
 * Format MCP segment for display
 * This produces the full task display with spinners
 */
function formatMcpSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const tasks: ActiveTask[] = JSON.parse(data.metadata.tasks || "[]");
  const concurrency: ConcurrencyInfo | null = data.metadata.concurrency
    ? JSON.parse(data.metadata.concurrency)
    : null;

  if (tasks.length === 0) {
    return "";
  }

  const parts: string[] = [];

  // Format up to 3 tasks
  const tasksToShow = tasks.slice(0, 3);
  for (const task of tasksToShow) {
    parts.push(`[${formatTask(task, style.colors)}]`);
  }

  // Overflow indicator
  if (tasks.length > 3) {
    parts.push(`+${tasks.length - 3}`);
  }

  // Concurrency info
  if (concurrency) {
    if (concurrency.queued > 0) {
      parts.push(`(${concurrency.active}/${concurrency.limit} +${concurrency.queued}q)`);
    } else {
      parts.push(`(${concurrency.active}/${concurrency.limit})`);
    }
  }

  return parts.join(" ");
}

export const mcpSegment: Segment = {
  id: "mcp",
  collect: collectMcpData,
  format: formatMcpSegment,
};
