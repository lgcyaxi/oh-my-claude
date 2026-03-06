import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../shared/types';
import { handleBridgeTool } from './index';

function call(name: string, ctx: ToolContext) {
	return async (args: Record<string, unknown>): Promise<CallToolResult> => {
		const result = await handleBridgeTool(name, args, ctx);
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

export function registerBridgeTools(
	server: McpServer,
	ctx: ToolContext,
	options?: { workerOnly?: boolean },
) {
	if (options?.workerOnly) {
		server.registerTool(
			'bridge_event',
			{
				description: `Post an event from a bridge worker to the bus. Worker-side only.

Used by workers to report task progress and completion back to the main CC instance.
Only available inside bridge workers (OMC_BRIDGE_PANE=1).

Event types: accepted, progress, completed, failed, log.
For "completed", include result in payload: { message, files?, data? }
For "failed", include error in payload: { error: "reason" }`,
				inputSchema: z.object({
					task_id: z
						.string()
						.describe('Task ID this event belongs to'),
					type: z
						.enum([
							'accepted',
							'progress',
							'completed',
							'failed',
							'log',
						])
						.describe('Event type'),
					payload: z
						.record(z.unknown())
						.optional()
						.describe(
							"Event-specific data. For 'completed': { message, files?, data? }. For 'failed': { error }",
						),
				}),
			},
			call('bridge_event', ctx),
		);
		return;
	}

	server.registerTool(
		'bridge_send',
		{
			description: `Send a task to a running CLI tool (codex, opencode, gemini, cc) via the Multi-AI Bridge.

If the AI is not already running in bridge state, it will be spawned automatically.
- Proc-based workers (codex via CodexAppServerDaemon): uses orchestrator.delegate() — reliable, no pane needed.
- Pane-based workers (cc, opencode): injects text via tmux/WezTerm, polls for response.

Use task_spec to provide structured task context (scope, expected output, completion criteria) — prepended to the message as a structured header so the worker understands its mandate.

Use \`bridge up cc --switch ds\` to spawn a CC worker pre-switched to DeepSeek.
Multiple CC instances supported: cc, cc:2, cc:3 (each with its own proxy session).`,
			inputSchema: z.object({
				ai_name: z
					.string()
					.describe(
						'Name of the AI assistant to send the message to. Supports: codex, opencode, cc, cc:kimi (Kimi K2.5), cc:zp (ZhiPu GLM), cc:qwen (Qwen 3.5+), cc:mm-cn (MiniMax), cc:ds (DeepSeek), cc:2, cc:N',
					),
				message: z
					.string()
					.describe(
						'The task or message to send to the AI assistant',
					),
				task_spec: z
					.object({
						scope: z
							.string()
							.optional()
							.describe(
								'What files/components/areas this task covers',
							),
						expected_output: z
							.string()
							.optional()
							.describe(
								"What the worker should produce (e.g., 'modified files', 'test results', 'explanation')",
							),
						completion_criteria: z
							.string()
							.optional()
							.describe('How to know the task is done'),
					})
					.optional()
					.describe(
						'Optional structured task specification prepended to the message. Helps bridge workers understand scope and completion criteria.',
					),
				wait_for_response: z
					.boolean()
					.optional()
					.describe(
						'Whether to poll for a response from the AI (default: true)',
					),
				timeout_ms: z
					.number()
					.optional()
					.describe(
						'Response timeout in milliseconds (default: 120000 = 2 minutes)',
					),
				auto_close: z
					.boolean()
					.optional()
					.describe(
						'Automatically close the AI pane after receiving a response (default: true). Set to false to keep the pane alive.',
					),
				stream: z
					.boolean()
					.optional()
					.describe(
						'Stream partial responses in real-time via proxy capture (requires proxy-mediated capture). Falls back to non-streaming if unavailable.',
					),
			}),
		},
		call('bridge_send', ctx),
	);

	server.registerTool(
		'bridge_up',
		{
			description: `Spawn a bridge worker (CC instance) with optional model switching.

Allows dynamically adding bridge workers mid-session without restarting.
The worker runs in a tmux pane with its own proxy session for isolated model switching.

Examples:
- bridge_up("cc:kimi", "kimi") → spawn CC worker pre-switched to Kimi
- bridge_up("cc:ds", "ds") → spawn CC worker pre-switched to DeepSeek
- bridge_up("cc:2") → spawn CC worker without switching`,
			inputSchema: z.object({
				name: z
					.string()
					.describe(
						"Worker name (e.g., cc:kimi, cc:ds, cc:2). Must start with 'cc'.",
					),
				switch_alias: z
					.string()
					.optional()
					.describe(
						'Optional switch alias (e.g., kimi, ds, mm, glm) to auto-switch the worker after launch.',
					),
			}),
		},
		call('bridge_up', ctx),
	);

	server.registerTool(
		'bridge_down',
		{
			description: `Stop a running bridge worker and remove it from bridge state.

Kills the worker's tmux pane and removes it from the bridge state file.
If no workers remain after removal, bridge mode constraints are cleared.`,
			inputSchema: z.object({
				name: z
					.string()
					.describe(
						'Worker name to stop (e.g., cc:kimi, cc:ds, cc:2).',
					),
			}),
		},
		call('bridge_down', ctx),
	);

	server.registerTool(
		'bridge_status',
		{
			description: `Get the status of all active bridge workers.

Use before bridge_send to verify a worker is running and check its current state.
For proc-based workers (codex), returns live state from the status signal file.
For pane-based workers (cc, opencode), returns "running" (no live signal available).

Returns: { workers: [{name, type, status, startedAt, projectPath}], count }`,
			inputSchema: z.object({}),
		},
		call('bridge_status', ctx),
	);

	server.registerTool(
		'bridge_dispatch',
		{
			description: `Dispatch a structured task to a worker via the Bridge Bus (HTTP broker, port 18912).

Unlike bridge_send (pane-based), bridge_dispatch uses a reliable HTTP bus server.
The bus auto-starts if not running. Workers poll the bus for tasks.

Use bridge_wait to block until task(s) complete.
Use bridge_send for legacy pane-based communication.`,
			inputSchema: z.object({
				worker: z
					.string()
					.describe('Target worker name (e.g., cc:zp, cc:ds, cc:2)'),
				mandate: z
					.object({
						role: z
							.string()
							.describe(
								'Worker role (code, audit, docs, design)',
							),
						scope: z
							.string()
							.describe(
								'What files/components/areas this task covers',
							),
						goal: z
							.string()
							.describe('What the worker should accomplish'),
						acceptance: z
							.string()
							.describe('How to know the task is done'),
						context: z
							.string()
							.optional()
							.describe('Optional additional context'),
					})
					.describe('Structured task mandate for the worker'),
			}),
		},
		call('bridge_dispatch', ctx),
	);

	server.registerTool(
		'bridge_wait',
		{
			description: `Wait for one or more bus tasks to complete. Blocks until results are ready.

Supports "all" (wait for every task) or "any" (first completion) modes.
Max timeout 300s. Use after bridge_dispatch to collect results.`,
			inputSchema: z.object({
				task_ids: z
					.array(z.string())
					.describe('Task IDs to wait for (from bridge_dispatch)'),
				mode: z
					.enum(['all', 'any'])
					.optional()
					.describe(
						"Wait mode: 'all' waits for every task, 'any' returns on first completion (default: all)",
					),
				timeout_ms: z
					.number()
					.optional()
					.describe(
						'Maximum wait time in ms (default: 300000, max: 300000)',
					),
			}),
		},
		call('bridge_wait', ctx),
	);

	server.registerTool(
		'bridge_event',
		{
			description: `Post an event from a bridge worker to the bus. Worker-side only.

Used by workers to report task progress and completion back to the main CC instance.
Only available inside bridge workers (OMC_BRIDGE_PANE=1).

Event types: accepted, progress, completed, failed, log.
For "completed", include result in payload: { message, files?, data? }
For "failed", include error in payload: { error: "reason" }`,
			inputSchema: z.object({
				task_id: z.string().describe('Task ID this event belongs to'),
				type: z
					.enum([
						'accepted',
						'progress',
						'completed',
						'failed',
						'log',
					])
					.describe('Event type'),
				payload: z
					.record(z.unknown())
					.optional()
					.describe(
						"Event-specific data. For 'completed': { message, files?, data? }. For 'failed': { error }",
					),
			}),
		},
		call('bridge_event', ctx),
	);
}
