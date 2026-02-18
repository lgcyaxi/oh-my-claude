/**
 * Route directive extraction from request bodies
 *
 * Agent system prompts can include a routing marker `[omc-route:provider/model]`
 * to permanently route their requests to a specific provider — regardless of
 * the current switch state.
 *
 * This enables team templates to assign each teammate to a specific provider:
 *   - `[omc-route:zhipu/glm-5]` → all requests go to ZhiPu
 *   - `[omc-route:deepseek/deepseek-chat]` → all requests go to DeepSeek
 *
 * The marker looks like a markdown link reference `[...]` — harmless to LLMs.
 *
 * Route directive requests do NOT consume switch counters (they're permanent
 * per-agent routing, not switch-based).
 */

/** Result of extracting a route directive */
export interface RouteDirective {
  provider: string;
  model: string;
}

/**
 * Pattern matching `[omc-route:provider/model]` in text.
 * Provider and model can contain alphanumeric chars, dots, hyphens, and underscores.
 */
const ROUTE_DIRECTIVE_PATTERN = /\[omc-route:([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)\]/;

/**
 * Extract a route directive from a request body.
 *
 * Scans the `system` field of the request body for the pattern
 * `[omc-route:provider/model]`. The system field can be either a string
 * or an array of content blocks (Anthropic format).
 *
 * @param body - Parsed JSON request body
 * @returns The extracted directive, or null if none found
 */
export function extractRouteDirective(body: Record<string, unknown>): RouteDirective | null {
  const system = body.system;
  if (!system) return null;

  // System field can be a string or array of content blocks
  let systemText: string;

  if (typeof system === "string") {
    systemText = system;
  } else if (Array.isArray(system)) {
    // Extract text from content blocks: [{ type: "text", text: "..." }, ...]
    const parts: string[] = [];
    for (const block of system) {
      if (block && typeof block === "object" && (block as Record<string, unknown>).type === "text") {
        const text = (block as Record<string, unknown>).text;
        if (typeof text === "string") {
          parts.push(text);
        }
      }
    }
    systemText = parts.join("\n");
  } else {
    return null;
  }

  const match = systemText.match(ROUTE_DIRECTIVE_PATTERN);
  if (!match) return null;

  return {
    provider: match[1]!,
    model: match[2]!,
  };
}
