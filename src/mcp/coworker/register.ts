import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../shared/types';
import { handleCoworkerTool } from './index';

function call(ctx: ToolContext) {
	return async (args: Record<string, unknown>): Promise<CallToolResult> => {
		const result = await handleCoworkerTool('coworker_task', args, ctx);
		return (
			result ?? {
				content: [
					{
						type: 'text' as const,
						text: 'Unknown coworker tool invocation',
					},
				],
				isError: true,
			}
		);
	};
}

const coworkerTarget = z
	.enum(['codex', 'opencode'])
	.describe('Coworker target name');

export function registerCoworkerTools(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'coworker_task',
		{
			description:
				'Unified coworker entrypoint. Use action=send|review|diff|fork|approve|revert|status|recent_activity to route to the corresponding native coworker operation.',
			inputSchema: z.object({
				action: z
					.enum([
						'send',
						'review',
						'diff',
						'fork',
						'approve',
						'revert',
						'status',
						'recent_activity',
					])
					.describe('Unified coworker action'),
				target: coworkerTarget.optional(),
				message: z.string().optional(),
				timeout_ms: z.number().optional(),
				agent: z.string().optional(),
				provider_id: z.string().optional(),
				model_id: z.string().optional(),
				approval_policy: z
					.string()
					.optional()
					.describe(
						'Optional Codex approval policy override. Accepted values: never, on-request, on-failure, untrusted, reject.',
					),
				review_target: z
					.enum([
						'uncommittedChanges',
						'baseBranch',
						'commit',
						'custom',
					])
					.optional(),
				base_branch: z.string().optional(),
				commit_sha: z.string().optional(),
				commit_title: z.string().optional(),
				instructions: z.string().optional(),
				delivery: z.enum(['inline', 'detached']).optional(),
				paths: z.array(z.string()).optional(),
				message_id: z.string().optional(),
				part_id: z.string().optional(),
				undo: z.boolean().optional(),
				num_turns: z.number().int().min(1).optional(),
				request_id: z.string().optional(),
				session_id: z.string().optional(),
				permission_id: z.string().optional(),
				decision: z.string().optional(),
				remember: z.boolean().optional(),
				answers: z.record(z.array(z.string())).optional(),
				exec_policy_amendment: z.array(z.string()).optional(),
				network_policy_amendment: z
					.object({
						host: z.string(),
						action: z.string(),
					})
					.optional(),
				limit: z.number().int().min(1).max(100).optional(),
			}),
		},
		call(ctx),
	);
}
