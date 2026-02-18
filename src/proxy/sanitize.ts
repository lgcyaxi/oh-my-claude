/**
 * Message sanitization for external providers
 *
 * Claude Code sends content block types (e.g., tool_reference, thinking)
 * that some Anthropic-compatible providers don't support. This module
 * conditionally strips unsupported types before forwarding to avoid 400 errors.
 *
 * Provider compatibility:
 * - ZhiPu (GLM-5), MiniMax (M2.5): fully Anthropic-compatible, support ALL
 *   content types including thinking blocks, tool_reference, etc. No sanitization.
 * - Kimi (K2.5): Anthropic-compatible but rejects tool_reference internal type.
 *   Thinking blocks and config work fine. Minimal sanitization.
 * - DeepSeek: rejects extended types like tool_reference, needs full sanitization
 * - OpenAI (OAuth): varies by model, sanitize to be safe
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
 * Providers that fully support ALL Anthropic content types including thinking blocks,
 * tool_reference, and other internal types. Zero sanitization needed.
 */
const ZERO_SANITIZATION_PROVIDERS = new Set([
  "zhipu",
  "minimax",
]);

/**
 * Kimi supports Anthropic-compatible endpoints but rejects internal content
 * types like tool_reference. Thinking blocks and config work fine.
 */
const KIMI_PROVIDER = "kimi";

/**
 * Sanitize a request body for external provider compatibility.
 *
 * Provider-specific sanitization:
 * - ZhiPu/MiniMax: no sanitization (fully compatible)
 * - Kimi: strip unsupported content types (tool_reference)
 * - DeepSeek Reasoner: replace thinking blocks with empty ones (required by API)
 * - Other providers: strip thinking blocks, thinking config, and unsupported types
 *
 * Mutates the body in-place for performance (avoid deep clone on every request).
 */
export function sanitizeRequestBody(body: Record<string, unknown>, provider: string): void {
  // ZhiPu GLM-5 and MiniMax M2.5 are fully Anthropic-compatible —
  // they handle thinking blocks, tool_reference, and all internal types natively.
  // Zero sanitization needed.
  if (ZERO_SANITIZATION_PROVIDERS.has(provider)) {
    return;
  }

  // Kimi K2.5: Anthropic-compatible but rejects internal content types like
  // tool_reference. Thinking blocks and config work fine (tested).
  if (provider === KIMI_PROVIDER) {
    sanitizeMessages(body, false);
    return;
  }

  // Check if model is deepseek-reasoner (requires thinking blocks in assistant messages)
  const model = body.model as string | undefined;
  const isDeepSeekReasoner = provider === "deepseek" && model === "deepseek-reasoner";

  // Phase 1: Handle thinking content blocks from history
  // DeepSeek Reasoner: replace with empty thinking block (required by API)
  // Other providers: strip entirely
  const strippedBlocks = isDeepSeekReasoner
    ? replaceThinkingBlocksForReasoner(body)
    : stripThinkingBlocks(body);

  // Phase 2: Strip top-level thinking config for non-compatible providers
  // DeepSeek Reasoner needs thinking config to stay — it enables reasoning
  const strippedKeys = isDeepSeekReasoner ? 0 : sanitizeTopLevelKeys(body);

  if (strippedKeys > 0 || strippedBlocks > 0) {
    console.error(`[sanitize] ${provider}: ${isDeepSeekReasoner ? "replaced" : "stripped"} ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`);
  }

  // Phase 3: Full content type sanitization for non-compatible providers
  sanitizeMessages(body, isDeepSeekReasoner);
}

/**
 * Strip thinking content blocks from a body for passthrough to Anthropic.
 *
 * Always called on passthrough requests to remove thinking blocks that
 * may have non-Anthropic signatures (from prior model switches).
 * Only removes thinking content blocks from messages — preserves
 * the top-level `thinking` config (Anthropic needs it to enable thinking).
 *
 * Mutates the body in-place.
 * @returns Number of thinking blocks stripped
 */
export function stripThinkingFromBody(body: Record<string, unknown>): number {
  return stripThinkingBlocks(body);
}

/**
 * Remove top-level keys that external providers don't support
 * (e.g., `thinking` config object)
 * @returns Number of keys stripped
 */
function sanitizeTopLevelKeys(body: Record<string, unknown>): number {
  let count = 0;
  for (const key of UNSUPPORTED_TOP_LEVEL_KEYS) {
    if (key in body) {
      delete body[key];
      count++;
    }
  }
  return count;
}

/**
 * Replace Claude's thinking blocks with empty DeepSeek-compatible thinking blocks.
 *
 * DeepSeek Reasoner API requires every assistant message to contain a thinking block.
 * When switching from Claude to DeepSeek Reasoner mid-conversation, assistant messages
 * in history may have Claude's thinking blocks (with incompatible signatures) or none
 * at all. This function ensures every assistant message has a DeepSeek-compatible
 * thinking block.
 *
 * @returns Number of thinking blocks replaced/added
 */
function replaceThinkingBlocksForReasoner(body: Record<string, unknown>): number {
  const messages = body.messages;
  if (!Array.isArray(messages)) return 0;

  let count = 0;

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const msg = message as Record<string, unknown>;

    // Only process assistant messages
    if (msg.role !== "assistant") continue;

    const content = msg.content;
    if (typeof content === "string") {
      // String content — convert to array with thinking + text blocks
      msg.content = [
        { type: "thinking", thinking: "" },
        { type: "text", text: content },
      ];
      count++;
      continue;
    }

    if (!Array.isArray(content)) continue;

    // Check if there's already a thinking block
    let hasThinking = false;
    const filtered: unknown[] = [];

    for (const block of content) {
      if (!block || typeof block !== "object") {
        filtered.push(block);
        continue;
      }

      const blockType = (block as Record<string, unknown>).type as string | undefined;
      if (blockType && THINKING_CONTENT_TYPES.has(blockType)) {
        // Replace with empty DeepSeek-format thinking block (only keep first one)
        if (!hasThinking) {
          filtered.push({ type: "thinking", thinking: "" });
          hasThinking = true;
        }
        count++;
      } else {
        filtered.push(block);
      }
    }

    // If no thinking block found, prepend one (DeepSeek requires it)
    if (!hasThinking) {
      filtered.unshift({ type: "thinking", thinking: "" });
      count++;
    }

    msg.content = filtered;
  }

  return count;
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
 *
 * @returns Number of thinking blocks stripped
 */
function stripThinkingBlocks(body: Record<string, unknown>): number {
  const messages = body.messages;
  if (!Array.isArray(messages)) return 0;

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

  return strippedCount;
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
 * Iterate through messages and filter out unsupported content blocks.
 * When keepThinking is true (DeepSeek Reasoner), thinking blocks are preserved.
 */
function sanitizeMessages(body: Record<string, unknown>, keepThinking = false): void {
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

      if (SUPPORTED_CONTENT_TYPES.has(blockType) ||
          (keepThinking && THINKING_CONTENT_TYPES.has(blockType))) {
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
