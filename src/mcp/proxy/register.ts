import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../shared/types';
import { handleProxyTool } from './index';

function call(name: string, ctx: ToolContext) {
	return async (args: Record<string, unknown>): Promise<CallToolResult> => {
		const result = await handleProxyTool(name, args, ctx);
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

export function registerProxyTools(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'switch_model',
		{
			description: `Switch all Claude Code requests to an external provider via the proxy.

⚠️ switch_model changes ALL session traffic and requires switch_revert. Only use for sustained multi-turn work (3+ interactions). For single tasks, use bridge_send or Task tool subagents instead.

Requires the oh-my-claude proxy to be running (oh-my-claude proxy start).
Stays switched until manually reverted with switch_revert.

**Available Providers** (must be configured with API key or OAuth):
- deepseek: deepseek-reasoner, deepseek-chat
- zhipu: glm-5
- minimax: MiniMax-M2.5
- kimi: kimi-for-coding
- aliyun: qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-4.7, kimi-k2.5
- openai: gpt-5.2, gpt-5.3-codex, o3-mini (OAuth: oh-my-claude auth login openai)
- ollama: (auto-discovered from local Ollama instance — model param optional)
**Example**: switch_model(provider="deepseek", model="deepseek-reasoner")
This routes all subsequent Claude Code requests through DeepSeek's reasoner model.
**Ollama**: switch_model(provider="ollama") auto-discovers first available model.
Or specify: switch_model(provider="ollama", model="llama3.3").
Once switched, use /model <name> to switch between any installed Ollama model.`,
			inputSchema: z.object({
				provider: z
					.string()
					.describe(
						'Provider name (deepseek, zhipu, minimax, kimi, aliyun, openai, ollama)',
					),
				model: z
					.string()
					.optional()
					.describe(
						'Model name. Optional for ollama (auto-discovered). Examples: deepseek-reasoner, glm-5, MiniMax-M2.5, kimi-for-coding, qwen3.5-plus, gpt-5.3-codex, llama3.3',
					),
			}),
		},
		call('switch_model', ctx),
	);

	server.registerTool(
		'switch_status',
		{
			description:
				'Get the current proxy switch status. Shows whether requests are being routed to an external provider.',
			inputSchema: z.object({}),
		},
		call('switch_status', ctx),
	);

	server.registerTool(
		'switch_revert',
		{
			description:
				'Immediately revert the proxy to passthrough mode (route to native Claude).',
			inputSchema: z.object({}),
		},
		call('switch_revert', ctx),
	);
}
