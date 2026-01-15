/**
 * Task Manager for background agent execution
 *
 * Manages the lifecycle of background tasks:
 * - Launch tasks with agent/category routing
 * - Track task status and results
 * - Handle concurrency limits per provider
 */

import { routeByAgent, routeByCategory } from "../../providers/router";
import { getAgent } from "../../agents";
import type { ChatMessage } from "../../providers/types";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Task {
  id: string;
  agentName?: string;
  categoryName?: string;
  prompt: string;
  status: TaskStatus;
  result?: string;
  error?: string;
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

  const task: Task = {
    id: taskId,
    agentName,
    categoryName,
    prompt,
    status: "pending",
    createdAt: Date.now(),
  };

  tasks.set(taskId, task);

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
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : String(error);
    task.completedAt = Date.now();
    tasks.set(task.id, task);
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
