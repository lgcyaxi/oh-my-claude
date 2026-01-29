/**
 * Message sanitization for external providers
 *
 * Claude Code sends content block types (e.g., tool_reference, thinking)
 * that some Anthropic-compatible providers don't support. This module
 * conditionally strips unsupported types before forwarding to avoid 400 errors.
 *
 * Provider compatibility:
 * - ZhiPu, MiniMax: fully Anthropic-compatible, no sanitization needed
 * - DeepSeek: rejects extended types like tool_reference, needs sanitization
 * - OpenRouter: varies by model, sanitize to be safe
 */

/** Content block types that basic providers reliably support */
const SUPPORTED_CONTENT_TYPES = new Set([
  "text",
  "tool_use",
  "tool_result",
  "image",
]);

/** Top-level body keys to strip for providers that need sanitization */
const UNSUPPORTED_TOP_LEVEL_KEYS = new Set([
  "thinking",
]);

/**
 * Providers that fully support Anthropic content types.
 * These providers pass requests through without sanitization.
 */
const FULL_COMPATIBILITY_PROVIDERS = new Set([
  "zhipu",
  "minimax",
]);

/**
 * Sanitize a request body for external provider compatibility.
 *
 * Providers in FULL_COMPATIBILITY_PROVIDERS are skipped entirely.
 * Others get unsupported content blocks stripped and top-level keys removed.
 *
 * Mutates the body in-place for performance (avoid deep clone on every request).
 */
export function sanitizeRequestBody(body: Record<string, unknown>, provider: string): void {
  if (FULL_COMPATIBILITY_PROVIDERS.has(provider)) {
    console.error(`[sanitize] Provider "${provider}" has full compatibility, skipping sanitization`);
    return;
  }

  console.error(`[sanitize] Sanitizing request for provider "${provider}"`);
  sanitizeTopLevelKeys(body);
  sanitizeMessages(body);
}

/**
 * Remove top-level keys that external providers don't support
 * (e.g., `thinking` config object)
 */
function sanitizeTopLevelKeys(body: Record<string, unknown>): void {
  for (const key of UNSUPPORTED_TOP_LEVEL_KEYS) {
    if (key in body) {
      delete body[key];
      console.error(`[sanitize] Stripped top-level key: ${key}`);
    }
  }
}

/**
 * Iterate through messages and filter out unsupported content blocks
 */
function sanitizeMessages(body: Record<string, unknown>): void {
  const messages = body.messages;
  if (!Array.isArray(messages)) return;

  const strippedTypes = new Set<string>();

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;

    const content = (message as Record<string, unknown>).content;

    // String content is always safe — skip
    if (typeof content === "string" || !Array.isArray(content)) continue;

    // Filter content blocks, keeping only supported types
    const filtered: unknown[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        filtered.push(block);
        continue;
      }

      const blockType = (block as Record<string, unknown>).type as string | undefined;

      if (!blockType) {
        // No type field — keep as-is (shouldn't happen but be safe)
        filtered.push(block);
        continue;
      }

      if (SUPPORTED_CONTENT_TYPES.has(blockType)) {
        // For tool_result blocks, recursively sanitize nested content
        if (blockType === "tool_result") {
          sanitizeToolResultContent(block as Record<string, unknown>, strippedTypes);
        }
        filtered.push(block);
      } else {
        // Strip: either known-unsupported or unknown type
        strippedTypes.add(blockType);
      }
    }

    // Replace content with filtered blocks
    if (filtered.length === 0) {
      // All blocks were stripped — insert placeholder to avoid empty content
      (message as Record<string, unknown>).content = [
        { type: "text", text: "[content filtered]" },
      ];
    } else {
      (message as Record<string, unknown>).content = filtered;
    }
  }

  if (strippedTypes.size > 0) {
    console.error(
      `[sanitize] Stripped content block types: ${[...strippedTypes].join(", ")}`
    );
  }
}

/**
 * Sanitize nested content within tool_result blocks.
 *
 * tool_result blocks may contain a nested `content` array with
 * the same structure as message content blocks.
 */
function sanitizeToolResultContent(
  block: Record<string, unknown>,
  strippedTypes: Set<string>
): void {
  const content = block.content;
  if (typeof content === "string" || !Array.isArray(content)) return;

  const filtered: unknown[] = [];
  for (const nested of content) {
    if (!nested || typeof nested !== "object") {
      filtered.push(nested);
      continue;
    }

    const nestedType = (nested as Record<string, unknown>).type as string | undefined;
    if (!nestedType || SUPPORTED_CONTENT_TYPES.has(nestedType)) {
      filtered.push(nested);
    } else {
      strippedTypes.add(nestedType);
    }
  }

  if (filtered.length === 0) {
    block.content = [{ type: "text", text: "[content filtered]" }];
  } else {
    block.content = filtered;
  }
}
