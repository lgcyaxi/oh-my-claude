/**
 * Display helpers for proxy log lines
 *
 * Avoids duplicate provider prefix in model display names.
 * E.g., OpenRouter models like "nvidia/nemotron-3-super-120b-a12b:free" should display as
 * "openrouter/nvidia/nemotron-3-super-120b-a12b:free", not double-prefixed.
 */

/**
 * Format provider/model for log display, avoiding double prefix.
 *
 * If the model already starts with "provider/", returns the model as-is.
 * Otherwise returns "provider/model".
 */
export function displayModel(provider: string, model: string): string {
	return model.startsWith(`${provider}/`) ? model : `${provider}/${model}`;
}
