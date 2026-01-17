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
import { getProvidersStatus } from "../../providers/router";
import { agents } from "../../agents";

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
