/**
 * Route directive extraction from request bodies
 *
 * Agent system prompts can include routing markers:
 *   - `[omc-route:model]`           → model-only (provider resolved at request time)
 *   - `[omc-route:provider/model]`  → explicit provider+model (legacy, backward-compat)
 *
 * Model-only directives enable flexible provider resolution:
 * the proxy picks the best available provider for the model at request time,
 * with priority: dedicated provider → hub provider (e.g. aliyun).
 *
 * The marker looks like a markdown link reference `[...]` — harmless to LLMs.
 *
 * Route directive requests do NOT consume switch counters (they're permanent
 * per-agent routing, not switch-based).
 */

/** Result of extracting a route directive */
export interface RouteDirective {
	/** Provider name — undefined for model-only directives (resolved at request time) */
	provider?: string;
	model: string;
}

/** Legacy format: [omc-route:provider/model] */
const ROUTE_WITH_PROVIDER =
	/\[omc-route:([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)\]/;

/** New format: [omc-route:model] (no slash — provider resolved from model) */
const ROUTE_MODEL_ONLY = /\[omc-route:([a-zA-Z0-9._-]+)\]/;

/**
 * Extract a route directive from a request body.
 *
 * Scans the `system` field for `[omc-route:...]`. Supports both formats:
 * - `[omc-route:provider/model]` → returns {provider, model}
 * - `[omc-route:model]`          → returns {model} (provider undefined)
 *
 * @param body - Parsed JSON request body
 * @returns The extracted directive, or null if none found
 */
export function extractRouteDirective(
	body: Record<string, unknown>,
): RouteDirective | null {
	const system = body.system;
	if (!system) return null;

	let systemText: string;

	if (typeof system === 'string') {
		systemText = system;
	} else if (Array.isArray(system)) {
		const parts: string[] = [];
		for (const block of system) {
			if (
				block &&
				typeof block === 'object' &&
				(block as Record<string, unknown>).type === 'text'
			) {
				const text = (block as Record<string, unknown>).text;
				if (typeof text === 'string') {
					parts.push(text);
				}
			}
		}
		systemText = parts.join('\n');
	} else {
		return null;
	}

	// Try provider+model format first (has slash separator)
	const withProvider = systemText.match(ROUTE_WITH_PROVIDER);
	if (withProvider) {
		return {
			provider: withProvider[1]!,
			model: withProvider[2]!,
		};
	}

	// Try model-only format (no slash)
	const modelOnly = systemText.match(ROUTE_MODEL_ONLY);
	if (modelOnly) {
		return { model: modelOnly[1]! };
	}

	return null;
}
