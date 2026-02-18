/**
 * Task Manager for background agent execution
 *
 * Manages the lifecycle of background tasks:
 * - Launch tasks with agent/category routing
 * - Track task status and results
 * - Write status file for statusline display
 */

import { routeByAgent, routeByCategory, routeByModel } from "../../providers/router";
import { getAgent } from "../../agents";
import { getAgentProfile } from "../../agents/context-profiles";
import { loadConfig, resolveProviderForAgent, resolveProviderForCategory, getProviderDetails, resolveProviderForAgentWithFallback } from "../../config";
import type { ChatMessage, ChatCompletionResponse } from "../../providers/types";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { getSessionStatusPath, ensureSessionDir, cleanupStaleSessions } from "../../statusline/session";
import { detectContextNeeds, gatherContext, formatContextForPrompt } from "../../context";
import {
  acquireSlot,
  releaseSlot,
  getConcurrencyStatus as getConcurrencyStatusInternal,
  getConcurrencyStatusString,
} from "./concurrency";

// Re-export for server.ts
export { getConcurrencyStatusInternal as getConcurrencyStatus, getConcurrencyStatusString };

// Cleanup stale sessions on server startup
cleanupStaleSessions(60 * 60 * 1000); // 1 hour

// ── Proxy routing helpers ───────────────────────────────────────────

/** Proxy control API port */
const PROXY_CONTROL_PORT = 18911;
/** Proxy messages API port */
const PROXY_MESSAGES_PORT = 18910;
/** Proxy health cache TTL (30 seconds) */
const PROXY_HEALTH_TTL_MS = 30_000;

let proxyHealthCache: { available: boolean; checkedAt: number } | null = null;

/**
 * Check if the oh-my-claude proxy is running (cached for 30s).
 */
async function isProxyAvailable(): Promise<boolean> {
  const now = Date.now();
  if (proxyHealthCache && now - proxyHealthCache.checkedAt < PROXY_HEALTH_TTL_MS) {
    return proxyHealthCache.available;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:${PROXY_CONTROL_PORT}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const available = res.ok;
    proxyHealthCache = { available, checkedAt: now };
    return available;
  } catch {
    proxyHealthCache = { available: false, checkedAt: now };
    return false;
  }
}

/**
 * Check if a provider type supports direct API calls (has API key auth).
 * OAuth and subscription providers require the proxy.
 */
function isDirectCallViable(providerType: string): boolean {
  switch (providerType) {
    case "openai-compatible":
    case "anthropic-compatible":
      return true;
    case "openai-oauth":
    case "claude-subscription":
      return false;
    default:
      return true; // Assume API-key based for unknown types
  }
}

/**
 * Route a request through the proxy with a route directive.
 *
 * Sends an Anthropic Messages API request to the proxy with
 * `[omc-route:provider/model]` in the system prompt, causing the proxy
 * to route to the specified provider.
 */
async function routeViaProxy(
  provider: string,
  model: string,
  messages: ChatMessage[],
): Promise<ChatCompletionResponse> {
  // Separate system message from conversation
  let systemText = "";
  const conversationMessages: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemText += (systemText ? "\n\n" : "") + msg.content;
    } else {
      conversationMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Inject route directive into system prompt
  const directive = `[omc-route:${provider}/${model}]`;
  systemText = systemText ? `${directive}\n\n${systemText}` : directive;

  const body = {
    model: "claude-sonnet-4-5-20250929", // Placeholder — proxy replaces via directive
    max_tokens: 16384,
    stream: false,
    system: systemText,
    messages: conversationMessages,
  };

  const res = await fetch(`http://localhost:${PROXY_MESSAGES_PORT}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": "proxy-mcp-internal", // Proxy doesn't validate this for directive routes
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Proxy returned ${res.status}: ${errorText.slice(0, 200)}`);
  }

  // Parse Anthropic Messages API response → ChatCompletionResponse
  const anthropicRes = await res.json() as Record<string, unknown>;
  return convertAnthropicResponseToChat(anthropicRes);
}

