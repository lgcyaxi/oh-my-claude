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

import {
	stripThinkingBlocks,
	stripTopLevelKeys,
	stripUnsupportedContentTypes,
} from './types';
import { sanitizeDeepSeekChat, sanitizeDeepSeekReasoner } from './deepseek';

/**
 * Sanitize a request body for the target provider.
 *
 * Default is passthrough (no sanitization). The `anthropic-beta` header
 * is already stripped in the handler for all switched providers.
 * Only providers with known body-level incompatibilities need sanitizers.
 *
 * Mutates the body in-place for performance.
 */
export function sanitizeRequestBody(
	body: Record<string, unknown>,
	provider: string,
): void {
	switch (provider) {
		case 'deepseek': {
			const model = body.model as string | undefined;
			if (model === 'deepseek-reasoner') {
				sanitizeDeepSeekReasoner(body);
			} else {
				sanitizeDeepSeekChat(body);
			}
			return;
		}

		case 'kimi':
			sanitizeAnthropicCompatible(body, 'kimi');
			return;

		case 'openrouter':
			sanitizeOpenRouter(body);
			return;

		default:
			// No body sanitization needed — most Anthropic-compatible providers
			// (ZhiPu, MiniMax, Aliyun) accept the Anthropic message format.
			// The anthropic-beta header is stripped in the handler.
			return;
	}
}

/** OpenRouter enforces a 128-char limit on metadata.user_id */
const OPENROUTER_USER_ID_MAX = 128;

/**
 * Sanitize for OpenRouter's Anthropic-compatible endpoint.
 *
 * OpenRouter validates metadata.user_id ≤ 128 chars, but Claude Code sends
 * a longer identifier. Truncate to stay within the limit.
 */
function sanitizeOpenRouter(body: Record<string, unknown>): void {
	const metadata = body.metadata as Record<string, unknown> | undefined;
	if (metadata && typeof metadata.user_id === 'string') {
		if (metadata.user_id.length > OPENROUTER_USER_ID_MAX) {
			metadata.user_id = metadata.user_id.slice(0, OPENROUTER_USER_ID_MAX);
			console.error(
				`[sanitize:openrouter] truncated metadata.user_id to ${OPENROUTER_USER_ID_MAX} chars`,
			);
		}
	}
}

/**
 * Sanitize for Anthropic-compatible providers that don't support thinking blocks.
 *
 * Strips thinking/redacted_thinking content blocks and the top-level `thinking`
 * config key from the request body. This is needed when switching mid-session
 * because Claude Code includes thinking blocks from prior assistant messages.
 */
function sanitizeAnthropicCompatible(
	body: Record<string, unknown>,
	provider: string,
): void {
	const strippedBlocks = stripThinkingBlocks(body);
	const strippedKeys = stripTopLevelKeys(body);

	if (strippedKeys > 0 || strippedBlocks > 0) {
		console.error(
			`[sanitize:${provider}] stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`,
		);
	}

	stripUnsupportedContentTypes(body, false);
}
