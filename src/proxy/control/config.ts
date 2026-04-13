/**
 * Config read API — read-only access to oh-my-claude.json
 *
 * Endpoints:
 *   GET /api/config           — Sanitized config (no API key values)
 *   GET /api/config/providers — Provider config with isConfigured status
 */

import { loadConfig, isProviderConfigured } from '../../shared/config';
import { jsonResponse } from './helpers';
import { toErrorMessage } from '../../shared/utils';

export async function handleConfigRequest(
	_req: Request,
	path: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	try {
		const config = loadConfig();

		if (path === '/api/config/providers') {
			const registry = await import(
				'../../shared/config/models-registry.json'
			);

			const providers = Object.entries(config.providers).map(
				([name, pc]) => {
					const regProvider = (
						registry.providers as Array<{
							name: string;
							label: string;
							models: unknown[];
						}>
					).find((p) => p.name === name);

					// Determine API key env var name
					let envVar: string | undefined;
					const type = pc.type;
					if (type === 'openai-compatible' || type === 'anthropic-compatible') {
						// Common env var patterns
						const envPatterns: Record<string, string> = {
							deepseek: 'DEEPSEEK_API_KEY',
							zhipu: 'ZHIPU_API_KEY',
							zai: 'ZAI_API_KEY',
							minimax: 'MINIMAX_API_KEY',
							'minimax-cn': 'MINIMAX_CN_API_KEY',
							kimi: 'KIMI_API_KEY',
							aliyun: 'ALIYUN_API_KEY',
							openrouter: 'OPENROUTER_API_KEY',
							ollama: 'OLLAMA_HOST',
						};
						envVar = envPatterns[name];
					}

					return {
						name,
						label: regProvider?.label ?? name,
						type: pc.type,
						baseUrl: pc.base_url,
						envVar,
						isConfigured: isProviderConfigured(config, name),
						modelCount: regProvider?.models?.length ?? 0,
					};
				},
			);

			return jsonResponse({ providers }, 200, corsHeaders);
		}

		if (path === '/api/config') {
			// Return sanitized config — strip any API key values
			const sanitized = {
				providers: Object.fromEntries(
					Object.entries(config.providers).map(([name, pc]) => [
						name,
						{
							type: pc.type,
							baseUrl: pc.base_url,
							isConfigured: isProviderConfigured(config, name),
						},
					]),
				),
				agents: config.agents,
				categories: config.categories,
			};
			return jsonResponse(sanitized, 200, corsHeaders);
		}

		return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
	} catch (error) {
		const message = toErrorMessage(error);
		return jsonResponse({ error: message }, 500, corsHeaders);
	}
}
