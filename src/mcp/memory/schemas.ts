import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const memoryToolSchemas: Tool[] = [
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
        concepts: {
          type: "array",
          items: { type: "string" },
          description: "Semantic concepts (e.g., ['authentication', 'jwt', 'error-handling'])",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files read or modified (e.g., ['src/auth.ts', 'src/middleware.ts'])",
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
        concepts: {
          type: "array",
          items: { type: "string" },
          description: "Filter/boost by semantic concepts (e.g., ['authentication', 'error-handling'])",
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
];
