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

/** Canonical Claude capability tiers. */
export type ClaudeTier = 'opus' | 'sonnet' | 'haiku';

/** Effective route decided by tier mapping + user overrides. */
export interface EffectiveRoute {
	model: string;
	effort?: 'low' | 'medium' | 'high' | 'max';
}

interface ClaudeTierEntry {
	model: string;
	effort?: 'low' | 'medium' | 'high' | 'max';
}

/**
 * Registry-driven Claude tier maps per provider. Populated below from
 * `modelsRegistry.providers[].claudeTierMap`. Only providers that opted into
 * tier mapping (DeepSeek, ZhiPu, Z.AI today) appear here.
 */
export const providerClaudeTierMaps = new Map<
	string,
	Record<ClaudeTier, ClaudeTierEntry>
>();

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

	const tierMap = (
		p as { claudeTierMap?: Partial<Record<ClaudeTier, ClaudeTierEntry>> }
	).claudeTierMap;
	if (tierMap?.opus && tierMap.sonnet && tierMap.haiku) {
		providerClaudeTierMaps.set(p.name, {
			opus: tierMap.opus,
			sonnet: tierMap.sonnet,
			haiku: tierMap.haiku,
		});
	}

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
 * Detect which Claude capability tier (opus / sonnet / haiku) a model name
 * belongs to. Returns null for non-Claude or ambiguous names.
 *
 * Matches substrings so it works for both full Anthropic IDs
 * ("claude-opus-4-6-20250101") and short logical names ("claude-opus").
 */
export function resolveClaudeTier(model: string): ClaudeTier | null {
	const lower = model.toLowerCase();
	if (!lower.startsWith('claude-')) return null;
	if (lower.includes('opus')) return 'opus';
	if (lower.includes('sonnet')) return 'sonnet';
	if (lower.includes('haiku')) return 'haiku';
	return null;
}

/**
 * Resolve the effective route (model + optional effort) for a switched
 * provider request.
 *
 * Resolution order:
 *   1. User explicit override via `/model <name>` — respected if the model
 *      is valid for this provider (or the provider accepts any model, e.g.
 *      Ollama). This branch never sets `effort`.
 *   2. Claude-tier request (request model starts with `claude-`) + provider
 *      exposes a `claudeTierMap` in the registry — return the tier entry
 *      ({ model, effort? }).
 *   3. Fallback: the provider's current switch default model, no effort.
 */
export function resolveEffectiveRoute(
	requestModel: string | undefined,
	switchModel: string,
	provider: string,
): EffectiveRoute {
	// (1) /model override path — respect user's explicit choice.
	if (requestModel && requestModel !== switchModel && !requestModel.startsWith('claude-')) {
		const validModels = providerModelSets.get(provider);
		if (validModels && validModels.size === 0) {
			return { model: requestModel };
		}
		if (validModels?.has(requestModel)) {
			return { model: requestModel };
		}
	}

	// (2) Claude tier → provider-specific mapping.
	const tierMap = providerClaudeTierMaps.get(provider);
	if (tierMap && requestModel) {
		const tier = resolveClaudeTier(requestModel);
		if (tier) {
			const entry = tierMap[tier];
			if (entry) {
				const route: EffectiveRoute = { model: entry.model };
				if (entry.effort) route.effort = entry.effort;
				return route;
			}
		}
	}

	// (3) Fallback to the current switch default.
	return { model: switchModel };
}

/**
 * Thin shim around {@link resolveEffectiveRoute} that returns just the model
 * string. Kept for callers that don't need the effort decision.
 */
export function resolveEffectiveModel(
	requestModel: string | undefined,
	switchModel: string,
	provider: string,
): string {
	return resolveEffectiveRoute(requestModel, switchModel, provider).model;
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
 * Priority: dedicated provider (e.g. minimax.com for MiniMax-M2.7) →
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
