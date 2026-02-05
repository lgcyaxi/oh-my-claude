#!/usr/bin/env node
/**
 * oh-my-claude Background Agent MCP Server
 *
 * Provides tools for Claude Code to run background tasks using external APIs:
 * - launch_background_task: Start a new background task with agent/category routing
 * - poll_task: Check task status and get results
 * - cancel_task: Cancel a running task
 * - list_tasks: List all tasks
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import {
  launchTask,
  pollTask,
  cancelTask,
  cancelAllTasks,
  listTasks,
  cleanupTasks,
  updateStatusFile,
  waitForTaskCompletion,
  getConcurrencyStatus,
} from "./task-manager";
import { getProvidersStatus, routeByModel } from "../../providers/router";
import { agents } from "../../agents";
import {
  createMemory,
  getMemory,
  deleteMemory,
  listMemories,
  getMemoryStats,
  searchMemories,
  getDefaultWriteScope,
  getProjectMemoryDir,
} from "../../memory";
import type { MemoryScope } from "../../memory";
import {
  readSwitchState,
  writeSwitchState,
  resetSwitchState,
} from "../../proxy/state";
import { DEFAULT_PROXY_CONFIG } from "../../proxy/types";
import type { ProxySwitchState } from "../../proxy/types";
import { loadConfig, isProviderConfigured } from "../../config";

// Tool definitions
const tools: Tool[] = [
  {
    name: "launch_background_task",
    description: `Launch a background task using an external AI provider.

Use this for async operations that should run in parallel without blocking.

**Available Agents** (use 'agent' parameter):
- oracle: Deep reasoning, architecture advice (DeepSeek reasoner)
- librarian: External docs, library research (ZhiPu GLM)
- analyst: Code analysis, patterns (DeepSeek chat)
- frontend-ui-ux: Visual/UI work (ZhiPu GLM-4v)
- document-writer: Documentation (MiniMax)

**Available Categories** (use 'category' parameter):
- ultrabrain: High-IQ reasoning tasks
- quick: Fast general tasks
- visual-engineering: UI/UX work
- writing: Documentation and text

Note: Agents using Claude subscription (sisyphus, claude-reviewer, claude-scout) should use Claude Code's Task tool instead.`,
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Agent name to use (oracle, analyst, librarian, frontend-ui-ux, document-writer)",
        },
        category: {
          type: "string",
          description:
            "Category to use instead of agent (ultrabrain, quick, visual-engineering, writing)",
        },
        prompt: {
          type: "string",
          description: "The prompt/task for the agent to execute",
        },
        system_prompt: {
          type: "string",
          description:
            "Optional custom system prompt (overrides agent default)",
        },
        context_hints: {
          type: "object",
          description: "Optional hints for automatic context gathering",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Keywords to help detect relevant context",
            },
            file_patterns: {
              type: "array",
              items: { type: "string" },
              description: "Glob patterns for files to include",
            },
            skip_context: {
              type: "boolean",
              description: "Set to true to disable automatic context",
            },
          },
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "execute_agent",
    description: `Execute an agent and wait for the result (blocking).

Use this for synchronous agent execution when you need the result immediately.

**Available Agents** (use 'agent' parameter):
- oracle: Deep reasoning, architecture advice (DeepSeek reasoner)
- librarian: External docs, library research (ZhiPu GLM)
- analyst: Code analysis, patterns (DeepSeek chat)
- frontend-ui-ux: Visual/UI work (ZhiPu GLM-4v)
- document-writer: Documentation (MiniMax)

**Available Categories** (use 'category' parameter):
- ultrabrain: High-IQ reasoning tasks
- quick: Fast general tasks
- visual-engineering: UI/UX work
- writing: Documentation and text

**Timeout Behavior**:
If the task takes longer than the timeout (default: 5 minutes), returns the task_id so you can poll manually with poll_task.

For parallel execution of multiple agents, use launch_background_task + poll_task instead.`,
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent name (oracle, analyst, librarian, frontend-ui-ux, document-writer)",
        },
        category: {
          type: "string",
          description: "Category (ultrabrain, quick, visual-engineering, writing)",
        },
        prompt: {
          type: "string",
          description: "The prompt/task for the agent to execute",
        },
        system_prompt: {
          type: "string",
          description: "Optional custom system prompt (overrides agent default)",
        },
        timeout_ms: {
          type: "number",
          description: "Optional timeout in milliseconds (default: 300000 = 5 minutes)",
        },
        context_hints: {
          type: "object",
          description: "Optional hints for automatic context gathering",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Keywords to help detect relevant context",
            },
            file_patterns: {
              type: "array",
              items: { type: "string" },
              description: "Glob patterns for files to include",
            },
            skip_context: {
              type: "boolean",
              description: "Set to true to disable automatic context",
            },
          },
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "execute_with_model",
    description: `Execute a prompt with an explicit provider and model (blocking).

Use this for direct model access without agent/category routing. Saves tokens by bypassing agent system prompts.

**Available Providers**: deepseek, zhipu, minimax, openrouter (must be configured with API key)

**Example Models**:
- deepseek: deepseek-reasoner, deepseek-chat
- zhipu: glm-4.7, glm-4v-flash
- minimax: minimax-m2.1

**Timeout Behavior**:
If the task takes longer than the timeout (default: 5 minutes), returns the task_id so you can poll manually with poll_task.`,
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "Provider name (e.g., deepseek, zhipu, minimax, openrouter)",
        },
        model: {
          type: "string",
          description: "Model name (e.g., deepseek-reasoner, glm-4.7, minimax-m2.1)",
        },
        prompt: {
          type: "string",
          description: "The prompt to send to the model",
        },
        system_prompt: {
          type: "string",
          description: "Optional system prompt",
        },
        timeout_ms: {
          type: "number",
          description: "Optional timeout in milliseconds (default: 300000 = 5 minutes)",
        },
      },
      required: ["provider", "model", "prompt"],
    },
  },
  {
    name: "poll_task",
    description:
      "Poll a background task for completion. Returns status and result when available.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task ID returned by launch_background_task",
        },
        wait_seconds: {
          type: "number",
          description: "Wait up to this many seconds for completion before returning (default: 0 = instant). Use 10-30 seconds to reduce polling frequency while allowing statusline updates.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "cancel_task",
    description: "Cancel a running or pending background task.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task ID to cancel",
        },
        all: {
          type: "boolean",
          description: "If true, cancel all running tasks",
        },
      },
    },
  },
  {
    name: "list_tasks",
    description: "List background tasks with optional filtering.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "running", "completed", "failed", "cancelled"],
          description: "Filter by status.",
        },
        limit: {
          type: "number",
          description: "Maximum number of tasks to return (default: 10)",
        },
      },
    },
  },
  {
    name: "get_status",
    description:
      "Get system status including provider configuration and concurrency.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // Memory tools
  {
    name: "remember",
    description: `Store a memory for future recall. Memories persist across sessions as markdown files.

Use this to save important context: decisions, patterns, conventions, or anything worth remembering.

Storage: By default, saves to project (.claude/mem/) if in a git repo, otherwise global (~/.claude/oh-my-claude/memory/).

Examples:
- "The team prefers functional components over class components"
- "Auth uses JWT with 24h expiry, refresh token is 7 days"
- "Project uses pnpm, not npm"`,
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The memory content to store (markdown supported)",
        },
        title: {
          type: "string",
          description: "Optional title (auto-generated from content if omitted)",
        },
        type: {
          type: "string",
          enum: ["note", "session"],
          description: "Memory type: 'note' for persistent knowledge, 'session' for session summaries (default: note)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization and search (e.g., ['pattern', 'auth', 'convention'])",
        },
        scope: {
          type: "string",
          enum: ["project", "global"],
          description: "Where to store: 'project' (.claude/mem/) or 'global' (~/.claude/oh-my-claude/memory/). Default: project if in git repo.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "recall",
    description: `Search and retrieve stored memories. Returns matching memories ranked by relevance.

Searches both project (.claude/mem/) and global (~/.claude/oh-my-claude/memory/) by default.

Use this to find previously saved knowledge, decisions, or session summaries.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text query to search memories (matches title, content, tags)",
        },
        type: {
          type: "string",
          enum: ["note", "session"],
          description: "Filter by memory type",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (any match)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 10)",
        },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "Where to search: 'project', 'global', or 'all' (default: all)",
        },
      },
    },
  },
  {
    name: "forget",
    description: "Delete a specific memory by its ID. Searches both project and global storage.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The memory ID to delete",
        },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "Where to search for the memory (default: all)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_memories",
    description: "List stored memories with optional filtering by type, date range, and scope.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["note", "session"],
          description: "Filter by memory type",
        },
        limit: {
          type: "number",
          description: "Max results (default: 20)",
        },
        after: {
          type: "string",
          description: "Only show memories created after this date (ISO 8601)",
        },
        before: {
          type: "string",
          description: "Only show memories created before this date (ISO 8601)",
        },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "Where to list: 'project', 'global', or 'all' (default: all)",
        },
      },
    },
  },
  {
    name: "memory_status",
    description: "Get memory store statistics (total count, size, breakdown by type and scope).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "compact_memories",
    description: `Analyze memories and suggest compaction groups. Use this when memory count is high or user requests cleanup.

Flow:
1. Analyzes all memories using AI (ZhiPu -> MiniMax -> DeepSeek)
2. Returns suggested merge groups with previews
3. User confirms which groups to compact
4. Call again with 'execute' mode to perform the merge

Returns JSON with suggested groups. Each group shows which memories would merge and a preview of the result.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["analyze", "execute"],
          description: "Mode: 'analyze' to get suggestions, 'execute' to perform confirmed merges",
        },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "Which memories to analyze (default: all)",
        },
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ids: { type: "array", items: { type: "string" } },
              title: { type: "string" },
            },
          },
          description: "For 'execute' mode: groups to compact (from analyze results)",
        },
        targetScope: {
          type: "string",
          enum: ["project", "global"],
          description: "For 'execute' mode: where to save compacted memories (default: project)",
        },
      },
      required: ["mode"],
    },
  },
  // Proxy switch tools
  {
    name: "switch_model",
    description: `Switch Claude Code's next N requests to an external provider via the proxy.

Requires the oh-my-claude proxy to be running (oh-my-claude proxy start).
After the specified number of requests, automatically reverts to native Claude.

**Available Providers** (must have API key configured):
- deepseek: deepseek-reasoner, deepseek-chat
- zhipu: glm-4.7, glm-4v-flash
- minimax: MiniMax-M2.1
- openrouter: (any model via OpenRouter)

**Example**: switch_model(provider="deepseek", model="deepseek-reasoner", requests=1)
This routes the next Claude Code response through DeepSeek's reasoner model.`,
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "Provider name (deepseek, zhipu, minimax, openrouter)",
        },
        model: {
          type: "string",
          description: "Model name (e.g., deepseek-reasoner, glm-4.7, MiniMax-M2.1)",
        },
        requests: {
          type: "number",
          description: "Number of requests to switch (default: 1, -1 = unlimited until manual revert)",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in ms before auto-revert (default: 600000 = 10 min)",
        },
      },
      required: ["provider", "model"],
    },
  },
  {
    name: "switch_status",
    description: "Get the current proxy switch status. Shows whether requests are being routed to an external provider.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "switch_revert",
    description: "Immediately revert the proxy to passthrough mode (route to native Claude).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Create server
const server = new Server(
  {
    name: "oh-my-claude-background",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "launch_background_task": {
        const { agent, category, prompt, system_prompt, context_hints } = args as {
          agent?: string;
          category?: string;
          prompt: string;
          system_prompt?: string;
          context_hints?: {
            keywords?: string[];
            file_patterns?: string[];
            skip_context?: boolean;
          };
        };

        if (!prompt) {
          return {
            content: [{ type: "text", text: "Error: prompt is required" }],
            isError: true,
          };
        }

        // Validate agent if provided
        if (agent) {
          const agentDef = agents[agent.toLowerCase()];
          if (!agentDef) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Unknown agent "${agent}". Available: ${Object.keys(agents).join(", ")}`,
                },
              ],
              isError: true,
            };
          }
          if (agentDef.executionMode === "task") {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Agent "${agent}" uses Claude subscription. Use Claude Code's Task tool with subagent_type instead.`,
                },
              ],
              isError: true,
            };
          }
        }

        const taskId = await launchTask({
          agentName: agent,
          categoryName: category,
          prompt,
          systemPrompt: system_prompt,
          contextHints: context_hints
            ? {
                keywords: context_hints.keywords,
                filePatterns: context_hints.file_patterns,
                skipContext: context_hints.skip_context,
              }
            : undefined,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                task_id: taskId,
                status: "launched",
                message: "Task launched. Use poll_task to check status.",
              }),
            },
          ],
        };
      }

      case "execute_agent": {
        const { agent, category, prompt, system_prompt, timeout_ms, context_hints } = args as {
          agent?: string;
          category?: string;
          prompt: string;
          system_prompt?: string;
          timeout_ms?: number;
          context_hints?: {
            keywords?: string[];
            file_patterns?: string[];
            skip_context?: boolean;
          };
        };

        if (!prompt) {
          return {
            content: [{ type: "text", text: "Error: prompt is required" }],
            isError: true,
          };
        }

        // Validate agent if provided
        if (agent) {
          const agentDef = agents[agent.toLowerCase()];
          if (!agentDef) {
            return {
              content: [{
                type: "text",
                text: `Error: Unknown agent "${agent}". Available: ${Object.keys(agents).join(", ")}`,
              }],
              isError: true,
            };
          }
          if (agentDef.executionMode === "task") {
            return {
              content: [{
                type: "text",
                text: `Error: Agent "${agent}" uses Claude subscription. Use Claude Code's Task tool instead.`,
              }],
              isError: true,
            };
          }
        }

        // Launch the task
        const taskId = await launchTask({
          agentName: agent,
          categoryName: category,
          prompt,
          systemPrompt: system_prompt,
          contextHints: context_hints
            ? {
                keywords: context_hints.keywords,
                filePatterns: context_hints.file_patterns,
                skipContext: context_hints.skip_context,
              }
            : undefined,
        });

        // Wait for completion
        const timeout = timeout_ms ?? 5 * 60 * 1000;
        const result = await waitForTaskCompletion(taskId, timeout);

        // Handle timeout
        if (result.error?.includes("Timeout")) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "timeout",
                task_id: taskId,
                message: result.error,
              }),
            }],
          };
        }

        // Handle failure
        if (result.status === "failed") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ status: "failed", error: result.error }),
            }],
            isError: true,
          };
        }

        // Success
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ status: result.status, result: result.result }),
          }],
        };
      }

      case "execute_with_model": {
        const { provider, model, prompt, system_prompt, timeout_ms } = args as {
          provider: string;
          model: string;
          prompt: string;
          system_prompt?: string;
          timeout_ms?: number;
        };

        if (!provider || !model || !prompt) {
          return {
            content: [{ type: "text", text: "Error: provider, model, and prompt are required" }],
            isError: true,
          };
        }

        // Launch the task with direct model routing
        const taskId = await launchTask({
          providerName: provider,
          modelName: model,
          prompt,
          systemPrompt: system_prompt,
        });

        // Wait for completion
        const timeout = timeout_ms ?? 5 * 60 * 1000;
        const result = await waitForTaskCompletion(taskId, timeout);

        // Handle timeout
        if (result.error?.includes("Timeout")) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "timeout",
                task_id: taskId,
                message: result.error,
              }),
            }],
          };
        }

        // Handle failure
        if (result.status === "failed") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ status: "failed", error: result.error }),
            }],
            isError: true,
          };
        }

        // Success
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ status: result.status, result: result.result }),
          }],
        };
      }

      case "poll_task": {
        const { task_id, wait_seconds } = args as { task_id: string; wait_seconds?: number };

        if (!task_id) {
          return {
            content: [{ type: "text", text: "Error: task_id is required" }],
            isError: true,
          };
        }

        // If wait_seconds provided, wait for completion with timeout
        if (wait_seconds && wait_seconds > 0) {
          const timeoutMs = Math.min(wait_seconds * 1000, 60000); // Cap at 60 seconds
          const result = await waitForTaskCompletion(task_id, timeoutMs, 500);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result),
              },
            ],
          };
        }

        // Instant poll (no waiting)
        const result = pollTask(task_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      }

      case "cancel_task": {
        const { task_id, all } = args as { task_id?: string; all?: boolean };

        if (all) {
          const count = cancelAllTasks();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  cancelled: count,
                  message: `Cancelled ${count} task(s)`,
                }),
              },
            ],
          };
        }

        if (!task_id) {
          return {
            content: [
              {
                type: "text",
                text: "Error: task_id is required (or use all: true)",
              },
            ],
            isError: true,
          };
        }

        const success = cancelTask(task_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success,
                message: success
                  ? "Task cancelled"
                  : "Task not found or already completed",
              }),
            },
          ],
        };
      }

      case "list_tasks": {
        const { status, limit } = args as {
          status?: string;
          limit?: number;
        };

        const tasks = listTasks({
          status: status as any,
          limit: limit ?? 10,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tasks: tasks.map((t) => ({
                  id: t.id,
                  agent: t.agentName,
                  category: t.categoryName,
                  status: t.status,
                  created: new Date(t.createdAt).toISOString(),
                  ...(t.completedAt && {
                    completed: new Date(t.completedAt).toISOString(),
                  }),
                  ...(t.error && { error: t.error }),
                })),
              }),
            },
          ],
        };
      }

      case "get_status": {
        const providers = getProvidersStatus();
        const concurrency = getConcurrencyStatus();

        // Cleanup old tasks periodically
        cleanupTasks();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                providers,
                concurrency,
                availableAgents: Object.keys(agents).filter(
                  (name) => agents[name]?.executionMode === "mcp"
                ),
              }),
            },
          ],
        };
      }

      // ---- Memory tools ----

      case "remember": {
        const { content, title, type, tags, scope } = args as {
          content: string;
          title?: string;
          type?: "note" | "session";
          tags?: string[];
          scope?: "project" | "global";
        };

        if (!content) {
          return {
            content: [{ type: "text", text: "Error: content is required" }],
            isError: true,
          };
        }

        const result = createMemory({ content, title, type, tags, scope });
        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        // Determine actual scope used
        const actualScope = scope ?? getDefaultWriteScope();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              stored: true,
              id: result.data!.id,
              title: result.data!.title,
              type: result.data!.type,
              tags: result.data!.tags,
              scope: actualScope,
            }),
          }],
        };
      }

      case "recall": {
        const { query, type, tags, limit, scope } = args as {
          query?: string;
          type?: "note" | "session";
          tags?: string[];
          limit?: number;
          scope?: MemoryScope;
        };

        const results = searchMemories({
          query,
          type,
          tags,
          limit: limit ?? 10,
          sort: "relevance",
          scope: scope ?? "all",
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: results.length,
              memories: results.map((r) => ({
                id: r.entry.id,
                title: r.entry.title,
                type: r.entry.type,
                tags: r.entry.tags,
                score: r.score,
                matchedFields: r.matchedFields,
                content: r.entry.content,
                createdAt: r.entry.createdAt,
                scope: (r.entry as any)._scope,
              })),
            }),
          }],
        };
      }

      case "forget": {
        const { id, scope } = args as { id: string; scope?: MemoryScope };

        if (!id) {
          return {
            content: [{ type: "text", text: "Error: id is required" }],
            isError: true,
          };
        }

        const result = deleteMemory(id, scope ?? "all");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              deleted: result.success,
              ...(result.error && { error: result.error }),
            }),
          }],
          ...(result.success ? {} : { isError: true }),
        };
      }

      case "list_memories": {
        const { type, limit, after, before, scope } = args as {
          type?: "note" | "session";
          limit?: number;
          after?: string;
          before?: string;
          scope?: MemoryScope;
        };

        const entries = listMemories({
          type,
          limit: limit ?? 20,
          after,
          before,
          scope: scope ?? "all",
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: entries.length,
              memories: entries.map((e) => ({
                id: e.id,
                title: e.title,
                type: e.type,
                tags: e.tags,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,
                scope: (e as any)._scope,
                preview: e.content.slice(0, 200) + (e.content.length > 200 ? "..." : ""),
              })),
            }),
          }],
        };
      }

      case "memory_status": {
        const stats = getMemoryStats();
        const projectDir = getProjectMemoryDir();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...stats,
              projectMemoryAvailable: projectDir !== null,
              defaultWriteScope: getDefaultWriteScope(),
            }),
          }],
        };
      }

      case "compact_memories": {
        const { mode, scope, groups, targetScope } = args as {
          mode: "analyze" | "execute";
          scope?: MemoryScope;
          groups?: Array<{ ids: string[]; title: string }>;
          targetScope?: "project" | "global";
        };

        if (mode === "analyze") {
          // Get all memories to analyze
          const entries = listMemories({ scope: scope ?? "all" });

          if (entries.length < 2) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  analyzed: true,
                  groups: [],
                  message: "Not enough memories to compact (need at least 2)",
                }),
              }],
            };
          }

          // Prepare memory summaries for AI analysis
          const memorySummaries = entries.map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            tags: e.tags,
            preview: e.content.slice(0, 300),
            scope: (e as any)._scope,
          }));

          const analysisPrompt = `You are a memory organization assistant. Analyze these memories and suggest groups that can be merged together.

## Memories to analyze:
${JSON.stringify(memorySummaries, null, 2)}

## Task:
1. Find memories that cover the same topic, are duplicates, or are closely related
2. Group them for merging (each group should have 2+ memories)
3. Suggest a title for each merged memory

## Rules:
- Only group memories that are truly related
- Keep distinct topics separate
- Prefer quality over quantity of groups
- Session memories can be grouped with notes if they cover the same topic

## Output format (JSON only, no explanation):
{
  "groups": [
    {
      "ids": ["memory-id-1", "memory-id-2"],
      "title": "Suggested merged title",
      "reason": "Brief reason for grouping"
    }
  ],
  "ungrouped": ["memory-ids-that-should-stay-separate"]
}`;

          // Try providers in order: zhipu -> minimax -> deepseek
          const providerOrder = ["zhipu", "minimax", "deepseek"];
          const modelMap: Record<string, string> = {
            zhipu: "glm-4.7",
            minimax: "MiniMax-M2.1",
            deepseek: "deepseek-chat",
          };

          let analysisResult: any = null;
          let usedProvider: string | null = null;

          for (const provider of providerOrder) {
            try {
              const model = modelMap[provider];
              if (!model || !isProviderConfigured(loadConfig(), provider)) {
                continue;
              }

              const response = await routeByModel(
                provider,
                model,
                [{ role: "user", content: analysisPrompt }],
                { temperature: 0.1 }
              );

              const responseText = response.choices[0]?.message?.content ?? "";
              // Extract JSON from response
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                analysisResult = JSON.parse(jsonMatch[0]);
                usedProvider = provider;
                break;
              }
            } catch (error) {
              // Try next provider
              continue;
            }
          }

          if (!analysisResult) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  analyzed: false,
                  error: "Failed to analyze memories. No AI provider available.",
                }),
              }],
              isError: true,
            };
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                analyzed: true,
                provider: usedProvider,
                totalMemories: entries.length,
                suggestedGroups: analysisResult.groups || [],
                ungrouped: analysisResult.ungrouped || [],
                message: "Review the suggested groups and call compact_memories with mode='execute' to merge.",
              }),
            }],
          };
        } else if (mode === "execute") {
          // Execute the merge for confirmed groups
          if (!groups || groups.length === 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  executed: false,
                  error: "No groups provided. Use mode='analyze' first to get suggestions.",
                }),
              }],
              isError: true,
            };
          }

          const results: Array<{
            group: string;
            success: boolean;
            newId?: string;
            error?: string;
          }> = [];

          for (const group of groups) {
            try {
              // Fetch all memories in the group
              const memories = group.ids
                .map((id) => getMemory(id))
                .filter((r) => r.success && r.data)
                .map((r) => r.data!);

              if (memories.length < 2) {
                results.push({
                  group: group.title,
                  success: false,
                  error: "Not enough valid memories in group",
                });
                continue;
              }

              // Merge content
              const mergedContent = memories
                .map((m) => `## ${m.title}\n\n${m.content}`)
                .join("\n\n---\n\n");

              // Merge tags (unique)
              const mergedTags = [...new Set(memories.flatMap((m) => m.tags))];

              // Create new merged memory
              const createResult = createMemory({
                title: group.title,
                content: mergedContent,
                tags: mergedTags,
                type: "note",
                scope: targetScope ?? getDefaultWriteScope(),
              });

              if (!createResult.success) {
                results.push({
                  group: group.title,
                  success: false,
                  error: createResult.error,
                });
                continue;
              }

              // Delete original memories
              for (const memory of memories) {
                deleteMemory(memory.id);
              }

              results.push({
                group: group.title,
                success: true,
                newId: createResult.data!.id,
              });
            } catch (error) {
              results.push({
                group: group.title,
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          const successful = results.filter((r) => r.success).length;
          const failed = results.filter((r) => !r.success).length;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                executed: true,
                successful,
                failed,
                results,
                message: `Compacted ${successful} group(s)${failed > 0 ? `, ${failed} failed` : ""}`,
              }),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Invalid mode. Use 'analyze' or 'execute'.",
            }),
          }],
          isError: true,
        };
      }

      // ---- Proxy switch tools ----

      case "switch_model": {
        const { provider, model, requests, timeout_ms } = args as {
          provider: string;
          model: string;
          requests?: number;
          timeout_ms?: number;
        };

        if (!provider || !model) {
          return {
            content: [{ type: "text", text: "Error: provider and model are required" }],
            isError: true,
          };
        }

        // Validate provider exists and is not claude-subscription
        const omcConfig = loadConfig();
        const providerConfig = omcConfig.providers[provider];
        if (!providerConfig) {
          return {
            content: [{
              type: "text",
              text: `Error: Unknown provider "${provider}". Available: ${Object.keys(omcConfig.providers).join(", ")}`,
            }],
            isError: true,
          };
        }

        if (providerConfig.type === "claude-subscription") {
          return {
            content: [{
              type: "text",
              text: `Error: Cannot switch to "${provider}" — it uses Claude subscription. Choose an external provider.`,
            }],
            isError: true,
          };
        }

        // Check provider is configured (API key set)
        if (!isProviderConfigured(omcConfig, provider)) {
          const envVar = providerConfig.api_key_env ?? `${provider.toUpperCase()}_API_KEY`;
          return {
            content: [{
              type: "text",
              text: `Error: Provider "${provider}" is not configured. Set ${envVar} environment variable.`,
            }],
            isError: true,
          };
        }

        const now = Date.now();
        const reqCount = requests ?? DEFAULT_PROXY_CONFIG.defaultRequests;
        // If unlimited (-1 requests), no timeout unless explicitly set
        const isUnlimited = reqCount < 0;
        const timeoutMs = timeout_ms ?? (isUnlimited ? 0 : DEFAULT_PROXY_CONFIG.defaultTimeoutMs);

        // Skip first 2 requests to account for slash command overhead:
        // 1. The MCP tool result processing (Claude reads switch_model response)
        // 2. The confirmation response to the user
        const SLASH_COMMAND_OVERHEAD = 2;

        const switchState: ProxySwitchState = {
          switched: true,
          provider,
          model,
          requestsRemaining: reqCount,
          switchedAt: now,
          timeoutAt: timeoutMs > 0 ? now + timeoutMs : undefined,
          skipInitialRequests: SLASH_COMMAND_OVERHEAD,
        };

        writeSwitchState(switchState);

        // Also try to notify the control API for immediate effect
        try {
          await fetch(`http://localhost:${DEFAULT_PROXY_CONFIG.controlPort}/switch`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ provider, model, requests: reqCount, timeout_ms: timeoutMs }),
          });
        } catch {
          // Control API not reachable — state file is the primary mechanism
        }

        const timeoutInfo = switchState.timeoutAt
          ? new Date(switchState.timeoutAt).toISOString()
          : "none (unlimited)";

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              switched: true,
              provider,
              model,
              requestsRemaining: reqCount,
              timeoutAt: timeoutInfo,
              unlimited: isUnlimited,
              message: isUnlimited
                ? `All requests will be routed to ${provider}/${model} until manually reverted`
                : `Next ${reqCount} request(s) will be routed to ${provider}/${model}`,
            }),
          }],
        };
      }

      case "switch_status": {
        const switchState = readSwitchState();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...switchState,
              ...(switchState.switchedAt && {
                switchedAtHuman: new Date(switchState.switchedAt).toISOString(),
              }),
              ...(switchState.timeoutAt && {
                timeoutAtHuman: new Date(switchState.timeoutAt).toISOString(),
                timeoutIn: Math.max(0, switchState.timeoutAt - Date.now()),
              }),
            }),
          }],
        };
      }

      case "switch_revert": {
        resetSwitchState();

        // Also try to notify the control API
        try {
          await fetch(`http://localhost:${DEFAULT_PROXY_CONFIG.controlPort}/revert`, {
            method: "POST",
          });
        } catch {
          // Control API not reachable — state file is the primary mechanism
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              switched: false,
              message: "Reverted to passthrough (native Claude)",
            }),
          }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Write initial status file for statusline display
  updateStatusFile();

  console.error("oh-my-claude Background Agent MCP Server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