/**
 * Route a request through the proxy WITHOUT a directive (passthrough to Claude subscription).
 * Only works when proxy is running with subscription auth.
 */
async function routeViaClaude(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
  let systemText = "";
  const conversationMessages: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemText += (systemText ? "\n\n" : "") + msg.content;
    } else {
      conversationMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16384,
    stream: false,
    messages: conversationMessages,
  };
  if (systemText) {
    body.system = systemText;
  }

  const res = await fetch(`http://localhost:${PROXY_MESSAGES_PORT}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": "proxy-mcp-internal",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Claude passthrough returned ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const anthropicRes = await res.json() as Record<string, unknown>;
  return convertAnthropicResponseToChat(anthropicRes);
}

/**
 * Convert an Anthropic Messages API response to our internal ChatCompletionResponse format.
 */
function convertAnthropicResponseToChat(data: Record<string, unknown>): ChatCompletionResponse {
  const content = data.content as Array<Record<string, unknown>> | undefined;
  const textBlock = content?.find((b) => b.type === "text");
  const text = (textBlock?.text as string) ?? "";
  const usage = data.usage as Record<string, unknown> | undefined;

  return {
    id: (data.id as string) ?? `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: (data.model as string) ?? "unknown",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: (data.stop_reason as string) ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: (usage?.input_tokens as number) ?? 0,
      completion_tokens: (usage?.output_tokens as number) ?? 0,
      total_tokens: ((usage?.input_tokens as number) ?? 0) + ((usage?.output_tokens as number) ?? 0),
    },
  };
}

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface ContextHintsInput {
  keywords?: string[];
  filePatterns?: string[];
  skipContext?: boolean;
}

export interface Task {
  id: string;
  agentName?: string;
  categoryName?: string;
  /** Explicit provider name for direct model routing */
  providerName?: string;
  /** Explicit model name for direct model routing */
  modelName?: string;
  prompt: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  /** Provider being used (for statusline display) */
  provider?: string;
  /** Model being used (for statusline display) */
  model?: string;
  /** Context hints for enriching prompt */
  contextHints?: ContextHintsInput;
  /** Conversation context from the orchestrating agent */
  conversationContext?: string;
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

    // Get active tasks with rich info for statusline
    const activeTasks = Array.from(tasks.values())
      .filter((t) => t.status === "running" || t.status === "pending")
      .map((t) => ({
        agent: t.agentName || t.categoryName || "unknown",
        startedAt: t.startedAt || t.createdAt,
        provider: t.provider,
        model: t.model,
        prompt: t.prompt.slice(0, 100), // Truncate for display
      }));

    // Get concurrency status for display
    const concurrency = getConcurrencyStatusInternal();

    const status = {
      activeTasks,
      concurrency: {
        active: concurrency.global.active,
        limit: concurrency.global.limit,
        queued: concurrency.global.queued,
      },
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(statusPath, JSON.stringify(status, null, 2));
  } catch (error) {
    // Silently fail - statusline is non-critical
    console.error("Failed to update status file:", error);
  }
}

// ── Completion signal files ──────────────────────────────────────────
// Written when a task finishes so PostToolUse/UserPromptSubmit hooks
// can detect completions without polling MCP tools.

const SIGNALS_DIR = join(homedir(), ".claude", "oh-my-claude", "signals", "completed");

/**
 * Write a completion signal file for hook-based notification
 */
function writeCompletionSignal(task: Task): void {
  try {
    if (!existsSync(SIGNALS_DIR)) {
      mkdirSync(SIGNALS_DIR, { recursive: true });
    }
    const signal = {
      taskId: task.id,
      status: task.status,
      agentName: task.agentName || task.categoryName || "unknown",
      resultPreview: task.result?.slice(0, 200) ?? task.error?.slice(0, 200) ?? "",
      completedAt: new Date(task.completedAt!).toISOString(),
    };
    writeFileSync(join(SIGNALS_DIR, `${task.id}.json`), JSON.stringify(signal));
  } catch {
    // Non-critical — hooks will fall back to polling
  }
}

