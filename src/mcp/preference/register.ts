import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../shared/types';
import { handlePreferenceTool } from './index';

const triggerSchema = z.object({
	keywords: z
		.array(z.string())
		.optional()
		.describe(
			'Keywords that activate this preference (matched against user prompt)',
		),
	categories: z
		.array(z.string())
		.optional()
		.describe(
			"Task categories that activate this preference (e.g., 'git', 'testing')",
		),
	always: z
		.boolean()
		.optional()
		.describe('If true, always inject regardless of context'),
});

function call(name: string, ctx: ToolContext) {
	return async (args: Record<string, unknown>): Promise<CallToolResult> => {
		const result = await handlePreferenceTool(name, args, ctx);
		return (
			result ?? {
				content: [
					{ type: 'text' as const, text: `Unknown tool: ${name}` },
				],
				isError: true,
			}
		);
	};
}

export function registerPreferenceTools(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'add_preference',
		{
			description: `Create a new preference rule. Preferences are "always do X" or "never do Y" rules that get auto-injected into relevant sessions.

Examples:
- "Never use co-author in git commits"
- "Always use TypeScript strict mode"
- "Prefer functional components over class components"`,
			inputSchema: z.object({
				title: z
					.string()
					.describe(
						"Short rule title (e.g., 'Never use co-author in commits')",
					),
				content: z
					.string()
					.describe(
						'Detailed rule content explaining the preference',
					),
				scope: z
					.enum(['global', 'project'])
					.optional()
					.describe(
						"Storage scope: 'global' (cross-project) or 'project' (.claude/). Default: global",
					),
				autoInject: z
					.boolean()
					.optional()
					.describe(
						'Whether to auto-inject into matching sessions (default: true)',
					),
				trigger: triggerSchema
					.optional()
					.describe('When to activate this preference'),
				tags: z
					.array(z.string())
					.optional()
					.describe('Tags for categorization and search'),
			}),
		},
		call('add_preference', ctx),
	);

	server.registerTool(
		'list_preferences',
		{
			description:
				'List all preferences with optional filtering by scope, tags, or auto-inject status.',
			inputSchema: z.object({
				scope: z
					.enum(['global', 'project'])
					.optional()
					.describe('Filter by scope'),
				tags: z
					.array(z.string())
					.optional()
					.describe('Filter by tags (any match)'),
				autoInject: z
					.boolean()
					.optional()
					.describe('Filter by auto-inject status'),
				limit: z
					.number()
					.optional()
					.describe('Maximum results to return'),
			}),
		},
		call('list_preferences', ctx),
	);

	server.registerTool(
		'get_preference',
		{
			description:
				'Get a specific preference by its ID. Returns full details including trigger configuration.',
			inputSchema: z.object({
				id: z
					.string()
					.describe('The preference ID (format: pref-YYYYMMDD-slug)'),
			}),
		},
		call('get_preference', ctx),
	);

	server.registerTool(
		'update_preference',
		{
			description:
				'Update an existing preference. Only provided fields are changed.',
			inputSchema: z.object({
				id: z.string().describe('The preference ID to update'),
				updates: z
					.object({
						title: z.string().optional().describe('New title'),
						content: z.string().optional().describe('New content'),
						autoInject: z
							.boolean()
							.optional()
							.describe('New auto-inject status'),
						trigger: triggerSchema.optional(),
						tags: z.array(z.string()).optional(),
					})
					.describe('Fields to update'),
			}),
		},
		call('update_preference', ctx),
	);

	server.registerTool(
		'delete_preference',
		{
			description:
				'Delete a preference by its ID. Searches both global and project scopes.',
			inputSchema: z.object({
				id: z.string().describe('The preference ID to delete'),
			}),
		},
		call('delete_preference', ctx),
	);

	server.registerTool(
		'match_preferences',
		{
			description:
				'Find preferences that match the current context. Returns matched preferences ranked by relevance score.',
			inputSchema: z.object({
				prompt: z
					.string()
					.optional()
					.describe(
						'Current user prompt or message to match against',
					),
				category: z
					.string()
					.optional()
					.describe(
						"Current task category (e.g., 'git', 'testing', 'refactoring')",
					),
				keywords: z
					.array(z.string())
					.optional()
					.describe('Additional context keywords'),
			}),
		},
		call('match_preferences', ctx),
	);

	server.registerTool(
		'preference_stats',
		{
			description:
				'Get preference store statistics including counts by scope and auto-inject status.',
			inputSchema: z.object({}),
		},
		call('preference_stats', ctx),
	);
}
