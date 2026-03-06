/**
 * Internal API endpoints for memory AI and configuration
 *
 * /internal/complete — non-streaming completion for memory operations
 * /internal/memory-config — query/set the memory model at runtime
 *
 * These endpoints are localhost-only (same trust boundary as control API).
 * Memory model routing is independent from the main /v1/messages switch state.
 */

import {
	loadConfig,
	isProviderConfigured,
	getProviderDetails,
} from '../../shared/config';
import { routeByModel } from '../../shared/providers/router';
import { jsonResponse } from './helpers';

// ---- Memory model runtime state ----

interface MemoryModelState {
	provider: string | null;
	model: string | null;
}

let runtimeMemoryModel: MemoryModelState = {
	provider: null,
	model: null,
};

export function getMemoryModelState(): MemoryModelState {
	return { ...runtimeMemoryModel };
}

export function setMemoryModelState(state: MemoryModelState): void {
	runtimeMemoryModel = { ...state };
}

// ---- /internal/memory-config ----

export async function handleMemoryConfig(
	req: Request,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (req.method === 'GET') {
		return handleMemoryConfigGet(corsHeaders);
	}
	if (req.method === 'POST') {
		return handleMemoryConfigPost(req, corsHeaders);
	}
	return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
}

function handleMemoryConfigGet(corsHeaders: Record<string, string>): Response {
	const config = loadConfig();
	const memCfg = config.memory;
	const resolved = resolveMemoryProvider();

	if (runtimeMemoryModel.provider) {
		return jsonResponse(
			{
				provider: runtimeMemoryModel.provider,
				model: runtimeMemoryModel.model,
				source: 'runtime' as const,
				resolvedProvider: resolved.provider,
				resolvedModel: resolved.model,
			},
			200,
			corsHeaders,
		);
	}

	if (memCfg?.aiProvider) {
		return jsonResponse(
			{
				provider: memCfg.aiProvider,
				model: memCfg.aiModel ?? null,
				source: 'config' as const,
				resolvedProvider: resolved.provider,
				resolvedModel: resolved.model,
			},
			200,
			corsHeaders,
		);
	}

	return jsonResponse(
		{
			provider: null,
			model: null,
			source: 'auto' as const,
			resolvedProvider: resolved.provider,
			resolvedModel: resolved.model,
		},
		200,
		corsHeaders,
	);
}

async function handleMemoryConfigPost(
	req: Request,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const provider = typeof body.provider === 'string' ? body.provider : null;
	const model = typeof body.model === 'string' ? body.model : null;

	runtimeMemoryModel = { provider, model };

	const source = provider ? 'runtime' : 'auto';
	const resolved = resolveMemoryProvider();
	console.log(
		`[control] Memory model ${provider ? `set to ${provider}/${model}` : 'reset to auto'} (resolved: ${resolved.provider}/${resolved.model})`,
	);

	return jsonResponse(
		{
			provider,
			model,
			source,
			resolvedProvider: resolved.provider,
			resolvedModel: resolved.model,
			message: provider
				? `Memory model set to ${provider}/${model}`
				: 'Memory model reset to auto',
		},
		200,
		corsHeaders,
	);
}

// ---- /internal/complete ----

/**
 * Resolve the provider and model to use for memory AI operations.
 *
 * Priority:
 * 1. Explicit provider/model in request body
 * 2. Runtime override (set via /internal/memory-config)
 * 3. Config file memory.aiProvider + memory.aiModel
 * 4. First available configured provider (from memory.aiProviderPriority)
 * 5. Anthropic passthrough (always works — user has ANTHROPIC_API_KEY)
 */
