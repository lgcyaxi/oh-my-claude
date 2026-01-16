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
} from "./task-manager";
import { getConcurrencyStatus } from "./concurrency";
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
- explore: Codebase search (DeepSeek chat)
- frontend-ui-ux: Visual/UI work (ZhiPu GLM-4v)
- document-writer: Documentation (MiniMax)

**Available Categories** (use 'category' parameter):
- ultrabrain: High-IQ reasoning tasks
- quick: Fast general tasks
- visual-engineering: UI/UX work
- writing: Documentation and text

**Fallback Behavior**:
If the provider's API key is not configured, the task will return with status "fallback_required" and include fallback info. When this happens, use Claude Code's Task tool with the specified fallback model instead.

Note: Agents using Claude subscription (sisyphus, claude-reviewer, claude-scout) should use Claude Code's Task tool instead.`,
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Agent name to use (oracle, librarian, explore, frontend-ui-ux, document-writer)",
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
          enum: ["pending", "running", "completed", "failed", "cancelled", "fallback_required"],
          description: "Filter by status. 'fallback_required' means the provider API key is not configured and Claude Task tool should be used instead.",
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
        const { agent, category, prompt, system_prompt } = args as {
          agent?: string;
          category?: string;
          prompt: string;
          system_prompt?: string;
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

      case "poll_task": {
        const { task_id } = args as { task_id: string };

        if (!task_id) {
          return {
            content: [{ type: "text", text: "Error: task_id is required" }],
            isError: true,
          };
        }

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
                  ...(t.fallback && { fallback: t.fallback }),
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
