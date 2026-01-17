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
import { getSessionStatusPath, getSessionTaskAgentsPath, ensureSessionDir, getActiveSessions, writeCurrentPPID } from "../statusline/session";

// Config file paths
const CONFIG_FILES = [
  join(homedir(), ".claude", "oh-my-claude.json"),
  join(homedir(), ".claude", "oh-my-claude", "config.json"),
];

// Load debug setting from config file
function loadDebugSetting(): boolean {
  // First check environment variable (for backward compatibility)
  if (process.env.DEBUG_TASK_TRACKER === "1") {
    return true;
  }

  // Then check config files
  for (const configPath of CONFIG_FILES) {
    try {
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (config.debugTaskTracker === true) {
          return true;
        }
      }
    } catch {
      // Ignore errors, continue to next config file
    }
  }

  return false;
}

// Debug logging - enable via config file or DEBUG_TASK_TRACKER=1
const debug = loadDebugSetting();
const debugLog = (...args: unknown[]) => {
  if (debug) {
    const timestamp = new Date().toISOString();
    // Write to debug log file
    try {
      const debugPath = join(homedir(), ".claude", "oh-my-claude", "task-tracker-debug.log");
      writeFileSync(debugPath, `[${timestamp}] ${args.join(" ")}\n`, { flag: "a" });
    } catch {
      // Ignore debug logging errors
    }
  }
};

interface ToolUseInput {
  tool?: string;
  tool_name?: string; // Official field name from docs
  tool_input?: {
    subagent_type?: string;
    description?: string;
    prompt?: string;
    model?: string; // sonnet, opus, haiku
  };
  // Also support 'input' field (what Claude Code actually sends)
  input?: {
    subagent_type?: string;
    description?: string;
    prompt?: string;
    model?: string;
  };
  tool_output?: string;
  tool_response?: string; // Official field name from docs
  output?: string; // Alternative field name
  hook_event_name?: string; // PreToolUse or PostToolUse
}

interface HookResponse {
  decision: "approve";
  hookSpecificOutput?: {
    hookEventName: "PreToolUse" | "PostToolUse";
    additionalContext?: string;
  };
}

// Note: Status and task agents files are now session-specific
// Paths are obtained via getSessionStatusPath() and getSessionTaskAgentsPath()

interface TaskAgent {
  id: string;
  type: string;
  description: string;
  model?: string; // sonnet, opus, haiku
  startedAt: number;
}

interface TaskAgentsData {
  agents: TaskAgent[];
}

/**
 * Load current task agents from session-specific file
 */
function loadTaskAgents(): TaskAgentsData {
  try {
    const taskAgentsPath = getSessionTaskAgentsPath();
    if (!existsSync(taskAgentsPath)) {
      return { agents: [] };
    }
    const content = readFileSync(taskAgentsPath, "utf-8");
    const data = JSON.parse(content);
    // Validate data structure - ensure agents array exists
    if (!data || !Array.isArray(data.agents)) {
      return { agents: [] };
    }
    return data as TaskAgentsData;
  } catch {
    return { agents: [] };
  }
}

/**
 * Save task agents to session-specific file
 */
function saveTaskAgents(data: TaskAgentsData): void {
  try {
    ensureSessionDir();
    const taskAgentsPath = getSessionTaskAgentsPath();
    writeFileSync(taskAgentsPath, JSON.stringify(data, null, 2));
    debugLog("Saved task agents:", JSON.stringify(data));
  } catch (error) {
    debugLog("Failed to save task agents:", error);
    // Silently fail
  }
}

/**
 * Update the session-specific status file to include Task agents
 */
