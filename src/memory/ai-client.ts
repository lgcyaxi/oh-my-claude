/**
 * Memory AI Client
 *
 * Thin HTTP client that routes all memory AI operations through the proxy's
 * /internal/complete endpoint. The proxy handles provider selection, model
 * routing, and Anthropic passthrough fallback.
 *
 * This replaces all duplicated provider fallback chains that previously existed
 * in ai-ops.ts and context-memory.ts.
 */

const DEFAULT_CONTROL_PORT = 18911;

function getControlPort(): number {
	const env =
		process.env.OMC_CONTROL_PORT || process.env.OMC_PROXY_CONTROL_PORT;
	if (env) {
		const parsed = parseInt(env, 10);
		if (!isNaN(parsed)) return parsed;
	}
	return DEFAULT_CONTROL_PORT;
}

export interface MemoryAIResponse {
	content: string;
	provider: string;
	model?: string;
	usage?: { input_tokens: number; output_tokens: number };
}

/**
 * Call the proxy's /internal/complete endpoint for memory AI operations.
 *
 * @throws Error if proxy is unavailable or request fails
 */
export async function callMemoryAI(
	prompt: string,
	opts?: {
		temperature?: number;
		max_tokens?: number;
		provider?: string;
		model?: string;
	},
): Promise<MemoryAIResponse> {
	const controlPort = getControlPort();
	const resp = await fetch(
		`http://localhost:${controlPort}/internal/complete`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: prompt }],
				...opts,
			}),
			signal: AbortSignal.timeout(120_000),
		},
	);

	if (!resp.ok) {
		const errorText = await resp.text().catch(() => 'unknown');
		throw new Error(`Memory AI call failed (${resp.status}): ${errorText}`);
	}

	const data = (await resp.json()) as MemoryAIResponse;
	if (!data.content) {
		throw new Error('Memory AI returned empty content');
	}
	return data;
}
