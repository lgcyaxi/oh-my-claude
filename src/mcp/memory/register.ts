import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../shared/types';
import { handleMemoryTool } from './index';

const memoryCategory = z.enum([
	'architecture',
	'convention',
	'decision',
	'debugging',
	'workflow',
	'pattern',
	'reference',
	'session',
	'uncategorized',
]);

const memoryScope = z.enum(['project', 'global']);
const searchScope = z.enum(['project', 'global', 'all']);
const memoryType = z.enum(['note', 'session']);
const aiMode = z.enum(['analyze', 'execute']);

function call(name: string, ctx: ToolContext) {
	return async (args: Record<string, unknown>): Promise<CallToolResult> => {
		const result = await handleMemoryTool(name, args, ctx);
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

export function registerMemoryTools(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'remember',
		{
			description: `Store a memory for future recall. Memories persist across sessions as markdown files.

Use this to save important context: decisions, patterns, conventions, or anything worth remembering.

Storage: By default, saves to project (.claude/mem/) if in a git repo, otherwise global (~/.claude/oh-my-claude/memory/).

Examples:
- "The team prefers functional components over class components"
- "Auth uses JWT with 24h expiry, refresh token is 7 days"
- "Project uses pnpm, not npm"`,
			inputSchema: z.object({
				content: z
					.string()
					.describe(
						'The memory content to store (markdown supported)',
					),
				title: z
					.string()
					.optional()
					.describe(
						'Optional title (auto-generated from content if omitted)',
					),
				type: memoryType
					.optional()
					.describe(
						"Memory type: 'note' for persistent knowledge, 'session' for session summaries (default: note)",
					),
				category: memoryCategory
					.optional()
					.describe(
						'Structured category for taxonomy-based retrieval. Auto-inferred from tags/content if omitted.',
					),
				tags: z
					.array(z.string())
					.optional()
					.describe(
						"Tags for categorization and search (e.g., ['pattern', 'auth', 'convention'])",
					),
				concepts: z
					.array(z.string())
					.optional()
					.describe(
						"Semantic concepts (e.g., ['authentication', 'jwt', 'error-handling'])",
					),
				files: z
					.array(z.string())
					.optional()
					.describe(
						"Files read or modified (e.g., ['src/auth.ts', 'src/middleware.ts'])",
					),
				scope: memoryScope
					.optional()
					.describe(
						"Where to store: 'project' (.claude/mem/) or 'global' (~/.claude/oh-my-claude/memory/). Default: project if in git repo.",
					),
			}),
		},
		call('remember', ctx),
	);

	server.registerTool(
		'recall',
		{
			description: `Search and retrieve stored memories. Returns matching memories ranked by relevance.

Searches both project (.claude/mem/) and global (~/.claude/oh-my-claude/memory/) by default.

Use this to find previously saved knowledge, decisions, or session summaries.`,
			inputSchema: z.object({
				query: z
					.string()
					.optional()
					.describe(
						'Text query to search memories (matches title, content, tags)',
					),
				type: memoryType.optional().describe('Filter by memory type'),
				category: memoryCategory
					.optional()
					.describe('Filter by structured category'),
				tags: z
					.array(z.string())
					.optional()
					.describe('Filter by tags (any match)'),
				concepts: z
					.array(z.string())
					.optional()
					.describe(
						"Filter/boost by semantic concepts (e.g., ['authentication', 'error-handling'])",
					),
				limit: z
					.number()
					.optional()
					.describe('Max results to return (default: 10)'),
				scope: searchScope
					.optional()
					.describe(
						"Where to search: 'project', 'global', or 'all' (default: all)",
					),
			}),
		},
		call('recall', ctx),
	);

	server.registerTool(
		'get_memory',
		{
			description:
				'Read the full content of a specific memory by ID. Use this to drill down after recall returns snippets.',
			inputSchema: z.object({
				id: z.string().describe('The memory ID to retrieve'),
				scope: searchScope
					.optional()
					.describe('Where to search (default: all)'),
			}),
		},
		call('get_memory', ctx),
	);

	server.registerTool(
		'forget',
		{
			description:
				'Delete a specific memory by its ID. Searches both project and global storage.',
			inputSchema: z.object({
				id: z.string().describe('The memory ID to delete'),
				scope: searchScope
					.optional()
					.describe('Where to search for the memory (default: all)'),
			}),
		},
		call('forget', ctx),
	);

	server.registerTool(
		'list_memories',
		{
			description:
				'List stored memories with optional filtering by type, date range, and scope.',
			inputSchema: z.object({
				type: memoryType.optional().describe('Filter by memory type'),
				limit: z
					.number()
					.optional()
					.describe('Max results (default: 20)'),
				after: z
					.string()
					.optional()
					.describe(
						'Only show memories created after this date (ISO 8601)',
					),
				before: z
					.string()
					.optional()
					.describe(
						'Only show memories created before this date (ISO 8601)',
					),
				scope: searchScope
					.optional()
					.describe(
						"Where to list: 'project', 'global', or 'all' (default: all)",
					),
			}),
		},
		call('list_memories', ctx),
	);

	server.registerTool(
		'memory_status',
		{
			description:
				'Get memory store statistics (total count, size, breakdown by type and scope).',
			inputSchema: z.object({}),
		},
		call('memory_status', ctx),
	);

	server.registerTool(
		'compact_memories',
		{
			description: `Analyze memories and suggest compaction groups. Use this when memory count is high or user requests cleanup.

Flow:
1. Analyzes all memories using AI (routed through proxy)
2. Returns suggested merge groups with previews
3. User confirms which groups to compact
4. Call again with 'execute' mode to perform the merge

Returns JSON with suggested groups. Each group shows which memories would merge and a preview of the result.`,
			inputSchema: z.object({
				mode: aiMode.describe(
					"Mode: 'analyze' to get suggestions, 'execute' to perform confirmed merges",
				),
				scope: searchScope
					.optional()
					.describe('Which memories to analyze (default: all)'),
				groups: z
					.array(
						z.object({
							ids: z.array(z.string()),
							title: z.string(),
						}),
					)
					.optional()
					.describe(
						"For 'execute' mode: groups to compact (from analyze results)",
					),
				targetScope: memoryScope
					.optional()
					.describe(
						"For 'execute' mode: where to save compacted memories (default: project)",
					),
				type: z
					.enum(['note', 'session', 'all'])
					.optional()
					.describe(
						"Filter by memory type. Default: 'note' (sessions excluded — use /omc-mem-daily for sessions)",
					),
			}),
		},
		call('compact_memories', ctx),
	);

	server.registerTool(
		'clear_memories',
		{
			description: `AI-powered selective memory cleanup. Analyzes memories and identifies outdated, redundant, or irrelevant ones for removal.

Flow:
1. AI reviews all memories and identifies candidates for deletion (routed through proxy)
2. Returns deletion candidates with reasons
3. User confirms which to delete
4. Call again with 'execute' mode to perform deletion

Unlike forget (which deletes by ID), this uses AI judgment to identify what's no longer needed.`,
			inputSchema: z.object({
				mode: aiMode.describe(
					"Mode: 'analyze' to get deletion candidates, 'execute' to delete confirmed ones",
				),
				scope: searchScope
					.optional()
					.describe('Which memories to analyze (default: all)'),
				ids: z
					.array(z.string())
					.optional()
					.describe(
						"For 'execute' mode: memory IDs to delete (from analyze results)",
					),
			}),
		},
		call('clear_memories', ctx),
	);

	server.registerTool(
		'summarize_memories',
		{
			description: `Consolidate memories from a date range into a single timeline summary.

Flow:
1. Collects all memories within the specified date range
2. AI creates a consolidated timeline summary (routed through proxy)
3. Returns preview of the summary with keyword-rich tags for retrieval
4. User confirms to save the summary (originals are deleted by default)

Use this to condense many fine-grained memories into a single coherent overview.`,
			inputSchema: z.object({
				mode: aiMode.describe(
					"Mode: 'analyze' to preview summary, 'execute' to save it",
				),
				days: z
					.number()
					.optional()
					.describe(
						'Number of past days to include (default: 7). E.g., 7 = last 7 days',
					),
				after: z
					.string()
					.optional()
					.describe(
						"Start date (ISO 8601). Overrides 'days' if provided",
					),
				before: z
					.string()
					.optional()
					.describe('End date (ISO 8601). Defaults to now'),
				scope: searchScope
					.optional()
					.describe('Which memories to include (default: all)'),
				summary: z
					.string()
					.optional()
					.describe(
						"For 'execute' mode: the AI-generated summary text to save",
					),
				title: z
					.string()
					.optional()
					.describe(
						"For 'execute' mode: title for the summary memory",
					),
				tags: z
					.array(z.string())
					.optional()
					.describe(
						"For 'execute' mode: tags for the summary memory (from analyze suggestedTags). Includes all keywords from originals for retrieval.",
					),
				archiveOriginals: z
					.boolean()
					.optional()
					.describe(
						"For 'execute' mode: whether to delete original memories after saving summary (default: true)",
					),
				originalIds: z
					.array(z.string())
					.optional()
					.describe(
						"For 'execute' mode: IDs of original memories to delete after saving",
					),
				targetScope: memoryScope
					.optional()
					.describe(
						"For 'execute' mode: where to save the summary (default: auto-detect)",
					),
				outputType: memoryType
					.optional()
					.describe(
						"For 'execute' mode: memory type for the saved summary (default: note)",
					),
				createdAt: z
					.string()
					.optional()
					.describe(
						"For 'execute' mode: override the date used in the memory ID (ISO 8601 or YYYY-MM-DD). If omitted, auto-detects from title (e.g., 'Daily Narrative: 2026-02-14' → 2026-02-14).",
					),
			}),
		},
		call('summarize_memories', ctx),
	);
}
