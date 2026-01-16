#!/usr/bin/env node
/**
 * Task Tracker Hook (PreToolUse & PostToolUse)
 *
 * Tracks Claude Code's Task tool invocations to monitor
 * Claude-subscription agents (Sisyphus, Claude-Reviewer, Claude-Scout).
 *
 * Since Task tool runs as subprocesses, we track:
 * - PreToolUse: When a Task is about to launch
 * - PostToolUse: When a Task completes
 *
 * Updates the shared status file for statusline display.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

interface ToolUseInput {
  tool: string;
  tool_input?: {
    subagent_type?: string;
    description?: string;
    prompt?: string;
  };
  tool_output?: string;
}

interface HookResponse {
  decision: "approve";
  hookSpecificOutput?: {
    hookEventName: "PreToolUse" | "PostToolUse";
    additionalContext?: string;
  };
}

// Status file path (shared with MCP server)
const STATUS_FILE_PATH = join(homedir(), ".claude", "oh-my-claude", "status.json");

// Task agents file (tracks active Task tool agents)
const TASK_AGENTS_FILE = join(homedir(), ".claude", "oh-my-claude", "task-agents.json");

interface TaskAgent {
  id: string;
  type: string;
  description: string;
  startedAt: number;
}

interface TaskAgentsData {
  agents: TaskAgent[];
}

/**
 * Load current task agents
 */
function loadTaskAgents(): TaskAgentsData {
  try {
    if (!existsSync(TASK_AGENTS_FILE)) {
      return { agents: [] };
    }
    const content = readFileSync(TASK_AGENTS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { agents: [] };
  }
}

/**
 * Save task agents
 */
function saveTaskAgents(data: TaskAgentsData): void {
  try {
    const dir = dirname(TASK_AGENTS_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(TASK_AGENTS_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Silently fail
  }
}

/**
 * Update the shared status file to include Task agents
 */
function updateStatusFile(): void {
  try {
    // Read current status
    let status: any = {
      activeTasks: [],
      providers: {},
      updatedAt: new Date().toISOString(),
    };

    if (existsSync(STATUS_FILE_PATH)) {
      try {
        status = JSON.parse(readFileSync(STATUS_FILE_PATH, "utf-8"));
      } catch {
        // Use default
      }
    }

    // Load task agents and merge with status
    const taskAgents = loadTaskAgents();

    // Add Task agents to activeTasks (mark with special prefix)
    const taskAgentTasks = taskAgents.agents.map((agent) => ({
      agent: `@${agent.type}`, // @ prefix indicates Claude-subscription agent
      startedAt: agent.startedAt,
      isTaskTool: true,
    }));

    // Filter out stale Task agents (older than 30 minutes)
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const activeTaskAgents = taskAgentTasks.filter(
      (t) => t.startedAt > thirtyMinutesAgo
    );

    // Merge: MCP tasks first, then Task tool agents
    const mcpTasks = (status.activeTasks || []).filter((t: any) => !t.isTaskTool);
    status.activeTasks = [...mcpTasks, ...activeTaskAgents];
    status.updatedAt = new Date().toISOString();

    // Write back
    const dir = dirname(STATUS_FILE_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 2));
  } catch {
    // Silently fail
  }
}

/**
 * Generate a simple ID for tracking
 */
function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Map subagent_type to display name
 */
function getAgentDisplayName(subagentType: string): string {
  const mapping: Record<string, string> = {
    Bash: "Bash",
    Explore: "Scout",
    Plan: "Planner",
    "general-purpose": "General",
    "claude-code-guide": "Guide",
  };
  return mapping[subagentType] || subagentType;
}

async function main() {
  // Read input from stdin
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf-8");
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  if (!inputData.trim()) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  let toolInput: ToolUseInput;
  try {
    toolInput = JSON.parse(inputData);
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Only process Task tool
  if (toolInput.tool !== "Task") {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  const subagentType = toolInput.tool_input?.subagent_type || "unknown";
  const description = toolInput.tool_input?.description || "";

  // Check if this is PreToolUse (no tool_output) or PostToolUse (has tool_output)
  const isPreToolUse = !toolInput.tool_output;

  if (isPreToolUse) {
    // Task is about to launch - add to tracking
    const taskAgents = loadTaskAgents();

    const newAgent: TaskAgent = {
      id: generateId(),
      type: getAgentDisplayName(subagentType),
      description: description,
      startedAt: Date.now(),
    };

    taskAgents.agents.push(newAgent);
    saveTaskAgents(taskAgents);
    updateStatusFile();

    // Provide context about the launch
    const response: HookResponse = {
      decision: "approve",
    };
    console.log(JSON.stringify(response));
  } else {
    // Task completed - remove from tracking
    const taskAgents = loadTaskAgents();

    // Remove the most recent agent of this type (LIFO)
    const displayName = getAgentDisplayName(subagentType);
    const index = taskAgents.agents.findIndex((a) => a.type === displayName);

    if (index !== -1) {
      const removedArr = taskAgents.agents.splice(index, 1);
      const removed = removedArr[0];
      if (!removed) {
        console.log(JSON.stringify({ decision: "approve" }));
        return;
      }
      const duration = Math.floor((Date.now() - removed.startedAt) / 1000);

      saveTaskAgents(taskAgents);
      updateStatusFile();

      // Provide completion notification
      const durationStr =
        duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m`;
      const response: HookResponse = {
        decision: "approve",
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `\n[@] ${displayName}: completed (${durationStr})`,
        },
      };
      console.log(JSON.stringify(response));
      return;
    }

    console.log(JSON.stringify({ decision: "approve" }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