function resolveMemoryProvider(
	requestProvider?: string,
	requestModel?: string,
): { provider: string; model: string } {
	// 1. Explicit request override
	if (requestProvider && requestModel) {
		return { provider: requestProvider, model: requestModel };
	}

	// 2. Runtime override
	if (runtimeMemoryModel.provider && runtimeMemoryModel.model) {
		return {
			provider: runtimeMemoryModel.provider,
			model: runtimeMemoryModel.model,
		};
	}

	// 3. Config file
	const config = loadConfig();
	const memCfg = config.memory;
	if (memCfg?.aiProvider && memCfg?.aiModel) {
		if (isProviderConfigured(config, memCfg.aiProvider)) {
			return { provider: memCfg.aiProvider, model: memCfg.aiModel };
		}
	}

	// 4. First available from priority list
	const priority = memCfg?.aiProviderPriority ?? [
		'zhipu',
		'minimax',
		'deepseek',
	];
	const defaultModels: Record<string, string> = {
		zhipu: 'glm-5',
		minimax: 'MiniMax-M2.5',
		deepseek: 'deepseek-chat',
		kimi: 'kimi-for-coding',
		aliyun: 'qwen3.5-plus',
	};

	for (const p of priority) {
		if (isProviderConfigured(config, p)) {
			const details = getProviderDetails(config, p);
			if (details && details.type !== 'claude-subscription') {
				return { provider: p, model: defaultModels[p] ?? p };
			}
		}
	}

	// 5. Anthropic passthrough
	return { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
}

export async function handleInternalComplete(
	req: Request,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (req.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch {
		return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
	}

	const messages = body.messages as
		| Array<{ role: string; content: string }>
		| undefined;
	if (!messages || !Array.isArray(messages) || messages.length === 0) {
		return jsonResponse(
			{ error: 'messages array is required and must not be empty' },
			400,
			corsHeaders,
		);
	}

	const temperature =
		typeof body.temperature === 'number' ? body.temperature : undefined;
	const maxTokens =
		typeof body.max_tokens === 'number' ? body.max_tokens : 4096;
	const requestProvider =
		typeof body.provider === 'string' ? body.provider : undefined;
	const requestModel =
		typeof body.model === 'string' ? body.model : undefined;

	const resolved = resolveMemoryProvider(requestProvider, requestModel);

	// Special case: Anthropic passthrough — forward via the proxy's own Anthropic connection
	if (resolved.provider === 'anthropic') {
		return handleAnthropicPassthrough(
			messages,
			resolved.model,
			temperature,
			maxTokens,
			corsHeaders,
		);
	}

	try {
		const response = await routeByModel(
			resolved.provider,
			resolved.model,
			messages.map((m) => ({
				role: m.role as 'user' | 'assistant' | 'system',
				content: m.content,
			})),
			{ temperature, maxTokens },
		);

		const content = response.choices[0]?.message?.content ?? '';

		return jsonResponse(
			{
				content,
				model: resolved.model,
				provider: resolved.provider,
				usage: response.usage,
			},
			200,
			corsHeaders,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[internal/complete] Provider ${resolved.provider} failed: ${message}`,
		);

		// Fallback to Anthropic passthrough if configured provider fails
		try {
			return await handleAnthropicPassthrough(
				messages,
				'claude-sonnet-4-20250514',
				temperature,
				maxTokens,
				corsHeaders,
			);
		} catch (fallbackError) {
			return jsonResponse(
				{
					error: `All providers failed. Last: ${message}`,
					provider: resolved.provider,
				},
				502,
				corsHeaders,
			);
		}
	}
}

/**
 * Forward to Anthropic API using the user's own API key.
 * Uses the Anthropic Messages API directly since the user always has credentials.
 */
async function handleAnthropicPassthrough(
	messages: Array<{ role: string; content: string }>,
	model: string,
	temperature: number | undefined,
	maxTokens: number,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const apiKey =
		process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
	if (!apiKey) {
		return jsonResponse(
			{
				error: 'No Anthropic API key found (ANTHROPIC_API_KEY or CLAUDE_API_KEY)',
			},
			500,
			corsHeaders,
		);
	}

	const anthropicBody = {
		model,
		max_tokens: maxTokens,
		messages: messages.map((m) => ({
			role: m.role === 'system' ? 'user' : m.role,
			content: m.content,
		})),
		...(temperature !== undefined ? { temperature } : {}),
	};

	const resp = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify(anthropicBody),
		signal: AbortSignal.timeout(120_000),
	});

	if (!resp.ok) {
		const errorText = await resp.text().catch(() => 'unknown error');
		throw new Error(`Anthropic API error ${resp.status}: ${errorText}`);
	}

	const result = (await resp.json()) as {
		content: Array<{ type: string; text?: string }>;
		model: string;
		usage?: { input_tokens: number; output_tokens: number };
	};

	const content =
		result.content
			?.filter((c) => c.type === 'text')
			.map((c) => c.text)
			.join('') ?? '';

	return jsonResponse(
		{
			content,
			model: result.model,
			provider: 'anthropic',
			usage: result.usage,
		},
		200,
		corsHeaders,
	);
}
