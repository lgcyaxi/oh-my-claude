/**
 * Task Manager for background agent execution
 *
 * Manages the lifecycle of background tasks:
 * - Launch tasks with agent/category routing
 * - Track task status and results
 * - Handle concurrency limits per provider
 * - Write status file for statusline display
 */

import { routeByAgent, routeByCategory } from "../../providers/router";
import { getAgent } from "../../agents";
import { loadConfig, resolveProviderForAgent, resolveProviderForCategory } from "../../config";
import type { ChatMessage } from "../../providers/types";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { getConcurrencyStatus } from "./concurrency";
import { getSessionStatusPath, ensureSessionDir, cleanupStaleSessions } from "../../statusline/session";

// Cleanup stale sessions on server startup
cleanupStaleSessions(60 * 60 * 1000); // 1 hour

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Task {
  id: string;
  agentName?: string;
  categoryName?: string;
  prompt: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  /** Provider being used (for statusline display) */
  provider?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

// In-memory task store
const tasks = new Map<string, Task>();

// Generate unique task ID
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Write current status to file for statusline integration
 * Called on every task state change and on server startup
 * Uses session-specific path for per-session tracking
 */
export function updateStatusFile(): void {
  try {
    // Ensure session directory exists
    ensureSessionDir();
    const statusPath = getSessionStatusPath();

    // Get active tasks with provider tracking
    const activeTasks = Array.from(tasks.values())
      .filter((t) => t.status === "running" || t.status === "pending")
      .map((t) => ({
        agent: t.agentName || t.categoryName || "unknown",
        startedAt: t.startedAt || t.createdAt,
        provider: t.provider,
      }));

    // Get provider concurrency
    const providers = getConcurrencyStatus();

    const status = {
      activeTasks,
      providers,
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(statusPath, JSON.stringify(status, null, 2));
  } catch (error) {
    // Silently fail - statusline is non-critical
    console.error("Failed to update status file:", error);
  }
}

/**
 * Launch a new background task
 */
export async function launchTask(options: {
  agentName?: string;
  categoryName?: string;
  prompt: string;
  systemPrompt?: string;
}): Promise<string> {
  const { agentName, categoryName, prompt, systemPrompt } = options;

  if (!agentName && !categoryName) {
    throw new Error("Either agentName or categoryName must be provided");
  }

  const taskId = generateTaskId();

  // Get agent's system prompt if using agent routing
  let finalSystemPrompt = systemPrompt;
  if (agentName && !systemPrompt) {
    const agent = getAgent(agentName);
    if (agent) {
      finalSystemPrompt = agent.prompt;
    }
  }

  // Look up provider for this agent/category
  const config = loadConfig();
  let provider: string | undefined;
  if (agentName) {
    const agentConfig = resolveProviderForAgent(config, agentName);
    provider = agentConfig?.provider;
  } else if (categoryName) {
    const categoryConfig = resolveProviderForCategory(config, categoryName);
    provider = categoryConfig?.provider;
  }

  const task: Task = {
    id: taskId,
    agentName,
    categoryName,
    prompt,
    status: "pending",
    provider,
    createdAt: Date.now(),
  };

  tasks.set(taskId, task);
  updateStatusFile();

  // Start the task asynchronously
  runTask(task, finalSystemPrompt).catch((error) => {
    // Error handling is done inside runTask
    console.error(`Task ${taskId} failed:`, error);
  });

  return taskId;
}

/**
 * Run a task asynchronously
 */
async function runTask(task: Task, systemPrompt?: string): Promise<void> {
  task.status = "running";
  task.startedAt = Date.now();
  tasks.set(task.id, task);
  updateStatusFile();

  try {
    const messages: ChatMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // Add user prompt
    messages.push({
      role: "user",
      content: task.prompt,
    });

    let response;

    if (task.agentName) {
      response = await routeByAgent(task.agentName, messages);
    } else if (task.categoryName) {
      response = await routeByCategory(task.categoryName, messages);
    } else {
      throw new Error("No agent or category specified");
    }

    // Extract result from response
    const result = response.choices[0]?.message?.content ?? "";

    task.status = "completed";
    task.result = result;
    task.completedAt = Date.now();
    tasks.set(task.id, task);
    updateStatusFile();
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : String(error);
    task.completedAt = Date.now();
    tasks.set(task.id, task);
    updateStatusFile();
  }
}

/**
 * Get task status and result
 */
export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId);
}

/**
 * Poll task for completion
 */
export function pollTask(taskId: string): {
  status: TaskStatus;
  result?: string;
  error?: string;
} {
  const task = tasks.get(taskId);

  if (!task) {
    return { status: "failed", error: "Task not found" };
  }

  return {
    status: task.status,
    result: task.result,
    error: task.error,
  };
}

/**
 * Wait for a task to complete (blocking)
 */
export async function waitForTaskCompletion(
  taskId: string,
  timeoutMs: number = 5 * 60 * 1000,
  pollIntervalMs: number = 200
): Promise<{
  status: TaskStatus;
  result?: string;
  error?: string;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const task = tasks.get(taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Check for terminal states
    if (
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "cancelled"
    ) {
      return {
        status: task.status,
        result: task.result,
        error: task.error,
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout reached
  const task = tasks.get(taskId);
  return {
    status: task?.status ?? "failed",
    error: `Timeout after ${timeoutMs}ms. Task ID: ${taskId} - use poll_task to check later.`,
    result: undefined,
  };
}

/**
 * Cancel a task
 */
export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId);

  if (!task) {
    return false;
  }

  // Can only cancel pending or running tasks
  if (task.status === "pending" || task.status === "running") {
    task.status = "cancelled";
    task.completedAt = Date.now();
    tasks.set(taskId, task);
    updateStatusFile();
    return true;
  }

  return false;
}

/**
 * Cancel all running tasks
 */
export function cancelAllTasks(): number {
  let cancelled = 0;

  for (const [taskId, task] of tasks) {
    if (task.status === "pending" || task.status === "running") {
      task.status = "cancelled";
      task.completedAt = Date.now();
      tasks.set(taskId, task);
      cancelled++;
    }
  }

  if (cancelled > 0) {
    updateStatusFile();
  }

  return cancelled;
}

/**
 * List all tasks
 */
export function listTasks(options?: {
  status?: TaskStatus;
  limit?: number;
}): Task[] {
  let result = Array.from(tasks.values());

  if (options?.status) {
    result = result.filter((t) => t.status === options.status);
  }

  // Sort by creation time (newest first)
  result.sort((a, b) => b.createdAt - a.createdAt);

  if (options?.limit) {
    result = result.slice(0, options.limit);
  }

  return result;
}

/**
 * Clean up completed/failed/cancelled tasks older than specified age
 */
export function cleanupTasks(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [taskId, task] of tasks) {
    if (
      task.completedAt &&
      now - task.completedAt > maxAgeMs &&
      (task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled")
    ) {
      tasks.delete(taskId);
      cleaned++;
    }
  }

  return cleaned;
}
