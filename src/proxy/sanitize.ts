/**
 * Message sanitization for external providers
 *
 * Claude Code sends content block types (e.g., tool_reference, thinking)
 * that some Anthropic-compatible providers don't support. This module
 * conditionally strips unsupported types before forwarding to avoid 400 errors.
 *
 * Provider compatibility:
 * - ZhiPu, MiniMax: fully Anthropic-compatible, no sanitization needed
 *   (except thinking blocks — signatures are provider-specific)
 * - DeepSeek: rejects extended types like tool_reference, needs sanitization
 * - OpenRouter: varies by model, sanitize to be safe
 *
 * Thinking block signatures:
 * Anthropic's API uses cryptographic signatures on thinking blocks.
 * These signatures are provider-specific and cannot be validated across
 * providers. ALL switched requests must strip thinking blocks regardless
 * of provider compatibility level.
 */

/** Content block types that basic providers reliably support */
const SUPPORTED_CONTENT_TYPES = new Set([
  "text",
  "tool_use",
  "tool_result",
  "image",
]);

/** Thinking-related content block types with provider-specific signatures */
const THINKING_CONTENT_TYPES = new Set([
  "thinking",
  "redacted_thinking",
]);

/** Top-level body keys to strip for providers that need sanitization */
const UNSUPPORTED_TOP_LEVEL_KEYS = new Set([
  "thinking",
]);

/**
 * Providers that fully support Anthropic content types (except thinking signatures).
 * These providers skip general sanitization but still need thinking block removal.
 */
const FULL_COMPATIBILITY_PROVIDERS = new Set([
  "zhipu",
  "minimax",
]);

/**
 * Sanitize a request body for external provider compatibility.
 *
 * Two-phase sanitization:
 * 1. Thinking blocks are ALWAYS stripped for ALL providers (signatures are provider-specific)
 * 2. General sanitization (unsupported types) is skipped for FULL_COMPATIBILITY_PROVIDERS
 *
 * Mutates the body in-place for performance (avoid deep clone on every request).
 */
export function sanitizeRequestBody(body: Record<string, unknown>, provider: string): void {
  // Phase 1: Always strip thinking blocks — signatures are provider-specific
  // and Anthropic-signed blocks will be rejected by external providers
  console.error(`[sanitize] Stripping thinking blocks for provider "${provider}"`);
  sanitizeTopLevelKeys(body);
  stripThinkingBlocks(body);

  // Phase 2: Full sanitization for non-compatible providers
  if (FULL_COMPATIBILITY_PROVIDERS.has(provider)) {
    console.error(`[sanitize] Provider "${provider}" has full compatibility, skipping general sanitization`);
    return;
  }

  console.error(`[sanitize] Sanitizing request for provider "${provider}"`);
  sanitizeMessages(body);
}

/**
 * Strip thinking content blocks from a body for passthrough to Anthropic.
 *
 * Called after a switch has occurred in the session to remove
 * non-Anthropic thinking signatures from conversation history.
 * Only removes thinking content blocks from messages — preserves
 * the top-level `thinking` config (Anthropic needs it to enable thinking).
 *
 * Mutates the body in-place.
 */
export function stripThinkingFromBody(body: Record<string, unknown>): void {
  stripThinkingBlocks(body);
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
 * Strip thinking and redacted_thinking content blocks from all messages.
 *
 * Thinking blocks contain cryptographic signatures that are provider-specific.
 * Anthropic-signed thinking blocks will be rejected by external providers,
 * and provider-signed blocks will be rejected by Anthropic.
 *
 * Per Anthropic docs: thinking blocks from previous turns are automatically
 * stripped and not counted towards context. Stripping them proactively is safe
 * and avoids signature validation errors.
 */
function stripThinkingBlocks(body: Record<string, unknown>): void {
  const messages = body.messages;
  if (!Array.isArray(messages)) return;

  let strippedCount = 0;

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;

    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" || !Array.isArray(content)) continue;

    const filtered: unknown[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        filtered.push(block);
        continue;
      }

      const blockType = (block as Record<string, unknown>).type as string | undefined;
      if (blockType && THINKING_CONTENT_TYPES.has(blockType)) {
        strippedCount++;
      } else {
        // Recurse into tool_result blocks (may contain nested thinking blocks)
        if (blockType === "tool_result") {
          strippedCount += stripThinkingFromToolResult(block as Record<string, unknown>);
        }
        filtered.push(block);
      }
    }

    // Replace content — add placeholder if all blocks were thinking
    if (filtered.length === 0) {
      (message as Record<string, unknown>).content = [
        { type: "text", text: "[thinking content stripped]" },
      ];
    } else {
      (message as Record<string, unknown>).content = filtered;
    }
  }

  if (strippedCount > 0) {
    console.error(`[sanitize] Stripped ${strippedCount} thinking/redacted_thinking blocks`);
  }
}

/**
 * Strip thinking blocks from nested content within tool_result blocks.
 * Returns the count of stripped blocks.
 */
function stripThinkingFromToolResult(block: Record<string, unknown>): number {
  const content = block.content;
  if (typeof content === "string" || !Array.isArray(content)) return 0;

  let strippedCount = 0;
  const filtered: unknown[] = [];

  for (const nested of content) {
    if (!nested || typeof nested !== "object") {
      filtered.push(nested);
      continue;
    }

    const nestedType = (nested as Record<string, unknown>).type as string | undefined;
    if (nestedType && THINKING_CONTENT_TYPES.has(nestedType)) {
      strippedCount++;
    } else {
      filtered.push(nested);
    }
  }

  if (filtered.length === 0) {
    block.content = [{ type: "text", text: "[thinking content stripped]" }];
  } else {
    block.content = filtered;
  }

  return strippedCount;
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
