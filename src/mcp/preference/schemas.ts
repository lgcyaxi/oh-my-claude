import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const preferenceToolSchemas: Tool[] = [
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
];
