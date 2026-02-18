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

/**
 * Parse a value that might be a stringified JSON array.
 * MCP sometimes passes arrays as JSON strings.
 */
function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      // Not a JSON string
    }
    return [value];
  }
  return [];
}

import {
  launchTask,
  pollTask,
  cancelTask,
  cancelAllTasks,
  listTasks,
  cleanupTasks,
  updateStatusFile,
  waitForTaskCompletion,
  waitForMultipleTasks,
  getConcurrencyStatus,
} from "./task-manager";
import { getProvidersStatus, routeByModel } from "../../providers/router";
import { agents } from "../../agents";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  createMemory,
  getMemory,
  deleteMemory,
  listMemories,
  getMemoryStats,
  searchMemories,
  getDefaultWriteScope,
  getProjectMemoryDir,
  getMemoryDir,
  MemoryIndexer,
  resolveEmbeddingProvider,
  hashContentSync,
  checkDuplicate,
  regenerateTimelines,
} from "../../memory";
import type { MemoryScope, EmbeddingProvider } from "../../memory";
import type { ProxySwitchState } from "../../proxy/types";
import { loadConfig, isProviderConfigured } from "../../config";
import { PreferenceStore } from "../../preferences";
import type {
  Preference,
  PreferenceScope as PrefScope,
  PreferenceTrigger,
  PreferenceContext,
  CreatePreferenceInput,
  PreferenceListOptions,
} from "../../preferences";

/**
 * Extract session ID from ANTHROPIC_BASE_URL environment variable.
 *
 * When `oh-my-claude cc` launches Claude Code in proxy mode, it sets
 * ANTHROPIC_BASE_URL to `http://localhost:18910/s/{sessionId}`.
 * The MCP server inherits this env var and can extract the session ID
 * to scope switch operations to the current session.
 *
 * @returns session ID string, or undefined if no session prefix
 */
