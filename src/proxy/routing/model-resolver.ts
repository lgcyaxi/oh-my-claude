/**
 * Model resolution for switched provider requests
 *
 * Resolves the effective model to use when proxying to an external provider.
 * Supports Claude Code's `/model <name>` command for mid-session model switching
 * (e.g., `/model qwen3-coder-next` when switched to Aliyun).
 */

import modelsRegistry from '../../shared/config/models-registry.json';

/** Build a set of valid model IDs per provider from the registry (cached) */
export const providerModelSets = new Map<string, Set<string>>();

/**
 * Reverse map: model ID → provider name(s) that serve it.
 * Built from registry at startup. Used for model-driven auto-routing.
 *
 * When a model appears in multiple providers (e.g. glm-5 in zhipu, zai, aliyun),
 * all providers are listed — the caller picks the first configured one.
 */
export const modelToProviders = new Map<string, string[]>();

for (const p of modelsRegistry.providers) {
	// Use realId (upstream model ID) when present, else id
	const models = new Set(
		p.models.map((m: { id: string; realId?: string }) => m.realId ?? m.id),
	);
	providerModelSets.set(p.name, models);

	// Build reverse map: each model ID → list of providers
	for (const m of p.models) {
		const modelId = m.id; // Use display ID (not realId) for lookup
		const existing = modelToProviders.get(modelId);
		if (existing) {
			existing.push(p.name);
		} else {
			modelToProviders.set(modelId, [p.name]);
		}
	}
}

/**
 * Resolve the effective model for a switched provider request.
 *
 * When Claude Code's `/model <name>` command is used, the request body
 * contains the user-chosen model. If that model is valid for the current
 * switched provider, we respect it — enabling mid-session model switching
 * (e.g., `/model qwen3-coder-next` when switched to Aliyun).
 *
 * Otherwise, fall back to the switch state's default model.
 */
export function resolveEffectiveModel(
	requestModel: string | undefined,
	switchModel: string,
	provider: string,
): string {
	if (!requestModel || requestModel === switchModel) return switchModel;

	// Claude Code sends Anthropic model IDs (e.g. "claude-sonnet-4-5-20241022")
	// when no /model override is active. These are never valid for external providers.
	if (requestModel.startsWith('claude-')) return switchModel;

	const validModels = providerModelSets.get(provider);

	// Empty model set (e.g. Ollama) — allow any non-Claude model via /model switching
	if (validModels && validModels.size === 0) {
		return requestModel;
	}

	if (validModels?.has(requestModel)) {
		return requestModel;
	}

	return switchModel;
}

/**
 * Resolve a model name to a provider by checking if it's registered in the models registry.
 *
 * This enables model-driven auto-routing: when Claude Code sends a request with
 * a non-Anthropic model (e.g., "qwen3.5-plus"), this function finds which provider
 * serves that model and returns its name.
 *
 * @param model - The model ID from the request (e.g., "qwen3.5-plus")
 * @param isConfigured - Function to check if a provider is configured
 * @returns The provider name if found and configured, null otherwise
 */
export function resolveModelToProvider(
	model: string | undefined,
	isConfigured: (provider: string) => boolean,
): string | null {
	if (!model) return null;

	// Skip Claude models — they're not in the external provider registry
	if (model.startsWith('claude-')) return null;

	// Check if the model exists in our registry
	const providers = modelToProviders.get(model);
	if (!providers || providers.length === 0) return null;

	// Return the first configured provider
	for (const provider of providers) {
		if (isConfigured(provider)) {
			return provider;
		}
	}

	// Model exists in registry but none of its providers are configured
	return null;
}
