/**
 * Per-provider sanitizer router
 *
 * Default: passthrough (no body sanitization). The proxy handler already
 * strips the `anthropic-beta` header for all switched providers, which
 * prevents most 400 errors from third-party APIs.
 *
 * Provider-specific sanitizers:
 * - DeepSeek V4: unified thinking model (`deepseek-v4-pro`). Enforces
 *   thinking=enabled + output_config.effort=max and replaces Claude's signed
 *   thinking blocks with empty DeepSeek-compatible placeholders.
 * - Kimi: strips thinking blocks and unsupported content types from
 *   conversation history (needed when switching mid-session via omc-switch).
 * - OpenRouter: truncates metadata.user_id, strips thinking blocks,
 *   caps tool definitions (free/small models can't handle 90+ tools).
 */

import {
	stripThinkingBlocks,
	stripTopLevelKeys,
	stripUnsupportedContentTypes,
} from './types';
import { sanitizeDeepSeekV4 } from './deepseek';
import { sanitizeOpenRouter } from './openrouter';

/** Optional per-provider sanitizer options (currently only DeepSeek uses them). */
export interface SanitizeOpts {
	/**
	 * Thinking effort injected as DeepSeek's `output_config.effort`. Forwarded
	 * by the switched/directive handlers from the tier resolver so opus/sonnet
	 * tiers map to `max`/`high` and haiku (Flash) takes the fast path.
	 */
	effort?: 'low' | 'medium' | 'high' | 'max';
}

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
	opts?: SanitizeOpts,
): void {
	switch (provider) {
		case 'deepseek': {
			// V4 split: `deepseek-v4-pro` takes the thinking path with
			// effort (max|high) forwarded from the tier resolver;
			// `deepseek-v4-flash` takes the fast path (no thinking).
			// Legacy model IDs (`deepseek-chat`, `deepseek-reasoner`) are
			// hard-removed from the aliases/registry and never reach here.
			sanitizeDeepSeekV4(body, { effort: opts?.effort });
			return;
		}

		case 'kimi':
			sanitizeAnthropicCompatible(body, 'kimi');
			return;

		case 'ollama':
			// Ollama supports thinking natively — only strip unsupported content types
			stripUnsupportedContentTypes(body, true);
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
