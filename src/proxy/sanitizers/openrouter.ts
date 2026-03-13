/**
 * OpenRouter provider sanitizer
 *
 * OpenRouter's Anthropic-compatible endpoint (/api) routes to many different
 * models, most of which don't support Claude-specific features:
 *
 * - metadata.user_id must be ≤ 128 chars (OpenRouter validation limit)
 * - Thinking blocks must be stripped (non-Anthropic models reject them)
 * - Tool definitions should be capped (free/small models choke on 90+ tools)
 */

import {
	stripThinkingBlocks,
	stripTopLevelKeys,
	stripUnsupportedContentTypes,
} from './types';

/** OpenRouter enforces a 128-char limit on metadata.user_id */
const OPENROUTER_USER_ID_MAX = 128;

/**
 * Max tools to send to OpenRouter models.
 *
 * Claude Code with MCP servers can send 90+ tool definitions. Free/small
 * models on OpenRouter can't handle that — large tool arrays cause request
 * failures and can corrupt the conversation state even after reverting.
 *
 * 64 is generous enough for all practical use while avoiding overload.
 */
const OPENROUTER_MAX_TOOLS = 64;

/**
 * Sanitize request body for OpenRouter's Anthropic-compatible endpoint.
 *
 * 1. Truncate metadata.user_id to 128 chars
 * 2. Strip thinking blocks (non-Anthropic models don't support them)
 * 3. Cap tool definitions to avoid overloading free/small models
 * 4. Strip unsupported content types
 */
export function sanitizeOpenRouter(body: Record<string, unknown>): void {
	// 1. Truncate metadata.user_id
	truncateUserId(body);

	// 2. Strip thinking blocks and top-level thinking config
	const strippedBlocks = stripThinkingBlocks(body);
	const strippedKeys = stripTopLevelKeys(body);

	if (strippedKeys > 0 || strippedBlocks > 0) {
		console.error(
			`[sanitize:openrouter] stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`,
		);
	}

	// 3. Cap tool definitions
	capTools(body);

	// 4. Strip unsupported content types (tool_reference, etc.)
	stripUnsupportedContentTypes(body, false);
}

/** Truncate metadata.user_id to OPENROUTER_USER_ID_MAX chars */
function truncateUserId(body: Record<string, unknown>): void {
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

/** Cap tool definitions to OPENROUTER_MAX_TOOLS */
function capTools(body: Record<string, unknown>): void {
	const tools = body.tools;
	if (!Array.isArray(tools) || tools.length <= OPENROUTER_MAX_TOOLS) return;

	const original = tools.length;
	body.tools = tools.slice(0, OPENROUTER_MAX_TOOLS);
	console.error(
		`[sanitize:openrouter] capped tools from ${original} to ${OPENROUTER_MAX_TOOLS}`,
	);
}
