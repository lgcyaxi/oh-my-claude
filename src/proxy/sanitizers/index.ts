/**
 * Per-provider sanitizer router
 *
 * Default: passthrough (no body sanitization). The proxy handler already
 * strips the `anthropic-beta` header for all switched providers, which
 * prevents most 400 errors from third-party APIs.
 *
 * Provider-specific sanitizers:
 * - DeepSeek: rejects tool_reference, thinking signatures differ,
 *   Reasoner model requires thinking blocks in every assistant message.
 * - Kimi: strips thinking blocks and unsupported content types from
 *   conversation history (needed when switching mid-session via omc-switch).
 */

import { THINKING_CONTENT_TYPES, stripThinkingBlocks, stripTopLevelKeys, stripUnsupportedContentTypes } from "./types";
import { sanitizeDeepSeekChat, sanitizeDeepSeekReasoner } from "./deepseek";

/**
 * Sanitize a request body for the target provider.
 *
 * Default is passthrough (no sanitization). The `anthropic-beta` header
 * is already stripped in the handler for all switched providers.
 * Only providers with known body-level incompatibilities need sanitizers.
 *
 * Mutates the body in-place for performance.
 */
export function sanitizeRequestBody(body: Record<string, unknown>, provider: string): void {
  switch (provider) {
    case "deepseek": {
      const model = body.model as string | undefined;
      if (model === "deepseek-reasoner") {
        sanitizeDeepSeekReasoner(body);
      } else {
        sanitizeDeepSeekChat(body);
      }
      return;
    }

    case "kimi":
      sanitizeAnthropicCompatible(body, "kimi");
      return;

    default:
      // No body sanitization needed — most Anthropic-compatible providers
      // (ZhiPu, MiniMax, Aliyun) accept the Anthropic message format.
      // The anthropic-beta header is stripped in the handler.
      return;
  }
}

/**
 * Sanitize for Anthropic-compatible providers that don't support thinking blocks.
 *
 * Strips thinking/redacted_thinking content blocks and the top-level `thinking`
 * config key from the request body. This is needed when switching mid-session
 * because Claude Code includes thinking blocks from prior assistant messages.
 */
function sanitizeAnthropicCompatible(body: Record<string, unknown>, provider: string): void {
  const strippedBlocks = stripThinkingBlocks(body);
  const strippedKeys = stripTopLevelKeys(body);

  if (strippedKeys > 0 || strippedBlocks > 0) {
    console.error(`[sanitize:${provider}] stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`);
  }

  stripUnsupportedContentTypes(body, false);
}

/**
 * Strip thinking blocks for passthrough to Anthropic.
 *
 * Called on every passthrough request to remove thinking blocks from
 * conversation history that may have non-Anthropic signatures (from
 * prior model switches).
 *
 * Also sets thinking to "adaptive" when assistant messages with tool_use
 * lack thinking blocks — prevents "reasoning_content is missing" errors.
 */
export function stripThinkingFromBody(body: Record<string, unknown>): { strippedCount: number; modified: boolean } {
  let count = stripThinkingBlocks(body);
  let modified = count > 0;

  if (hasAssistantToolUseWithoutThinking(body)) {
    body.thinking = { type: "adaptive" };
    modified = true;
    console.error("[sanitize] Set thinking to adaptive for passthrough — assistant tool_use without thinking blocks");
  }

  return { strippedCount: count, modified };
}

/** Check if any assistant message has tool_use blocks but no thinking blocks */
function hasAssistantToolUseWithoutThinking(body: Record<string, unknown>): boolean {
  const thinkingConfig = body.thinking as Record<string, unknown> | undefined;
  if (!thinkingConfig) return false;

  const messages = body.messages;
  if (!Array.isArray(messages)) return false;

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const msg = message as Record<string, unknown>;
    if (msg.role !== "assistant") continue;

    const content = msg.content;
    if (!Array.isArray(content)) continue;

    const hasToolUse = content.some(
      (b: unknown) => b && typeof b === "object" && (b as Record<string, unknown>).type === "tool_use"
    );
    if (!hasToolUse) continue;

    const hasThinking = content.some(
      (b: unknown) => b && typeof b === "object" && THINKING_CONTENT_TYPES.has((b as Record<string, unknown>).type as string)
    );
    if (!hasThinking) return true;
  }

  return false;
}
