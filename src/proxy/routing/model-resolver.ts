/**
 * Model resolution for switched provider requests
 *
 * Resolves the effective model to use when proxying to an external provider.
 * Supports Claude Code's `/model <name>` command for mid-session model switching
 * (e.g., `/model qwen3-coder-next` when switched to Aliyun).
 *
 * Also supports model-only auto-routing: given a model name, resolves which
 * provider to use. Priority: dedicated provider → hub provider (e.g. aliyun).
 */

import modelsRegistry from '../../shared/config/models-registry.json';

/** Build a set of valid model IDs per provider from the registry (cached) */
export const providerModelSets = new Map<string, Set<string>>();

/**
 * Reverse map: model ID → provider name(s) that serve it.
 * Built from registry at startup. Used for model-driven auto-routing.
 *
 * Indexes both display IDs and realIds so cross-provider models are found.
 * E.g. glm-5 → ['zhipu', 'zai', 'aliyun'] (aliyun has realId: "glm-5").
 */
export const modelToProviders = new Map<string, string[]>();

/**
 * Cross-provider aliases: model → alternative {provider, model} pairs.
 * Used when the primary provider is unavailable and the model has a different
 * ID on the fallback provider (e.g. kimi-for-coding → aliyun/kimi-k2.5).
 */
export const crossProviderAliases = new Map<
	string,
	Array<{ provider: string; model: string }>
>();

for (const p of modelsRegistry.providers) {
	const models = new Set(
		p.models.map((m: { id: string; realId?: string }) => m.realId ?? m.id),
	);
	providerModelSets.set(p.name, models);

	for (const m of p.models) {
		const displayId = m.id;
		const realId = (m as { id: string; realId?: string }).realId;

		// Index by display ID
		const existing = modelToProviders.get(displayId);
		if (existing) {
			existing.push(p.name);
		} else {
			modelToProviders.set(displayId, [p.name]);
		}

		// Also index by realId when it differs from display ID.
		// This makes hub providers (aliyun) discoverable by the canonical model name.
		if (realId && realId !== displayId) {
			const realExisting = modelToProviders.get(realId);
			if (realExisting) {
				realExisting.push(p.name);
			} else {
				modelToProviders.set(realId, [p.name]);
			}
		}
	}
}

// Build cross-provider alias map from registry
const aliases = (modelsRegistry as Record<string, unknown>)
	.crossProviderAliases as
	| Record<string, Array<{ provider: string; model: string }>>
	| undefined;
if (aliases) {
	for (const [model, targets] of Object.entries(aliases)) {
		if (model.startsWith('$')) continue;
		crossProviderAliases.set(model, targets);
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
	if (model.startsWith('claude-')) return null;

	const providers = modelToProviders.get(model);
	if (providers) {
		for (const provider of providers) {
			if (isConfigured(provider)) {
				return provider;
			}
		}
	}

	// Check cross-provider aliases (e.g. kimi-for-coding → aliyun/kimi-k2.5)
	const aliasTargets = crossProviderAliases.get(model);
	if (aliasTargets) {
		for (const target of aliasTargets) {
			if (isConfigured(target.provider)) {
				return target.provider;
			}
		}
	}

	return null;
}

/**
 * Resolve a model to {provider, effectiveModel} with full fallback chain.
 *
 * Used by model-only route directives [omc-route:model]. Resolves which provider
 * to route to and what model ID to send upstream.
 *
 * Priority: dedicated provider (e.g. minimax.com for MiniMax-M2.5) →
 *           hub provider (aliyun) → cross-provider alias fallback.
 *
 * @returns {provider, effectiveModel} or null if no configured provider serves this model
 */
export function resolveModelRoute(
	model: string,
	isConfigured: (provider: string) => boolean,
): { provider: string; effectiveModel: string } | null {
	if (model.startsWith('claude-')) return null;

	// 1. Direct model → provider lookup (includes realId-indexed hub providers)
	const providers = modelToProviders.get(model);
	if (providers) {
		for (const provider of providers) {
			if (isConfigured(provider)) {
				return { provider, effectiveModel: model };
			}
		}
	}

	// 2. Cross-provider aliases (model ID differs on fallback provider)
	const aliasTargets = crossProviderAliases.get(model);
	if (aliasTargets) {
		for (const target of aliasTargets) {
			if (isConfigured(target.provider)) {
				return { provider: target.provider, effectiveModel: target.model };
			}
		}
	}

	return null;
}
