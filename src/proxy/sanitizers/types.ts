/**
 * Shared types and utilities for per-provider sanitizers
 */

/** Content block types that all Anthropic-compatible providers support */
export const SUPPORTED_CONTENT_TYPES = new Set([
  "text",
  "tool_use",
  "tool_result",
  "image",
]);

/** Thinking-related content block types (provider-specific signatures) */
export const THINKING_CONTENT_TYPES = new Set([
  "thinking",
  "redacted_thinking",
]);

/** Top-level body keys unsupported by most external providers */
export const UNSUPPORTED_TOP_LEVEL_KEYS = new Set([
  "thinking",
]);

/**
 * Provider sanitizer interface — each provider implements this.
 * Mutates body in-place for performance.
 */
export interface ProviderSanitizer {
  (body: Record<string, unknown>): void;
}

// ── Shared helpers used by multiple sanitizers ──────────────────────

/** Strip top-level keys that external providers don't support */
export function stripTopLevelKeys(body: Record<string, unknown>): number {
  let count = 0;
  for (const key of UNSUPPORTED_TOP_LEVEL_KEYS) {
    if (key in body) {
      delete body[key];
      count++;
    }
  }
  return count;
}

/** Strip thinking/redacted_thinking content blocks from all messages */
export function stripThinkingBlocks(body: Record<string, unknown>): number {
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
        if (blockType === "tool_result") {
          strippedCount += stripThinkingFromNested(block as Record<string, unknown>);
        }
        filtered.push(block);
      }
    }

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

/** Strip thinking blocks from nested content within tool_result blocks */
function stripThinkingFromNested(block: Record<string, unknown>): number {
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

/** Filter out unsupported content block types from messages */
export function stripUnsupportedContentTypes(body: Record<string, unknown>, keepThinking = false): void {
  const messages = body.messages;
  if (!Array.isArray(messages)) return;

  const strippedTypes = new Set<string>();

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

      if (!blockType) {
        filtered.push(block);
        continue;
      }

      if (SUPPORTED_CONTENT_TYPES.has(blockType) ||
          (keepThinking && THINKING_CONTENT_TYPES.has(blockType))) {
        if (blockType === "tool_result") {
          stripUnsupportedFromToolResult(block as Record<string, unknown>, strippedTypes);
        }
        filtered.push(block);
      } else {
        strippedTypes.add(blockType);
      }
    }

    if (filtered.length === 0) {
      (message as Record<string, unknown>).content = [
        { type: "text", text: "[content filtered]" },
      ];
    } else {
      (message as Record<string, unknown>).content = filtered;
    }
  }

  if (strippedTypes.size > 0) {
    console.error(`[sanitize] Stripped content block types: ${[...strippedTypes].join(", ")}`);
  }
}

function stripUnsupportedFromToolResult(
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