/**
 * Launch a new background task
 */
export async function launchTask(options: {
  agentName?: string;
  categoryName?: string;
  providerName?: string;
  modelName?: string;
  prompt: string;
  systemPrompt?: string;
  contextHints?: ContextHintsInput;
  conversationContext?: string;
}): Promise<string> {
  const { agentName, categoryName, providerName, modelName, prompt, systemPrompt, contextHints, conversationContext } = options;

  if (!agentName && !categoryName && !(providerName && modelName)) {
    throw new Error("Either agentName, categoryName, or providerName+modelName must be provided");
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

  // Look up provider and model for this agent/category (or use explicit values)
  const config = loadConfig();
  let provider: string | undefined;
  let model: string | undefined;
  if (providerName && modelName) {
    provider = providerName;
    model = modelName;
  } else if (agentName) {
    const agentConfig = resolveProviderForAgent(config, agentName);
    provider = agentConfig?.provider;
    model = agentConfig?.model;
  } else if (categoryName) {
    const categoryConfig = resolveProviderForCategory(config, categoryName);
    provider = categoryConfig?.provider;
    model = categoryConfig?.model;
  }

  const task: Task = {
    id: taskId,
    agentName,
    categoryName,
    providerName,
    modelName,
    prompt,
    status: "pending",
    provider,
    model,
    contextHints,
    conversationContext,
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
 * Run a task asynchronously with concurrency control
 */
async function runTask(task: Task, systemPrompt?: string): Promise<void> {
  // Get provider for concurrency tracking
  const provider = task.provider ?? "unknown";

  // Wait for a concurrency slot
  await acquireSlot(provider);

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

    // Prepend conversation context if provided
    let enrichedPrompt = task.prompt;
    if (task.conversationContext) {
      enrichedPrompt = `<conversation_context>\n${task.conversationContext}\n</conversation_context>\n\n${enrichedPrompt}`;
    }

    // Enrich prompt with context if not skipped
    if (!task.contextHints?.skipContext && task.agentName) {
      try {
        const profile = getAgentProfile(task.agentName);
        const contextTypes = detectContextNeeds(task.prompt, {
          keywords: task.contextHints?.keywords,
          filePatterns: task.contextHints?.filePatterns,
        });

        const workingDir = process.cwd();
        const context = await gatherContext(
          workingDir,
          contextTypes,
          profile,
          task.contextHints?.filePatterns
        );

        if (context.items.length > 0) {
          const contextBlock = formatContextForPrompt(context);
          enrichedPrompt = `${contextBlock}\n\n${enrichedPrompt}`;
        }
      } catch {
        // Silently fail context gathering - proceed without context
      }
    }

    // Add user prompt (with enriched context if available)
    messages.push({
      role: "user",
      content: enrichedPrompt,
    });

    // Resolve provider/model for this task
    const config = loadConfig();
    let resolvedProvider = task.provider;
    let resolvedModel = task.model;

    if (!resolvedProvider && task.agentName) {
      const ac = resolveProviderForAgentWithFallback(config, task.agentName);
      if (ac) { resolvedProvider = ac.provider; resolvedModel = ac.model; }
    } else if (!resolvedProvider && task.categoryName) {
      const cc = resolveProviderForCategory(config, task.categoryName);
      if (cc) { resolvedProvider = cc.provider; resolvedModel = cc.model; }
    }

    const providerDetails = resolvedProvider ? getProviderDetails(config, resolvedProvider) : null;
    const providerType = providerDetails?.type ?? "openai-compatible";
    const proxyUp = await isProxyAvailable();

    let response: ChatCompletionResponse | undefined;
    let lastError: Error | undefined;

    // Step 1: Try routing via proxy (works for ALL providers including OAuth)
    if (proxyUp && resolvedProvider && resolvedModel) {
      try {
        response = await routeViaProxy(resolvedProvider, resolvedModel, messages);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[task ${task.id}] Proxy route failed for ${resolvedProvider}/${resolvedModel}: ${lastError.message}`);
      }
    }

    // Step 2: Try direct API call (only for API-key providers)
    if (!response && isDirectCallViable(providerType)) {
      try {
        if (task.providerName && task.modelName) {
          response = await routeByModel(task.providerName, task.modelName, messages);
        } else if (task.agentName) {
          response = await routeByAgent(task.agentName, messages);
        } else if (task.categoryName) {
          response = await routeByCategory(task.categoryName, messages);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[task ${task.id}] Direct API call failed: ${lastError.message}`);
      }
    }

    // Step 3: Fall back to Claude subscription via proxy passthrough
    if (!response && proxyUp) {
      try {
        console.error(`[task ${task.id}] Falling back to Claude subscription via proxy passthrough`);
        response = await routeViaClaude(messages);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[task ${task.id}] Claude passthrough failed: ${lastError.message}`);
      }
    }

    // Step 4: All external routes exhausted — return fallback signal
    // Claude Code should use its built-in Task tool (haiku/sonnet) to handle this
    if (!response) {
      const providerInfo = resolvedProvider ? `${resolvedProvider}/${resolvedModel}` : "unknown";
      const reason = lastError?.message ?? "provider unavailable";
      console.error(`[task ${task.id}] All routes exhausted for ${providerInfo}, returning Claude fallback signal`);

      // Return a successful result with a fallback marker
      // The MCP tool description instructs Claude to use Task tool when it sees this
      task.status = "completed";
      task.result = `[omc-fallback] Provider ${providerInfo} unavailable (${reason}). ` +
        `Please handle this task directly using Claude's built-in capabilities. ` +
        `Original prompt follows:\n\n${task.prompt}`;
      task.completedAt = Date.now();
      tasks.set(task.id, task);
      updateStatusFile();
      writeCompletionSignal(task);
      return; // Early return — skip normal result extraction
    }

    // Extract result from response
    const result = response.choices[0]?.message?.content ?? "";

    task.status = "completed";
    task.result = result;
    task.completedAt = Date.now();
    tasks.set(task.id, task);
    updateStatusFile();
    writeCompletionSignal(task);
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : String(error);
    task.completedAt = Date.now();
    tasks.set(task.id, task);
    updateStatusFile();
    writeCompletionSignal(task);
  } finally {
    // Always release the concurrency slot
    releaseSlot(provider);
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
 * Wait for multiple tasks to complete (blocking)
 * @param mode "all" waits for all tasks, "any" returns on first completion
 */
export async function waitForMultipleTasks(
  taskIds: string[],
  mode: "all" | "any" = "all",
  timeoutMs: number = 5 * 60 * 1000,
  pollIntervalMs: number = 200
): Promise<{
  completed: Array<{ taskId: string; status: TaskStatus; result?: string; error?: string }>;
  pending: string[];
  timedOut: boolean;
}> {
  const startTime = Date.now();
  const completed: Array<{ taskId: string; status: TaskStatus; result?: string; error?: string }> = [];
  const remaining = new Set(taskIds);

  while (Date.now() - startTime < timeoutMs && remaining.size > 0) {
    for (const taskId of [...remaining]) {
      const task = tasks.get(taskId);
      if (!task) {
        remaining.delete(taskId);
        completed.push({ taskId, status: "failed", error: "Task not found" });
        continue;
      }

      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        remaining.delete(taskId);
        completed.push({ taskId, status: task.status, result: task.result, error: task.error });

        if (mode === "any") {
          return { completed, pending: [...remaining], timedOut: false };
        }
      }
    }

    if (remaining.size === 0) break;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    completed,
    pending: [...remaining],
    timedOut: remaining.size > 0,
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
