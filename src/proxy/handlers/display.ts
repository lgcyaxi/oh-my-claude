/**
 * Display helpers for proxy log lines
 *
 * Avoids duplicate provider prefix in model display names.
 * E.g., OpenRouter models like "openrouter/hunter-alpha" should display as
 * "openrouter/hunter-alpha", not "openrouter/openrouter/hunter-alpha".
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
