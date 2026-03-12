/**
 * Models request handler — returns available models from registry
 *
 * When switched to an external provider, returns that provider's models
 * so Claude Code's `/model` command shows the right options.
 * When not switched, falls back to Anthropic's native list.
 */

import { loadConfig, isProviderConfigured } from '../../shared/config';
import modelsRegistry from '../../shared/config/models-registry.json';
import { handleOtherRequest } from './other';

export async function handleModelsRequest(
	req: Request,
	sessionId?: string,
): Promise<Response> {
	const config = loadConfig();
	const now = Math.floor(Date.now() / 1000);

	type RegistryModel = { id: string; label?: string };
	type RegistryProvider = { name: string; models: RegistryModel[] };
	type Registry = {
		providers: RegistryProvider[];
		crossProviderAliases?: Record<
			string,
			Array<{ provider: string; model: string }>
		>;
	};
	const reg = modelsRegistry as unknown as Registry;

	// Build alias winner map: modelId → winning provider name
	const aliasWinners = new Map<string, string>();
	for (const [modelId, targets] of Object.entries(
		reg.crossProviderAliases ?? {},
	)) {
		for (const target of targets) {
			if (isProviderConfigured(config, target.provider)) {
				aliasWinners.set(modelId, target.provider);
				break;
			}
		}
	}

	const seen = new Set<string>();
	const models: Array<{
		type: 'model';
		id: string;
		display_name: string;
		created_at: number;
	}> = [];

	for (const p of reg.providers) {
		if (!isProviderConfigured(config, p.name)) continue;
		if (p.name === 'ollama') continue;

		for (const m of p.models) {
			if (seen.has(m.id)) continue;

			const winner = aliasWinners.get(m.id);
			if (winner && winner !== p.name) continue;

			seen.add(m.id);
			models.push({
				type: 'model',
				id: m.id,
				display_name: m.label ?? m.id,
				created_at: now,
			});
		}
	}

	if (models.length === 0) {
		return handleOtherRequest(req, sessionId);
	}

	return new Response(
		JSON.stringify({
			data: models,
			has_more: false,
			first_id: models[0]?.id,
			last_id: models[models.length - 1]?.id,
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } },
	);
}