function extractSessionIdFromEnv(): string | undefined {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the control API port from environment.
 *
 * `oh-my-claude cc` sets OMC_PROXY_CONTROL_PORT to the per-session proxy's control port.
 * Returns undefined when proxy is not available (plain `claude` without `oh-my-claude cc`).
 */
function resolveControlPort(): number | undefined {
  const envPort = process.env.OMC_PROXY_CONTROL_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Build the control API URL with optional session query parameter.
 * Returns null if proxy control port is not available.
 */
function controlUrl(path: string, sessionId?: string): string | null {
  const port = resolveControlPort();
  if (!port) return null;
  const base = `http://localhost:${port}${path}`;
  return sessionId ? `${base}?session=${sessionId}` : base;
}

/** Cached session ID (extracted once at startup) */
let cachedSessionId: string | undefined;

// Tool definitions
const tools: Tool[] = [
  {
    name: "launch_background_task",
    description: `Launch a background task using an external AI provider.

Use this for async operations that should run in parallel without blocking.

**Available Agents** (use 'agent' parameter):
- oracle: Deep reasoning, architecture advice (OpenAI GPT-5.2 / DeepSeek reasoner)
- librarian: External docs, library research (ZhiPu GLM)
- analyst: Code analysis, patterns (DeepSeek chat)
- frontend-ui-ux: Visual/UI work (Google Gemini 3 Pro / ZhiPu GLM-4v)
- document-writer: Documentation (MiniMax)
- hephaestus: Deep code implementation, complex refactoring (OpenAI Codex)
- navigator: Multimodal task execution, visual-to-code, document processing (Kimi K2.5)

**Available Categories** (use 'category' parameter):
- ultrabrain: High-IQ reasoning tasks
- quick: Fast general tasks
- visual-engineering: UI/UX work
- writing: Documentation and text
- deep-coding: Intensive code generation (OpenAI Codex)
- visual-execution: Multimodal task execution (Kimi K2.5)

Note: Agents using Claude subscription (sisyphus, claude-reviewer, claude-scout) should use Claude Code's Task tool instead.

**Fallback**: If a provider is unavailable (API key not set, auth error, or network issue), the result will start with \`[omc-fallback]\`. When you see this, handle the task yourself using Claude's built-in Task tool with an appropriate subagent (e.g., haiku for quick tasks, sonnet for complex ones) — do NOT report it as an error to the user.`,
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Agent name to use (oracle, analyst, librarian, frontend-ui-ux, document-writer, hephaestus, navigator)",
        },
        category: {
          type: "string",
          description:
            "Category to use instead of agent (ultrabrain, quick, visual-engineering, writing, visual-execution)",
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
        conversation_context: {
          type: "string",
          description: "Optional conversation context to pass to the agent. Include recent discussion, decisions made, or relevant background that helps the agent understand the task better. The agent orchestrating the task (e.g., Sisyphus) should summarize relevant context here.",
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
- oracle: Deep reasoning, architecture advice (OpenAI GPT-5.2 / DeepSeek reasoner)
- librarian: External docs, library research (ZhiPu GLM)
- analyst: Code analysis, patterns (DeepSeek chat)
- frontend-ui-ux: Visual/UI work (Google Gemini 3 Pro / ZhiPu GLM-4v)
- document-writer: Documentation (MiniMax)
- hephaestus: Deep code implementation, complex refactoring (OpenAI Codex)
- navigator: Multimodal task execution, visual-to-code, document processing (Kimi K2.5)

**Available Categories** (use 'category' parameter):
- ultrabrain: High-IQ reasoning tasks
- quick: Fast general tasks
- visual-engineering: UI/UX work
- writing: Documentation and text
- deep-coding: Intensive code generation (OpenAI Codex)
- visual-execution: Multimodal task execution (Kimi K2.5)

**Timeout Behavior**:
If the task takes longer than the timeout (default: 5 minutes), returns the task_id so you can poll manually with poll_task.

For parallel execution of multiple agents, use launch_background_task + poll_task instead.

**Fallback**: If a provider is unavailable, the result will start with \`[omc-fallback]\`. When you see this, handle the task yourself using Claude's built-in Task tool with an appropriate subagent (e.g., haiku for quick tasks, sonnet for complex ones) — do NOT report it as an error to the user.`,
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent name (oracle, analyst, librarian, frontend-ui-ux, document-writer, hephaestus, navigator)",
        },
        category: {
          type: "string",
          description: "Category (ultrabrain, quick, visual-engineering, writing, visual-execution)",
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
        conversation_context: {
          type: "string",
          description: "Optional conversation context to pass to the agent. Include recent discussion, decisions made, or relevant background that helps the agent understand the task better. The agent orchestrating the task (e.g., Sisyphus) should summarize relevant context here.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "execute_with_model",
    description: `Execute a prompt with an explicit provider and model (blocking).

Use this for direct model access without agent/category routing. Saves tokens by bypassing agent system prompts.

**Available Providers**: deepseek, zhipu, minimax (must be configured with API key)

**Example Models**:
- deepseek: deepseek-reasoner, deepseek-chat
- zhipu: GLM-5, glm-4v-flash
- minimax: MiniMax-M2.5
- kimi: K2.5

**Timeout Behavior**:
If the task takes longer than the timeout (default: 5 minutes), returns the task_id so you can poll manually with poll_task.`,
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "Provider name (e.g., deepseek, zhipu, minimax)",
        },
        model: {
          type: "string",
          description: "Model name (e.g., deepseek-reasoner, GLM-5, MiniMax-M2.5, K2.5)",
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
    name: "wait_for_tasks",
    description: "Block until one or more background tasks complete. Use this instead of repeated poll_task calls to save tokens. Supports 'any' mode (return on first completion) or 'all' mode (wait for all).",
    inputSchema: {
      type: "object",
      properties: {
        task_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of task IDs to wait for",
        },
        mode: {
          type: "string",
          enum: ["all", "any"],
          description: "Wait mode: 'all' waits for every task (default), 'any' returns on first completion",
        },
        timeout_seconds: {
          type: "number",
          description: "Maximum wait time in seconds (default: 300, max: 300)",
        },
      },
      required: ["task_ids"],
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
    name: "get_memory",
    description: "Read the full content of a specific memory by ID. Use this to drill down after recall returns snippets.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The memory ID to retrieve",
        },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "Where to search (default: all)",
        },
      },
      required: ["id"],
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
        type: {
          type: "string",
          enum: ["note", "session", "all"],
          description: "Filter by memory type. Default: 'note' (sessions excluded — use /omc-mem-daily for sessions)",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "clear_memories",
    description: `AI-powered selective memory cleanup. Analyzes memories and identifies outdated, redundant, or irrelevant ones for removal.

Flow:
1. AI reviews all memories and identifies candidates for deletion (ZhiPu -> MiniMax -> DeepSeek)
2. Returns deletion candidates with reasons
3. User confirms which to delete
4. Call again with 'execute' mode to perform deletion

Unlike forget (which deletes by ID), this uses AI judgment to identify what's no longer needed.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["analyze", "execute"],
          description: "Mode: 'analyze' to get deletion candidates, 'execute' to delete confirmed ones",
        },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "Which memories to analyze (default: all)",
        },
        ids: {
          type: "array",
          items: { type: "string" },
          description: "For 'execute' mode: memory IDs to delete (from analyze results)",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "summarize_memories",
    description: `Consolidate memories from a date range into a single timeline summary.

Flow:
1. Collects all memories within the specified date range
2. AI creates a consolidated timeline summary (ZhiPu -> MiniMax -> DeepSeek)
3. Returns preview of the summary with keyword-rich tags for retrieval
4. User confirms to save the summary (originals are deleted by default)

Use this to condense many fine-grained memories into a single coherent overview.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["analyze", "execute"],
          description: "Mode: 'analyze' to preview summary, 'execute' to save it",
        },
        days: {
          type: "number",
          description: "Number of past days to include (default: 7). E.g., 7 = last 7 days",
        },
        after: {
          type: "string",
          description: "Start date (ISO 8601). Overrides 'days' if provided",
        },
        before: {
          type: "string",
          description: "End date (ISO 8601). Defaults to now",
        },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "Which memories to include (default: all)",
        },
        summary: {
          type: "string",
          description: "For 'execute' mode: the AI-generated summary text to save",
        },
        title: {
          type: "string",
          description: "For 'execute' mode: title for the summary memory",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "For 'execute' mode: tags for the summary memory (from analyze suggestedTags). Includes all keywords from originals for retrieval.",
        },
        archiveOriginals: {
          type: "boolean",
          description: "For 'execute' mode: whether to delete original memories after saving summary (default: true)",
        },
        originalIds: {
          type: "array",
          items: { type: "string" },
          description: "For 'execute' mode: IDs of original memories to delete after saving",
        },
        targetScope: {
          type: "string",
          enum: ["project", "global"],
          description: "For 'execute' mode: where to save the summary (default: auto-detect)",
        },
        outputType: {
          type: "string",
          enum: ["note", "session"],
          description: "For 'execute' mode: memory type for the saved summary (default: note)",
        },
        createdAt: {
          type: "string",
          description: "For 'execute' mode: override the date used in the memory ID (ISO 8601 or YYYY-MM-DD). If omitted, auto-detects from title (e.g., 'Daily Narrative: 2026-02-14' → 2026-02-14).",
        },
      },
      required: ["mode"],
    },
  },
  // Preference tools
  {
    name: "add_preference",
    description: `Create a new preference rule. Preferences are "always do X" or "never do Y" rules that get auto-injected into relevant sessions.

Examples:
- "Never use co-author in git commits"
- "Always use TypeScript strict mode"
- "Prefer functional components over class components"`,
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short rule title (e.g., 'Never use co-author in commits')",
        },
        content: {
          type: "string",
          description: "Detailed rule content explaining the preference",
        },
        scope: {
          type: "string",
          enum: ["global", "project"],
          description: "Storage scope: 'global' (cross-project) or 'project' (.claude/). Default: global",
        },
        autoInject: {
          type: "boolean",
          description: "Whether to auto-inject into matching sessions (default: true)",
        },
        trigger: {
          type: "object",
          description: "When to activate this preference",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Keywords that activate this preference (matched against user prompt)",
            },
            categories: {
              type: "array",
              items: { type: "string" },
              description: "Task categories that activate this preference (e.g., 'git', 'testing')",
            },
            always: {
              type: "boolean",
              description: "If true, always inject regardless of context",
            },
          },
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization and search",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "list_preferences",
    description: "List all preferences with optional filtering by scope, tags, or auto-inject status.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["global", "project"],
          description: "Filter by scope",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (any match)",
        },
        autoInject: {
          type: "boolean",
          description: "Filter by auto-inject status",
        },
        limit: {
          type: "number",
          description: "Maximum results to return",
        },
      },
    },
  },
  {
    name: "get_preference",
    description: "Get a specific preference by its ID. Returns full details including trigger configuration.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The preference ID (format: pref-YYYYMMDD-slug)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_preference",
    description: "Update an existing preference. Only provided fields are changed.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The preference ID to update",
        },
        updates: {
          type: "object",
          description: "Fields to update",
          properties: {
            title: { type: "string", description: "New title" },
            content: { type: "string", description: "New content" },
            autoInject: { type: "boolean", description: "New auto-inject status" },
            trigger: {
              type: "object",
              properties: {
                keywords: { type: "array", items: { type: "string" } },
                categories: { type: "array", items: { type: "string" } },
                always: { type: "boolean" },
              },
            },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["id", "updates"],
    },
  },
  {
    name: "delete_preference",
    description: "Delete a preference by its ID. Searches both global and project scopes.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The preference ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "match_preferences",
    description: "Find preferences that match the current context. Returns matched preferences ranked by relevance score.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Current user prompt or message to match against",
        },
        category: {
          type: "string",
          description: "Current task category (e.g., 'git', 'testing', 'refactoring')",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Additional context keywords",
        },
      },
    },
  },
  {
    name: "preference_stats",
    description: "Get preference store statistics including counts by scope and auto-inject status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // Proxy switch tools
  {
    name: "switch_model",
    description: `Switch all Claude Code requests to an external provider via the proxy.

Requires the oh-my-claude proxy to be running (oh-my-claude proxy start).
Stays switched until manually reverted with switch_revert.

**Available Providers** (must be configured with API key or OAuth):
- deepseek: deepseek-reasoner, deepseek-chat
- zhipu: GLM-5, glm-4v-flash
- minimax: MiniMax-M2.5
- kimi: K2.5
- openai: gpt-5.2, gpt-5.3-codex, o3-mini (OAuth: oh-my-claude auth login openai)
**Example**: switch_model(provider="deepseek", model="deepseek-reasoner")
This routes all subsequent Claude Code requests through DeepSeek's reasoner model.`,
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "Provider name (deepseek, zhipu, minimax, kimi, openai)",
        },
        model: {
          type: "string",
          description: "Model name (e.g., deepseek-reasoner, GLM-5, MiniMax-M2.5, K2.5, gpt-5.3-codex)",
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
  {
    name: "bridge_send",
    description: `Send a task to a running CLI tool (codex, opencode, gemini, cc) via the Multi-AI Bridge.

Requires the AI to be started first with \`oh-my-claude bridge up <ai>\`.
Sends the message to the AI's terminal pane and optionally polls for a response.
For codex/opencode: polls storage adapters (JSONL/files). For cc: polls pane output.

Use \`bridge up cc --switch ds\` to spawn a CC worker pre-switched to DeepSeek.
Multiple CC instances supported: cc, cc:2, cc:3 (each with its own proxy session).

Use this tool to delegate tasks to other AI coding assistants running alongside Claude.`,
    inputSchema: {
      type: "object",
      properties: {
        ai_name: {
          type: "string",
          description: "Name of the AI assistant to send the message to. Supports: codex, opencode, gemini, cc, cc:2, cc:N",
        },
        message: {
          type: "string",
          description: "The task or message to send to the AI assistant",
        },
        wait_for_response: {
          type: "boolean",
          default: true,
          description: "Whether to poll for a response from the AI (default: true)",
        },
        timeout_ms: {
          type: "number",
          default: 120000,
          description: "Response timeout in milliseconds (default: 120000 = 2 minutes)",
        },
        auto_close: {
          type: "boolean",
          default: false,
          description: "Automatically close the AI pane after receiving a response (default: false). Set to true to kill the pane after getting a response.",
        },
      },
      required: ["ai_name", "message"],
    },
  },
];

// Cached project root from MCP roots/list (populated at startup)
// This avoids cwd() dependency for multi-instance project isolation
let cachedProjectRoot: string | undefined;

// Cached PreferenceStore (lazy init, scoped to project root)
let cachedPrefStore: PreferenceStore | null = null;

function getPrefStore(): PreferenceStore {
  if (!cachedPrefStore) {
    cachedPrefStore = new PreferenceStore(cachedProjectRoot);
  }
  return cachedPrefStore;
}

// Cached indexer + embedding provider (lazy init on first memory tool call)
let cachedIndexer: MemoryIndexer | null = null;
let cachedEmbeddingProvider: EmbeddingProvider | null = null;
let indexerInitPromise: Promise<void> | null = null;

/** Best-effort timeline regeneration after any memory mutation */
function afterMemoryMutation(): void {
  try { regenerateTimelines(cachedProjectRoot); } catch { /* best-effort */ }
}

/**
 * Lazily initialize the SQLite indexer and embedding provider.
 * Called before recall/remember/forget/memory_status operations.
 * Safe to call multiple times — only initializes once.
 */
async function ensureIndexer(): Promise<void> {
  if (cachedIndexer?.isReady()) return;
  if (indexerInitPromise) {
    await indexerInitPromise;
    return;
  }

  indexerInitPromise = (async () => {
    try {
      const dbPath = join(homedir(), ".claude", "oh-my-claude", "memory", "index.db");
      cachedIndexer = new MemoryIndexer({ dbPath });
      await cachedIndexer.init();

      // Resolve embedding provider (explicit selection from config)
      const config = loadConfig();
      cachedEmbeddingProvider = await resolveEmbeddingProvider(config.memory?.embedding);

      // Sync all memory files into the index
      const memoryDirs = getMemoryDirsForSync();
      if (memoryDirs.length > 0) {
        await cachedIndexer.syncFiles(memoryDirs);
        await cachedIndexer.flush();
      }

      // Regenerate timeline on startup for freshness
      afterMemoryMutation();

      const tier = cachedIndexer.isReady() && cachedEmbeddingProvider
        ? "hybrid"
        : cachedIndexer.isReady()
          ? "fts5"
          : "legacy";
      console.error(`[oh-my-claude] Indexer ready (tier: ${tier}, embeddings: ${cachedEmbeddingProvider ? "available" : "none"})`);
    } catch (e) {
      console.error("[oh-my-claude] Indexer init failed (falling back to legacy search):", e);
      cachedIndexer = null;
      cachedEmbeddingProvider = null;
    }
  })();

  await indexerInitPromise;
}

/**
 * Build the list of memory directories to sync into the index.
 */
function getMemoryDirsForSync(): Array<{ path: string; scope: "project" | "global"; projectRoot?: string }> {
  const dirs: Array<{ path: string; scope: "project" | "global"; projectRoot?: string }> = [];

  // Global memory directory
  const globalDir = getMemoryDir();
  dirs.push({ path: globalDir, scope: "global" });

  // Project memory directory (if in a git repo)
  if (cachedProjectRoot) {
    const projectDir = getProjectMemoryDir(cachedProjectRoot);
    if (projectDir) {
      dirs.push({ path: projectDir, scope: "project", projectRoot: cachedProjectRoot });
    }
  }

  return dirs;
}

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
        const { agent, category, prompt, system_prompt, context_hints, conversation_context } = args as {
          agent?: string;
          category?: string;
          prompt: string;
          system_prompt?: string;
          context_hints?: {
            keywords?: string[];
            file_patterns?: string[];
            skip_context?: boolean;
          };
          conversation_context?: string;
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
          conversationContext: conversation_context,
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
        const { agent, category, prompt, system_prompt, timeout_ms, context_hints, conversation_context } = args as {
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
          conversation_context?: string;
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
          conversationContext: conversation_context,
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
          const timeoutMs = Math.min(wait_seconds * 1000, 300_000); // Cap at 300 seconds
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

      case "wait_for_tasks": {
        const { task_ids, mode, timeout_seconds } = args as {
          task_ids: string[];
          mode?: "all" | "any";
          timeout_seconds?: number;
        };

        if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
          return {
            content: [{ type: "text", text: "Error: task_ids array is required and must not be empty" }],
            isError: true,
          };
        }

        const timeoutMs = Math.min((timeout_seconds ?? 300) * 1000, 300_000);
        const result = await waitForMultipleTasks(task_ids, mode ?? "all", timeoutMs);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result),
          }],
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

        // Initialize indexer for dedup check
        await ensureIndexer();

        // Dedup check: skip exact duplicates, tag near-duplicates
        const contentHash = hashContentSync(content);
        const dedupResult = await checkDuplicate(
          content,
          contentHash,
          cachedIndexer,
          cachedEmbeddingProvider,
        );

        if (dedupResult.isDuplicate) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                stored: false,
                reason: "exact_duplicate",
                existingId: dedupResult.exactMatch,
                message: `Exact duplicate of existing memory "${dedupResult.exactMatch}". Skipped.`,
              }),
            }],
          };
        }

        // Add near-duplicate tag if similar memories found
        const memTags = [...(tags ?? [])];
        let nearDupeInfo: { existingId: string; similarity: number } | undefined;
        if (dedupResult.nearDuplicates.length > 0) {
          const top = dedupResult.nearDuplicates[0]!;
          memTags.push(`potential-duplicate:${top.id}`);
          nearDupeInfo = { existingId: top.id, similarity: top.similarity };
        }

        const result = createMemory(
          { content, title, type, tags: memTags, scope },
          cachedProjectRoot,
        );
        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        // Index the new file in the background
        if (cachedIndexer?.isReady() && result.data) {
          try {
            const actualScope = scope ?? getDefaultWriteScope(cachedProjectRoot);
            const memDir = actualScope === "project" && cachedProjectRoot
              ? getProjectMemoryDir(cachedProjectRoot)
              : getMemoryDir();
            if (memDir) {
              const subdir = (result.data.type === "session") ? "sessions" : "notes";
              const filePath = join(memDir, subdir, `${result.data.id}.md`);
              await cachedIndexer.indexFile(filePath, actualScope, cachedProjectRoot);
              await cachedIndexer.flush();
            }
          } catch (e) {
            console.error("[oh-my-claude] Post-write indexing failed:", e);
          }
        }

        // Regenerate timeline after remember
        afterMemoryMutation();

        const actualScope = scope ?? getDefaultWriteScope(cachedProjectRoot);
        const reason = nearDupeInfo ? "near_duplicate_tagged" : "created";

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
              reason,
              ...(nearDupeInfo && {
                nearDuplicate: nearDupeInfo,
              }),
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

        // Initialize indexer for tiered search
        await ensureIndexer();

        const results = await searchMemories(
          {
            query,
            type,
            tags,
            limit: limit ?? 5,
            sort: "relevance",
            scope: scope ?? "all",
          },
          cachedProjectRoot,
          {
            indexer: cachedIndexer,
            embeddingProvider: cachedEmbeddingProvider,
          },
        );

        // Determine which tier was used
        const searchTier = results.length > 0
          ? (results[0]!.searchTier ?? "legacy")
          : (cachedIndexer?.isReady() && cachedEmbeddingProvider
              ? "hybrid"
              : cachedIndexer?.isReady()
                ? "fts5"
                : "legacy");

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: results.length,
              searchTier,
              memories: results.map((r) => ({
                id: r.entry.id,
                title: r.entry.title,
                type: r.entry.type,
                tags: r.entry.tags,
                score: r.score,
                snippet: r.snippet ?? r.entry.content.slice(0, 300) + (r.entry.content.length > 300 ? "..." : ""),
                chunkLocation: r.chunkLocation,
                scope: (r.entry as any)._scope,
                createdAt: r.entry.createdAt,
              })),
            }),
          }],
        };
      }

      case "get_memory": {
        const { id, scope } = args as { id: string; scope?: MemoryScope };

        if (!id) {
          return {
            content: [{ type: "text", text: "Error: id is required" }],
            isError: true,
          };
        }

        const memResult = getMemory(id, scope ?? "all", cachedProjectRoot);
        if (!memResult.success || !memResult.data) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                found: false,
                error: memResult.error ?? "Memory not found",
              }),
            }],
            isError: true,
          };
        }

        const entry = memResult.data;
        const totalLines = entry.content.split("\n").length;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              id: entry.id,
              title: entry.title,
              type: entry.type,
              tags: entry.tags,
              content: entry.content,
              totalLines,
              scope: (entry as any)._scope,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
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

        // Find the memory first to get file path for index cleanup
        const memToDelete = getMemory(id, scope ?? "all", cachedProjectRoot);
        const result = deleteMemory(id, scope ?? "all", cachedProjectRoot);

        // Ensure indexer is ready for cleanup
        await ensureIndexer();

        // Clean up index entries if deletion succeeded
        let indexCleaned = false;
        if (result.success && cachedIndexer?.isReady()) {
          try {
            // Determine file path from memory scope and ID
            const entry = memToDelete.data;
            if (entry) {
              const entryScope = (entry as any)._scope as string | undefined;
              const subdir = entry.type === "session" ? "sessions" : "notes";

              if (entryScope === "project" && cachedProjectRoot) {
                const projDir = getProjectMemoryDir(cachedProjectRoot);
                if (projDir) {
                  await cachedIndexer.removeFile(join(projDir, subdir, `${id}.md`));
                  indexCleaned = true;
                }
              } else {
                await cachedIndexer.removeFile(join(getMemoryDir(), subdir, `${id}.md`));
                indexCleaned = true;
              }

              if (indexCleaned) await cachedIndexer.flush();
            }
          } catch (e) {
            console.error("[oh-my-claude] Index cleanup after forget failed:", e);
          }
        }

        // Regenerate timeline after forget
        afterMemoryMutation();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              deleted: result.success,
              indexCleaned,
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
        }, cachedProjectRoot);

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
        const stats = getMemoryStats(cachedProjectRoot);
        const projectDir = getProjectMemoryDir(cachedProjectRoot);

        // Ensure indexer is ready for accurate status reporting
        await ensureIndexer();

        // Get index status if indexer is available
        let indexStatus: Record<string, any> | undefined;
        if (cachedIndexer?.isReady()) {
          try {
            const idxStats = await cachedIndexer.getStats();
            const dbPath = join(homedir(), ".claude", "oh-my-claude", "memory", "index.db");
            const searchTier = cachedEmbeddingProvider ? "hybrid" : "fts5";

            indexStatus = {
              initialized: true,
              dbPath,
              ...idxStats,
              embeddingProvider: cachedEmbeddingProvider
                ? `${cachedEmbeddingProvider.name}/${cachedEmbeddingProvider.model}`
                : null,
              searchTier,
            };
          } catch {
            indexStatus = { initialized: false };
          }
        } else {
          indexStatus = {
            initialized: false,
            searchTier: "legacy",
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...stats,
              projectMemoryAvailable: projectDir !== null,
              defaultWriteScope: getDefaultWriteScope(cachedProjectRoot),
              indexStatus,
            }),
          }],
        };
      }

      case "compact_memories": {
        const { mode, scope, groups, targetScope, type } = args as {
          mode: "analyze" | "execute";
          scope?: MemoryScope;
          groups?: Array<{ ids: string[]; title: string }>;
          targetScope?: "project" | "global";
          type?: "note" | "session" | "all";  // Filter by memory type (default: "note")
        };

        // Default to notes only for compact (use /omc-mem-daily for sessions)
        const typeFilter = type ?? "note";

        if (mode === "analyze") {
          // Get memories to analyze, filtered by type
          const allEntries = listMemories({ scope: scope ?? "all" }, cachedProjectRoot);
          const entries = typeFilter === "all"
            ? allEntries
            : allEntries.filter(e => e.type === typeFilter);

          if (entries.length < 2) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  analyzed: true,
                  groups: [],
                  message: `Not enough ${typeFilter === "all" ? "" : typeFilter + " "}memories to compact (need at least 2)`,
                  typeFilter,
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

          const analysisPrompt = `You are a memory organization assistant. Analyze these ${typeFilter === "all" ? "" : typeFilter + " "}memories and suggest groups that can be merged together.

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
            zhipu: "GLM-5",
            minimax: "MiniMax-M2.5",
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
                .map((id) => getMemory(id, "all", cachedProjectRoot))
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

              // Merge content — strip duplicate title headings from each memory
              const mergedContent = memories
                .map((m) => {
                  let content = m.content;
                  // If the content starts with a ## heading that matches (or is similar to) the memory title,
                  // strip it to avoid duplication since we add our own section heading
                  const headingMatch = content.match(/^##\s+(.+)\n/);
                  if (headingMatch) {
                    // Strip the first heading — we'll add a clean one
                    content = content.replace(/^##\s+.+\n+/, "");
                  }
                  return `### ${m.title}\n\n${content.trim()}`;
                })
                .join("\n\n---\n\n");

              // Merge tags (unique)
              const mergedTags = [...new Set(memories.flatMap((m) => m.tags))];

              // Use the latest createdAt from the group (preserve original date context)
              const latestCreatedAt = memories
                .map((m) => m.createdAt)
                .filter(Boolean)
                .sort()
                .pop() || new Date().toISOString();

              // Create new merged memory
              const createResult = createMemory({
                title: group.title,
                content: mergedContent,
                tags: mergedTags,
                type: "note",
                createdAt: latestCreatedAt,
                scope: targetScope ?? getDefaultWriteScope(cachedProjectRoot),
              }, cachedProjectRoot);

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
                deleteMemory(memory.id, "all", cachedProjectRoot);
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

          // Regenerate timeline after compact
          afterMemoryMutation();

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

      case "clear_memories": {
        const { mode, scope, ids } = args as {
          mode: "analyze" | "execute";
          scope?: MemoryScope;
          ids?: string[];
        };

        // Parse ids properly - MCP sometimes passes arrays as JSON strings
        const parsedIds = parseStringArray(ids);

        if (mode === "analyze") {
          const entries = listMemories({ scope: scope ?? "all" }, cachedProjectRoot);

          if (entries.length === 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  analyzed: true,
                  candidates: [],
                  message: "No memories found to analyze.",
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
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            preview: e.content.slice(0, 300),
            scope: (e as any)._scope,
          }));

          const analysisPrompt = `You are a memory cleanup assistant. Analyze these memories and identify ones that should be deleted because they are outdated, redundant, or no longer useful.

## Memories to analyze:
${JSON.stringify(memorySummaries, null, 2)}

## Task:
1. Identify memories that are outdated (old session logs, stale context)
2. Identify memories that are redundant (duplicates, superseded by newer info)
3. Identify memories that are trivial or no longer useful
4. Provide a clear reason for each deletion candidate

## Rules:
- Be conservative — only suggest deletion for clearly unneeded memories
- Session memories older than 14 days are good candidates
- Keep architectural decisions, conventions, and important patterns
- Keep memories that document bugs, fixes, or lessons learned
- If unsure, do NOT suggest deletion

## Output format (JSON only, no explanation):
{
  "candidates": [
    {
      "id": "memory-id",
      "title": "Memory Title",
      "reason": "Why this should be deleted",
      "confidence": "high" | "medium"
    }
  ],
  "keep": [
    {
      "id": "memory-id",
      "title": "Memory Title",
      "reason": "Why this should be kept"
    }
  ]
}`;

          // Try providers in order: zhipu -> minimax -> deepseek
          const providerOrder = ["zhipu", "minimax", "deepseek"];
          const modelMap: Record<string, string> = {
            zhipu: "GLM-5",
            minimax: "MiniMax-M2.5",
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
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                analysisResult = JSON.parse(jsonMatch[0]);
                usedProvider = provider;
                break;
              }
            } catch {
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
                candidates: analysisResult.candidates || [],
                keep: analysisResult.keep || [],
                message: "Review the deletion candidates and call clear_memories with mode='execute' and ids=[...] to delete.",
              }),
            }],
          };
        } else if (mode === "execute") {
          if (!ids || ids.length === 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  executed: false,
                  error: "No IDs provided. Use mode='analyze' first to get candidates.",
                }),
              }],
              isError: true,
            };
          }

          // Clean up index if available
          await ensureIndexer();

          const results: Array<{
            id: string;
            success: boolean;
            title?: string;
            error?: string;
          }> = [];

          for (const id of parsedIds) {
            try {
              // Get memory info before deletion for reporting
              const memResult = getMemory(id, "all", cachedProjectRoot);
              const title = memResult.data?.title ?? id;
              const createdAt = memResult.data?.createdAt ?? new Date().toISOString();
              const type = memResult.data?.type ?? "note";
              const memScope = (memResult.data as any)?._scope ?? "project";

              const deleteResult = deleteMemory(id, "all", cachedProjectRoot);
              if (deleteResult.success) {
                // Save cleared entry for Timeline (preserves "what was done" without content/tags)
                try {
                  const { saveClearedEntry } = await import("../../memory/timeline");
                  saveClearedEntry({
                    id,
                    title,
                    createdAt,
                    clearedAt: new Date().toISOString(),
                    type: type as "note" | "session",
                  }, memScope as "project" | "global", cachedProjectRoot);
                } catch {
                  // Timeline recording is best-effort
                }

                // Clean index entry
                if (cachedIndexer) {
                  try {
                    cachedIndexer.removeFile(id);
                  } catch {
                    // Index cleanup is best-effort
                  }
                }
                results.push({ id, success: true, title });
              } else {
                results.push({ id, success: false, title, error: deleteResult.error });
              }
            } catch (error) {
              results.push({
                id,
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Regenerate timeline after clear
          afterMemoryMutation();

          const deleted = results.filter((r) => r.success).length;
          const failed = results.filter((r) => !r.success).length;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                executed: true,
                deleted,
                failed,
                results,
                message: `Cleared ${deleted} memory(s)${failed > 0 ? `, ${failed} failed` : ""}`,
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

      case "summarize_memories": {
        const { mode, days, after, before, scope, summary, title, tags: executeTags, archiveOriginals, originalIds, targetScope, type, narrative, dateRange, outputType, createdAt: explicitCreatedAt } = args as {
          mode: "analyze" | "execute";
          days?: number;
          after?: string;
          before?: string;
          scope?: MemoryScope;
          summary?: string;
          title?: string;
          tags?: string[];
          archiveOriginals?: boolean;
          originalIds?: string[];
          targetScope?: "project" | "global";
          type?: "note" | "session" | "all";  // Filter by memory type
          narrative?: boolean;  // Use narrative format for daily consolidation
          dateRange?: { start: string; end: string };  // Specific date range for daily narrative
          outputType?: "note" | "session";  // Memory type for the saved summary
          createdAt?: string;  // Override date used in memory ID
        };

        // Parse originalIds properly - MCP sometimes passes arrays as JSON strings
        const parsedOriginalIds = parseStringArray(originalIds);

        if (mode === "analyze") {
          // Calculate date range
          const now = new Date();
          let endDate: string;
          let startDate: string;

          // Support specific date range for daily narrative mode
          if (dateRange) {
            startDate = dateRange.start;
            endDate = dateRange.end;
          } else if (after) {
            startDate = after;
            endDate = before ?? now.toISOString();
          } else {
            const daysBack = days ?? 7;
            const start = new Date(now);
            start.setDate(start.getDate() - daysBack);
            startDate = start.toISOString();
            endDate = before ?? now.toISOString();
          }

          const allEntries = listMemories({
            scope: scope ?? "all",
            after: startDate,
            before: endDate,
          }, cachedProjectRoot);

          // Filter by type if specified
          const typeFilter = type ?? "all";
          const entries = typeFilter === "all"
            ? allEntries
            : allEntries.filter(e => e.type === typeFilter);

          if (entries.length === 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  analyzed: true,
                  summary: null,
                  message: `No ${typeFilter === "all" ? "" : typeFilter + " "}memories found in the specified date range (${startDate.slice(0, 10)} to ${endDate.slice(0, 10)}).`,
                  typeFilter,
                }),
              }],
            };
          }

          // Prepare full memories for AI summarization
          const memoryDetails = entries.map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            tags: e.tags,
            createdAt: e.createdAt,
            content: e.content.slice(0, 1000),
            scope: (e as any)._scope,
          }));

          const dateRangeLabel = `${startDate.slice(0, 10)} to ${endDate.slice(0, 10)}`;
          // Collect all existing tags from original memories for keyword aggregation
          const allOriginalTags = new Set<string>();
          for (const m of memoryDetails) {
            if (m.tags) for (const t of m.tags) allOriginalTags.add(t);
          }

          // Choose prompt based on narrative mode
          const summarizePrompt = narrative
            ? `You are creating a daily session narrative. Merge these session summaries from ${dateRangeLabel} into ONE chronological story.

## Sessions to consolidate:
${JSON.stringify(memoryDetails, null, 2)}

## Task:
Create a chronological narrative that tells the story of what happened during this day.

## Output format:
### Session Flow
Describe what happened first, then what happened next, in chronological order based on session timestamps.

### Key Accomplishments
- Bullet list of concrete achievements

### Decisions Made
- Bullet list of architectural or design decisions with rationale

### Patterns & Gotchas Discovered
- Bullet list of reusable knowledge

## Rules:
- Maintain chronological flow based on session timestamps
- Deduplicate repeated content
- Preserve specific technical details (file paths, commands, APIs)
- Remove redundant "session started" or "session ended" phrasing
- Keep it concise but actionable (400-800 words max)

## Tags (CRITICAL for retrieval):
Include all important keywords from the sessions: ${[...allOriginalTags].join(", ") || "(none)"}

## Output format (JSON only):
{
  "title": "Daily Narrative: ${dateRangeLabel.split(" to ")[0]}",
  "summary": "## Daily Narrative: ...\\n\\n### Session Flow\\n...",
  "tags": ["keyword1", "keyword2", ...],
  "memoriesIncluded": <count>
}`
            : `You are a memory summarization assistant. Create a consolidated timeline summary of these memories.

## Date Range: ${dateRangeLabel}

## Memories to summarize:
${JSON.stringify(memoryDetails, null, 2)}

## Task:
1. Create a chronological timeline of key events, decisions, and activities
2. Group related items together
3. Highlight important decisions and outcomes
4. Keep the summary concise but comprehensive

## Rules:
- Use markdown format with date-based sections
- Preserve important technical details and decisions
- Merge related session entries into coherent narratives
- The summary should stand alone — someone reading it should understand the full context

## Tags (CRITICAL for retrieval):
The tags array is the PRIMARY way this summary will be found later. You MUST include:
1. ALL tags from the original memories: ${[...allOriginalTags].join(", ") || "(none)"}
2. Key technical terms mentioned in the content (library names, tools, APIs, patterns)
3. Feature/component names discussed
4. Action types (bug-fix, refactor, architecture, config, etc.)
5. Project names and identifiers

Do NOT use generic tags like "summary" or "timeline" — those are useless for retrieval.
Aim for 8-20 specific, searchable tags.

## Output format (JSON only):
{
  "title": "Summary: <concise topic description>",
  "summary": "# Timeline Summary\\n\\n## <Date>\\n\\n- ...",
  "tags": ["keyword1", "keyword2", ...],
  "memoriesIncluded": <count>
}`;

          // Try providers in order
          const providerOrder = ["zhipu", "minimax", "deepseek"];
          const modelMap: Record<string, string> = {
            zhipu: "GLM-5",
            minimax: "MiniMax-M2.5",
            deepseek: "deepseek-chat",
          };

          let summaryResult: any = null;
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
                [{ role: "user", content: summarizePrompt }],
                { temperature: 0.3 }
              );

              const responseText = response.choices[0]?.message?.content ?? "";
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                summaryResult = JSON.parse(jsonMatch[0]);
                usedProvider = provider;
                break;
              }
            } catch {
              continue;
            }
          }

          if (!summaryResult) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  analyzed: false,
                  error: "Failed to summarize memories. No AI provider available.",
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
                dateRange: dateRangeLabel,
                memoriesIncluded: entries.length,
                originalIds: entries.map((e) => e.id),
                suggestedTitle: summaryResult.title || `Summary: ${dateRangeLabel}`,
                suggestedSummary: summaryResult.summary || "",
                suggestedTags: summaryResult.tags || [],
                message: "Review the summary preview. Call summarize_memories with mode='execute' to save it.",
              }),
            }],
          };
        } else if (mode === "execute") {
          if (!summary) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  executed: false,
                  error: "No summary text provided. Use mode='analyze' first.",
                }),
              }],
              isError: true,
            };
          }

          // Create the summary memory with keyword-rich tags for retrieval
          const summaryTags = executeTags && executeTags.length > 0
            ? executeTags
            : ["summary", "timeline"];

          // Resolve createdAt: explicit param > auto-detect from title > now
          let resolvedCreatedAt = explicitCreatedAt;
          if (!resolvedCreatedAt && title) {
            // Auto-detect date from title like "Daily Narrative: 2026-02-14"
            const dateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
              resolvedCreatedAt = `${dateMatch[1]}T00:00:00.000Z`;
            }
          }

          const createResult = createMemory({
            title: title ?? "Timeline Summary",
            content: summary,
            tags: summaryTags,
            type: outputType ?? "note",
            scope: targetScope ?? getDefaultWriteScope(cachedProjectRoot),
            ...(resolvedCreatedAt ? { createdAt: resolvedCreatedAt } : {}),
          }, cachedProjectRoot);

          if (!createResult.success) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  executed: false,
                  error: createResult.error ?? "Failed to create summary memory",
                }),
              }],
              isError: true,
            };
          }

          let archivedCount = 0;
          let archiveErrors = 0;

          // Delete original memories after saving summary (default: true)
          const shouldArchive = archiveOriginals !== false;
          if (shouldArchive && parsedOriginalIds.length > 0) {
            await ensureIndexer();

            for (const id of parsedOriginalIds) {
              try {
                const deleteResult = deleteMemory(id, "all", cachedProjectRoot);
                if (deleteResult.success) {
                  if (cachedIndexer) {
                    try { cachedIndexer.removeFile(id); } catch { /* best-effort */ }
                  }
                  archivedCount++;
                } else {
                  archiveErrors++;
                }
              } catch {
                archiveErrors++;
              }
            }
          }

          // Regenerate timeline after summarize
          afterMemoryMutation();

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                executed: true,
                summaryId: createResult.data!.id,
                summaryTitle: title ?? "Timeline Summary",
                tags: summaryTags,
                archived: shouldArchive ? archivedCount : 0,
                archiveErrors,
                message: `Summary saved${shouldArchive ? `. Deleted ${archivedCount} original memories` : ""}`,
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

      // ---- Preference tools ----

      case "add_preference": {
        const { title, content, scope, autoInject, trigger, tags } = args as {
          title: string;
          content: string;
          scope?: PrefScope;
          autoInject?: boolean;
          trigger?: PreferenceTrigger;
          tags?: string[];
        };

        if (!title || !content) {
          return {
            content: [{ type: "text", text: "Error: title and content are required" }],
            isError: true,
          };
        }

        const store = getPrefStore();
        const result = store.create({ title, content, scope, autoInject, trigger, tags });

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              created: true,
              id: result.data!.id,
              title: result.data!.title,
              scope: result.data!.scope,
              autoInject: result.data!.autoInject,
            }),
          }],
        };
      }

      case "list_preferences": {
        const { scope, tags, autoInject, limit } = args as PreferenceListOptions;

        const store = getPrefStore();
        const prefs = store.list({ scope, tags, autoInject, limit });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: prefs.length,
              preferences: prefs.map((p) => ({
                id: p.id,
                title: p.title,
                scope: p.scope,
                autoInject: p.autoInject,
                tags: p.tags,
                trigger: p.trigger,
                createdAt: p.createdAt,
                preview: p.content.slice(0, 200) + (p.content.length > 200 ? "..." : ""),
              })),
            }),
          }],
        };
      }

      case "get_preference": {
        const { id } = args as { id: string };

        if (!id) {
          return {
            content: [{ type: "text", text: "Error: id is required" }],
            isError: true,
          };
        }

        const store = getPrefStore();
        const result = store.get(id);

        if (!result.success || !result.data) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ found: false, error: result.error ?? "Preference not found" }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result.data),
          }],
        };
      }

      case "update_preference": {
        const { id, updates } = args as {
          id: string;
          updates: Partial<Pick<Preference, "title" | "content" | "autoInject" | "trigger" | "tags">>;
        };

        if (!id || !updates) {
          return {
            content: [{ type: "text", text: "Error: id and updates are required" }],
            isError: true,
          };
        }

        const store = getPrefStore();
        const result = store.update(id, updates);

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              updated: true,
              id: result.data!.id,
              title: result.data!.title,
              updatedAt: result.data!.updatedAt,
            }),
          }],
        };
      }

      case "delete_preference": {
        const { id } = args as { id: string };

        if (!id) {
          return {
            content: [{ type: "text", text: "Error: id is required" }],
            isError: true,
          };
        }

        const store = getPrefStore();
        const result = store.delete(id);

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

      case "match_preferences": {
        const { prompt, category, keywords } = args as PreferenceContext;

        const store = getPrefStore();
        const matches = store.match({ prompt, category, keywords });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: matches.length,
              matches: matches.map((m) => ({
                id: m.preference.id,
                title: m.preference.title,
                content: m.preference.content,
                score: m.score,
                matchedBy: m.matchedBy,
                matchedTerms: m.matchedTerms,
                tags: m.preference.tags,
              })),
            }),
          }],
        };
      }

      case "preference_stats": {
        const store = getPrefStore();
        const stats = store.stats();

        return {
          content: [{
            type: "text",
            text: JSON.stringify(stats),
          }],
        };
      }

      // ---- Proxy switch tools ----

      case "switch_model": {
        const { provider, model } = args as {
          provider: string;
          model: string;
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

        // Check provider is configured (API key or OAuth credentials)
        if (!isProviderConfigured(omcConfig, provider)) {
          const isOAuth = providerConfig.type === "openai-oauth";
          const hint = isOAuth
            ? `Run 'oh-my-claude auth login ${provider}' to authenticate.`
            : `Set ${providerConfig.api_key_env ?? `${provider.toUpperCase()}_API_KEY`} environment variable.`;
          return {
            content: [{
              type: "text",
              text: `Error: Provider "${provider}" is not configured. ${hint}`,
            }],
            isError: true,
          };
        }

        // Notify the per-session proxy control API
        const switchUrl = controlUrl("/switch", cachedSessionId);
        if (!switchUrl) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Proxy not available. Launch via `oh-my-claude cc` to enable model switching.",
              }),
            }],
            isError: true,
          };
        }

        let controlSuccess = false;
        try {
          const resp = await fetch(switchUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ provider, model }),
          });
          controlSuccess = resp.ok;
        } catch {
          // Control API not reachable
        }

        if (!controlSuccess) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Failed to reach proxy control API. Is the proxy still running?",
              }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              switched: true,
              provider,
              model,
              sessionId: cachedSessionId ?? null,
              message: `All requests will be routed to ${provider}/${model} until manually reverted`,
            }),
          }],
        };
      }

      case "switch_status": {
        const statusUrl = controlUrl("/status", cachedSessionId);
        if (!statusUrl) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                proxyAvailable: false,
                switched: false,
                message: "Proxy not available. Launch via `oh-my-claude cc` to enable model switching.",
              }),
            }],
          };
        }

        let switchState: ProxySwitchState | null = null;
        try {
          const resp = await fetch(statusUrl);
          if (resp.ok) {
            switchState = await resp.json() as ProxySwitchState;
          }
        } catch {
          // Control API not reachable
        }

        if (!switchState) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                proxyAvailable: false,
                switched: false,
                message: "Failed to reach proxy control API. Is the proxy still running?",
              }),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              proxyAvailable: true,
              ...switchState,
              sessionId: cachedSessionId ?? null,
              ...(switchState.switchedAt && {
                switchedAtHuman: new Date(switchState.switchedAt).toISOString(),
              }),
            }),
          }],
        };
      }

      case "switch_revert": {
        const revertUrl = controlUrl("/revert", cachedSessionId);
        if (!revertUrl) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Proxy not available. Launch via `oh-my-claude cc` to enable model switching.",
              }),
            }],
            isError: true,
          };
        }

        let controlSuccess = false;
        try {
          const resp = await fetch(revertUrl, { method: "POST" });
          controlSuccess = resp.ok;
        } catch {
          // Control API not reachable
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              switched: false,
              sessionId: cachedSessionId ?? null,
              message: controlSuccess
                ? "Reverted to passthrough (native Claude)"
                : "Warning: Failed to reach proxy, but state reset attempted.",
            }),
          }],
        };
      }

      // ---- Bridge tools ----

      case "bridge_send": {
        const { ai_name, message: bridgeMessage, wait_for_response, timeout_ms, auto_close } = args as {
          ai_name: string;
          message: string;
          wait_for_response?: boolean;
          timeout_ms?: number;
          auto_close?: boolean;
        };

        if (!ai_name || !bridgeMessage) {
          return {
            content: [{ type: "text", text: "Error: ai_name and message are required" }],
            isError: true,
          };
        }

        // Dynamically import bridge modules (avoids loading them for non-bridge usage)
        const { readBridgeState } = await import("../../bridge/state");
        const state = readBridgeState();
        const entry = state.ais.find((a) => a.name === ai_name);

        if (!entry) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `${ai_name} is not running. Start it with: oh-my-claude bridge up ${ai_name}`,
                running_ais: state.ais.map((a) => a.name),
              }),
            }],
            isError: true,
          };
        }

        if (!entry.paneId) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `${ai_name} has no pane ID. Restart it: bridge down ${ai_name} && bridge up ${ai_name}`,
              }),
            }],
            isError: true,
          };
        }

        if (entry.terminalBackend !== "wezterm" && entry.terminalBackend !== "tmux") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `bridge_send requires WezTerm or tmux backend (got: ${entry.terminalBackend ?? "unknown"})`,
              }),
            }],
            isError: true,
          };
        }

        // Send via the appropriate terminal backend's injectText method.
        // This handles newline splitting, bracketed-paste delays, and proper submit.
        const paneId = entry.paneId!;
        let backend: import("../../terminal/base").TerminalBackend;
        try {
          if (entry.terminalBackend === "tmux") {
            const { TmuxBackend } = await import("../../terminal/tmux");
            backend = new TmuxBackend();
          } else {
            const { WezTermBackend } = await import("../../terminal/wezterm");
            backend = new WezTermBackend();
          }

          // Paste text as a single block (no newline splitting), then send Enter to submit
          const textToSend = bridgeMessage.replace(/[\r\n]+$/u, "");
          await backend.injectText(paneId, textToSend);
          // Brief delay for TUI to process pasted text before Enter
          await new Promise((resolve) => setTimeout(resolve, 100));
          await backend.sendKeys(entry.paneId!, "Enter");
        } catch (sendError) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `Failed to send text to ${ai_name} pane ${paneId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
              }),
            }],
            isError: true,
          };
        }

        // Brief verification: check if text was submitted or stuck in input
        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const paneOutput = await backend.getPaneOutput(paneId, 20);
          const lastLines = paneOutput.trim().split("\n").slice(-5).join("\n");
          const sentTextSnippet = bridgeMessage.slice(0, 60).trim();

          const hasProcessingIndicator = /thinking|loading|processing|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|⠐|⠑|\.{3,}|Inspecting|Explored/i.test(lastLines);
          const textStillInInput = lastLines.includes(sentTextSnippet) && !hasProcessingIndicator;

          if (textStillInInput) {
            // Text pasted but not submitted — send Enter to trigger
            await backend.sendKeys(paneId, "Enter");
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        } catch {
          // Verification is best-effort — continue to polling even if it fails
        }

        // Determine the base AI type for config/routing lookup
        const baseAIName = ai_name.includes(":") ? ai_name.slice(0, ai_name.indexOf(":")) : ai_name;
        const supportsPolling = baseAIName === "codex" || baseAIName === "opencode" || baseAIName === "cc";

        const shouldWait = wait_for_response !== false;
        if (!shouldWait || !supportsPolling) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                sent: true,
                ai_name,
                pane_id: entry.paneId,
                waited: false,
                message: `Message sent to ${ai_name}. Use bridge_send with wait_for_response=true to get responses.`,
              }),
            }],
          };
        }

        // Track request in per-session state for statusline
        const requestId = `bridge-${ai_name}-${Date.now()}`;
        try {
          const { addSessionBridgeRequest } = await import("../../bridge/state");
          addSessionBridgeRequest(requestId, ai_name);
        } catch { /* non-critical */ }

        // Poll for response
        const timeoutMs = timeout_ms ?? 120000;
        const projectPath = entry.projectPath ?? cachedProjectRoot ?? process.cwd();

        try {
          let response: string | null = null;

          if (baseAIName === "cc") {
            // CC uses pane-output-only polling (no storage adapter)
            const { pollCCPaneResponse } = await import("../../bridge/poll-response");
            response = await pollCCPaneResponse(entry, bridgeMessage, timeoutMs);
          } else {
            const { pollForBridgeResponse } = await import("../../bridge/poll-response");
            response = await pollForBridgeResponse(
              ai_name as "codex" | "opencode",
              projectPath,
              timeoutMs,
              {
                paneId,
                backend,
                sentMessage: bridgeMessage,
              },
            );
          }

          // Update per-session request state
          try {
            const { updateSessionBridgeRequest } = await import("../../bridge/state");
            updateSessionBridgeRequest(requestId, response ? "completed" : "error");
          } catch { /* non-critical */ }

          // Auto-close pane after getting response (default: true)
          const shouldAutoClose = auto_close !== false;
          let closed = false;

          if (shouldAutoClose && response) {
            try {
              const { removeAIFromState } = await import("../../bridge/state");
              // Kill the pane
              if (entry.terminalBackend === "tmux") {
                const { execSync } = await import("node:child_process");
                execSync(`tmux kill-pane -t ${paneId}`, { stdio: "pipe" });
              } else if (entry.terminalBackend === "wezterm") {
                const { execSync } = await import("node:child_process");
                execSync(`wezterm cli kill-pane --pane-id ${paneId}`, { stdio: "pipe" });
              }
              removeAIFromState(ai_name);
              closed = true;
            } catch {
              // Best-effort cleanup — pane may already be gone
            }
          }

          if (response) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  sent: true,
                  ai_name,
                  pane_id: entry.paneId,
                  waited: true,
                  response,
                  auto_closed: closed,
                }),
              }],
            };
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                sent: true,
                ai_name,
                pane_id: entry.paneId,
                waited: true,
                response: null,
                message: `Message sent but no response received within ${Math.round(timeoutMs / 1000)}s timeout`,
              }),
            }],
          };
        } catch (pollError) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                sent: true,
                ai_name,
                pane_id: entry.paneId,
                waited: true,
                response: null,
                error: `Message sent but response polling failed: ${pollError instanceof Error ? pollError.message : String(pollError)}`,
              }),
            }],
          };
        }
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

/**
 * Resolve project root for memory isolation.
 * The MCP server is spawned per-instance by Claude Code with the project as cwd.
 * We walk up from cwd to find the .git root, same as store.ts's findProjectRoot().
 */
function resolveProjectRoot(): string | undefined {
  const { existsSync } = require("node:fs");
  const { join, dirname } = require("node:path");
  let dir = process.cwd();

  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return undefined;
}

// Start server
async function main() {
  // Resolve project root at startup for memory isolation
  cachedProjectRoot = resolveProjectRoot();
  if (cachedProjectRoot) {
    console.error(`[oh-my-claude] Project root: ${cachedProjectRoot}`);
  }

  // Extract session ID from ANTHROPIC_BASE_URL for session-scoped proxy operations
  cachedSessionId = extractSessionIdFromEnv();
  if (cachedSessionId) {
    console.error(`[oh-my-claude] Session ID: ${cachedSessionId}`);
  }

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
