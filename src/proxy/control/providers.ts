/**
 * Control API provider/model endpoints
 *
 * Handles: /providers, /models
 */

import { loadConfig, isProviderConfigured } from '../../shared/config';
import { jsonResponse } from './helpers';

/** Non-LLM model patterns for Ollama filtering */
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
	/-ocr[:/]|^.*-ocr$/i,
	/-embedding[:/]|^.*-embedding$/i,
];

/**
 * Per-model shape exposed by `/providers` and `/models?provider=...`.
 * Keep optional capability / alias fields (note, realId) so the dashboard
 * can render vision/tooling pills without duplicating registry lookups.
 */
type ExposedModel = {
	id: string;
	label: string;
	note?: string;
	realId?: string;
	size?: number;
};

export async function handleProviders(
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const provConfig = loadConfig();
	const registry = await import('../../shared/config/models-registry.json');
	const available: Array<{
		name: string;
		label: string;
		models: ExposedModel[];
	}> = [];

	for (const p of registry.providers) {
		const pName = (p as any).name as string;
		const pc = provConfig.providers[pName];
		if (!pc || pc.type === 'claude-subscription') continue;
		if (!isProviderConfigured(provConfig, pName)) continue;

		// Pass registry entries through with their optional capability fields
		// (note, realId) intact so consumers like SwitchPage + menubar can
		// render vision/tooling pills the same way the Models page does.
		let models: ExposedModel[] = (
			((p as any).models as ExposedModel[]) ?? []
		).map((m) => ({
			id: m.id,
			label: m.label,
			...(m.note ? { note: m.note } : {}),
			...(m.realId ? { realId: m.realId } : {}),
		}));

		// Ollama: auto-discover models if registry list is empty
		if (pName === 'ollama' && models.length === 0) {
			try {
				const ollamaHost = (
					process.env.OLLAMA_HOST ||
					process.env.OLLAMA_API_BASE ||
					'http://localhost:11434'
				).replace(/\/v1\/?$/, '');
				const resp = await fetch(`${ollamaHost}/api/tags`, {
					signal: AbortSignal.timeout(3000),
				});
				if (resp.ok) {
					const data = (await resp.json()) as {
						models?: Array<{ name: string }>;
					};
					models = (data.models ?? [])
						.filter(
							(m) =>
								!NON_LLM_PATTERNS.some((pat) =>
									pat.test(m.name),
								),
						)
						.map((m) => ({ id: m.name, label: m.name }));
				}
			} catch {
				// Ollama unreachable
			}
		}

		available.push({
			name: pName,
			label: (p as any).label ?? pName,
			models,
		});
	}

	return jsonResponse({ providers: available }, 200, corsHeaders);
}

export async function handleModels(
	url: URL,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const modelsProvider = url.searchParams.get('provider');
	if (!modelsProvider) {
		return jsonResponse(
			{ error: 'provider query param is required' },
			400,
			corsHeaders,
		);
	}

	if (modelsProvider === 'ollama') {
		function isLLMModel(name: string): boolean {
			return !NON_LLM_PATTERNS.some((p) => p.test(name));
		}

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
					models?: Array<{
						name: string;
						size: number;
						modified_at: string;
					}>;
				};
				const allModels = data.models ?? [];
				const models = allModels
					.filter((m) => isLLMModel(m.name))
					.map((m) => ({
						id: m.name,
						label: m.name,
						size: m.size,
					}));
				return jsonResponse(
					{
						provider: 'ollama',
						models,
						filtered: allModels.length - models.length,
					},
					200,
					corsHeaders,
				);
			}
			return jsonResponse(
				{
					error: 'Ollama API not reachable',
					hint: 'Is Ollama running? Try: ollama serve',
				},
				502,
				corsHeaders,
			);
		} catch {
			return jsonResponse(
				{
					error: 'Ollama API not reachable',
					hint: 'Is Ollama running? Try: ollama serve',
				},
				502,
				corsHeaders,
			);
		}
	}

	// For other providers, return models from registry
	const modelsRegistryData =
		await import('../../shared/config/models-registry.json');
	const providerEntry = modelsRegistryData.providers.find(
		(p: any) => p.name === modelsProvider,
	);
	if (providerEntry) {
		return jsonResponse(
			{ provider: modelsProvider, models: providerEntry.models },
			200,
			corsHeaders,
		);
	}
	return jsonResponse(
		{ error: `Unknown provider: ${modelsProvider}` },
		404,
		corsHeaders,
	);
}