function updateStatusFile(): void {
  try {
    ensureSessionDir();
    const statusPath = getSessionStatusPath();

    // Read current status
    let status: any = {
      activeTasks: [],
      providers: {},
      updatedAt: new Date().toISOString(),
    };

    if (existsSync(statusPath)) {
      try {
        status = JSON.parse(readFileSync(statusPath, "utf-8"));
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
      model: agent.model, // Include model info (sonnet, opus, haiku)
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
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
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

/**
 * Infer default model for subagent_type when not explicitly specified
 * Returns "?" for unknown types to help with debugging
 */
function inferDefaultModel(subagentType: string): string {
  const defaultModels: Record<string, string> = {
    Plan: "sonnet",           // Planning needs good reasoning
    Explore: "haiku",         // Fast codebase exploration
    Bash: "haiku",            // Simple command execution
    "general-purpose": "sonnet", // General tasks need balance
    "claude-code-guide": "haiku", // Quick doc lookup
  };
  // Return "?" for unknown types - helps identify missing mappings or bugs
  return defaultModels[subagentType] ?? "?";
}

async function main() {
  debugLog("task-tracker hook invoked");

  // Write current PPID so MCP server can discover our Claude Code session
  writeCurrentPPID();

  // Read input from stdin
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf-8");
  } catch (error) {
    debugLog("Failed to read stdin:", error);
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  debugLog("Raw input:", inputData);

  if (!inputData.trim()) {
    debugLog("Empty input, approving");
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  let toolInput: ToolUseInput;
  try {
    toolInput = JSON.parse(inputData);
  } catch (error) {
    debugLog("Failed to parse JSON:", error);
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  debugLog("Parsed toolInput:", JSON.stringify(toolInput));

  // Get tool name from either field
  const toolName = toolInput.tool || toolInput.tool_name || "";

  // Only process Task tool
  if (toolName !== "Task") {
    debugLog("Not a Task tool, approving:", toolName);
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Support both 'tool_input' and 'input' field names
  const inputDataFields = toolInput.tool_input || toolInput.input || {};
  const subagentType = inputDataFields.subagent_type || "unknown";
  const description = inputDataFields.description || "";
  // Use explicit model if provided, otherwise infer from subagent_type
  const model = inputDataFields.model || inferDefaultModel(subagentType);

  debugLog("Task tool detected - subagent:", subagentType, "model:", model, "(inferred:", !inputDataFields.model, ")");

  // Check if this is PreToolUse or PostToolUse
  // Method 1: Check hook_event_name field (official way)
  // Method 2: Check for presence of tool_response/tool_output (PostToolUse has response)
  const hookEventName = toolInput.hook_event_name;
  const hasResponse = toolInput.tool_response || toolInput.tool_output || toolInput.output;

  // If hook_event_name is explicitly set, use it
  // Otherwise, infer from presence of response field
  const isPreToolUse = hookEventName === "PreToolUse" ||
                       (hookEventName === undefined && !hasResponse);

  debugLog("Hook event:", hookEventName, "hasResponse:", hasResponse, "isPreToolUse:", isPreToolUse);

  if (isPreToolUse) {
    // Task is about to launch - add to tracking
    const taskAgents = loadTaskAgents();
    debugLog("Current task agents:", taskAgents.agents.length);

    const newAgent: TaskAgent = {
      id: generateId(),
      type: getAgentDisplayName(subagentType),
      description: description,
      model: model,
      startedAt: Date.now(),
    };

    debugLog("Adding new agent:", JSON.stringify(newAgent));
    taskAgents.agents.push(newAgent);
    saveTaskAgents(taskAgents);
    updateStatusFile();

    // Verify file was written
    if (debug) {
      const taskAgentsPath = getSessionTaskAgentsPath();
      if (existsSync(taskAgentsPath)) {
        const verifyData = readFileSync(taskAgentsPath, "utf-8");
        debugLog("Verified task-agents.json:", verifyData);
      }
    }

    // Provide context about the launch
    const response: HookResponse = {
      decision: "approve",
    };
    console.log(JSON.stringify(response));
  } else {
    // Task completed - remove from tracking
    const taskAgents = loadTaskAgents();
    debugLog("Task completion - current agents:", taskAgents.agents.length);

    // Remove the most recent agent of this type (LIFO)
    const displayName = getAgentDisplayName(subagentType);
    const index = taskAgents.agents.findIndex((a) => a.type === displayName);

    debugLog("Looking for agent type:", displayName, "index:", index);

    if (index !== -1) {
      const removedArr = taskAgents.agents.splice(index, 1);
      const removed = removedArr[0];
      if (!removed) {
        console.log(JSON.stringify({ decision: "approve" }));
        return;
      }
      const duration = Math.floor((Date.now() - removed.startedAt) / 1000);
      debugLog("Agent completed, duration:", duration, "seconds");

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

    debugLog("Agent not found for removal:", displayName);
    console.log(JSON.stringify({ decision: "approve" }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
