import type { ToolContext, CallToolResult } from '../shared/types';
import { controlUrl } from './utils';
import { loadConfig, isProviderConfigured } from '../../shared/config';
import type { ProxySwitchState } from '../../proxy/state/types';

export { proxyToolSchemas } from './schemas';

export async function handleProxyTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolContext,
): Promise<CallToolResult | undefined> {
	const cachedSessionId = ctx.getSessionId();

	switch (name) {
		case 'switch_model': {
			const { provider } = args as {
				provider: string;
				model?: string;
			};
			let { model } = args as { model?: string };

			if (!provider) {
				return {
					content: [
						{ type: 'text', text: 'Error: provider is required' },
					],
					isError: true,
				};
			}

			// Ollama auto-discovery: fetch model list when model not specified
			if (!model && provider === 'ollama') {
				// Filter out non-LLM models (embedding, OCR, vision-only)
				const NON_LLM_PATTERNS = [
					/^bge-/i,
					/^nomic-embed/i,
					/^mxbai-embed/i,
					/^snowflake-arctic-embed/i,
					/^all-minilm/i,
					/^paraphrase-/i,
					/^minicpm-v/i,
					/^llava/i,
					/^bakllava/i,
					/^moondream/i,
					/^granite3-guardian/i,
					/-ocr[:/]|^.*-ocr$/i, // OCR models (glm-ocr, deepseek-ocr)
					/-embedding[:/]|^.*-embedding$/i, // embedding models (qwen3-embedding)
				];
				try {
					const ollamaHost = (
						process.env.OLLAMA_HOST ||
						process.env.OLLAMA_API_BASE ||
						'http://localhost:11434'
					).replace(/\/v1\/?$/, '');
					const resp = await fetch(`${ollamaHost}/api/tags`, {
						signal: AbortSignal.timeout(5000),
					});
					if (resp.ok) {
						const data = (await resp.json()) as {
							models?: Array<{ name: string }>;
						};
						const llmModels = (data.models ?? []).filter(
							(m) =>
								!NON_LLM_PATTERNS.some((p) => p.test(m.name)),
						);
						const firstModel = llmModels[0];
						if (firstModel) {
							model = firstModel.name;
						}
					}
				} catch {
					// Ollama not reachable
				}
				if (!model) {
					return {
						content: [
							{
								type: 'text',
								text: 'Error: Could not auto-discover Ollama models. Is Ollama running? Specify a model name explicitly: switch_model(provider="ollama", model="llama3.3")',
							},
						],
						isError: true,
					};
				}
			}

			if (!model) {
				return {
					content: [
						{
							type: 'text',
							text: 'Error: model is required for this provider',
						},
					],
					isError: true,
				};
			}

			// Validate provider exists and is not claude-subscription
			const omcConfig = loadConfig();
			const providerConfig = omcConfig.providers[provider];
			if (!providerConfig) {
				return {
					content: [
						{
							type: 'text',
							text: `Error: Unknown provider "${provider}". Available: ${Object.keys(omcConfig.providers).join(', ')}`,
						},
					],
					isError: true,
				};
			}

			if (providerConfig.type === 'claude-subscription') {
				return {
					content: [
						{
							type: 'text',
							text: `Error: Cannot switch to "${provider}" — it uses Claude subscription. Choose an external provider.`,
						},
					],
					isError: true,
				};
			}

			// Check provider is configured (API key or OAuth credentials)
			if (!isProviderConfigured(omcConfig, provider)) {
				const isOAuth = providerConfig.type === 'openai-oauth';
				const hint = isOAuth
					? `Run 'oh-my-claude auth login ${provider}' to authenticate.`
					: `Set ${providerConfig.api_key_env ?? `${provider.toUpperCase()}_API_KEY`} environment variable.`;
				return {
					content: [
						{
							type: 'text',
							text: `Error: Provider "${provider}" is not configured. ${hint}`,
						},
					],
					isError: true,
				};
			}

			// Notify the per-session proxy control API
			const switchUrl = controlUrl('/switch', cachedSessionId);
			if (!switchUrl) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'Proxy not available. Launch via `oh-my-claude cc` to enable model switching.',
							}),
						},
					],
					isError: true,
				};
			}

			let controlSuccess = false;
			try {
				const resp = await fetch(switchUrl, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ provider, model }),
				});
				controlSuccess = resp.ok;
			} catch {
				// Control API not reachable
			}

			if (!controlSuccess) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'Failed to reach proxy control API. Is the proxy still running?',
							}),
						},
					],
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							switched: true,
							provider,
							model,
							sessionId: cachedSessionId ?? null,
							message: `All requests will be routed to ${provider}/${model} until manually reverted`,
						}),
					},
				],
			};
		}

		case 'switch_status': {
			const statusUrl = controlUrl('/status', cachedSessionId);
			if (!statusUrl) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								proxyAvailable: false,
								switched: false,
								message:
									'Proxy not available. Launch via `oh-my-claude cc` to enable model switching.',
							}),
						},
					],
				};
			}

			let switchState: ProxySwitchState | null = null;
			try {
				const resp = await fetch(statusUrl);
				if (resp.ok) {
					switchState = (await resp.json()) as ProxySwitchState;
				}
			} catch {
				// Control API not reachable
			}

			if (!switchState) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								proxyAvailable: false,
								switched: false,
								message:
									'Failed to reach proxy control API. Is the proxy still running?',
							}),
						},
					],
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							proxyAvailable: true,
							...switchState,
							sessionId: cachedSessionId ?? null,
							...(switchState.switchedAt && {
								switchedAtHuman: new Date(
									switchState.switchedAt,
								).toISOString(),
							}),
						}),
					},
				],
			};
		}

		case 'switch_revert': {
			const revertUrl = controlUrl('/revert', cachedSessionId);
			if (!revertUrl) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'Proxy not available. Launch via `oh-my-claude cc` to enable model switching.',
							}),
						},
					],
					isError: true,
				};
			}

			let controlSuccess = false;
			try {
				const resp = await fetch(revertUrl, { method: 'POST' });
				controlSuccess = resp.ok;
			} catch {
				// Control API not reachable
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							switched: false,
							sessionId: cachedSessionId ?? null,
							message: controlSuccess
								? 'Reverted to passthrough (native Claude)'
								: 'Warning: Failed to reach proxy, but state reset attempted.',
						}),
					},
				],
			};
		}

		default:
			return undefined;
	}
}
