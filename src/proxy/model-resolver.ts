/**
 * Model resolution for switched provider requests
 *
 * Resolves the effective model to use when proxying to an external provider.
 * Supports Claude Code's `/model <name>` command for mid-session model switching
 * (e.g., `/model qwen3-coder-next` when switched to Aliyun).
 */

import modelsRegistry from "../shared/config/models-registry.json";

/** Build a set of valid model IDs per provider from the registry (cached) */
export const providerModelSets = new Map<string, Set<string>>();
for (const p of modelsRegistry.providers) {
  // Use realId (upstream model ID) when present, else id
  const models = new Set(p.models.map((m: { id: string; realId?: string }) => m.realId ?? m.id));
  providerModelSets.set(p.name, models);
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
  if (requestModel.startsWith("claude-")) return switchModel;

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

