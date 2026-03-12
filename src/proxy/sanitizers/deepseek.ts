/**
 * DeepSeek provider sanitizer
 *
 * DeepSeek rejects extended Anthropic content types (tool_reference, etc.)
 * and requires specific handling for the Reasoner model:
 * - deepseek-chat: strip thinking + unsupported types
 * - deepseek-reasoner: replace thinking blocks with empty ones (required by API),
 *   keep top-level thinking config, strip unsupported content types
 */

import {
	THINKING_CONTENT_TYPES,
	stripThinkingBlocks,
	stripTopLevelKeys,
	stripUnsupportedContentTypes,
} from './types';

/** Sanitize for DeepSeek Chat (standard mode) */
export function sanitizeDeepSeekChat(body: Record<string, unknown>): void {
	const strippedBlocks = stripThinkingBlocks(body);
	const strippedKeys = stripTopLevelKeys(body);

	if (strippedKeys > 0 || strippedBlocks > 0) {
		console.error(
			`[sanitize:deepseek-chat] stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`,
		);
	}

	stripUnsupportedContentTypes(body, false);
}

/**
 * Sanitize for DeepSeek Reasoner
 *
 * Reasoner requires every assistant message to contain a thinking block.
 * The top-level thinking config must stay (enables reasoning mode).
 */
export function sanitizeDeepSeekReasoner(body: Record<string, unknown>): void {
	const replaced = replaceThinkingBlocksForReasoner(body);

	if (replaced > 0) {
		console.error(
			`[sanitize:deepseek-reasoner] replaced ${replaced} thinking blocks`,
		);
	}

	// Keep thinking config, strip unsupported content types but preserve thinking blocks
	stripUnsupportedContentTypes(body, true);
}

/**
 * Replace Claude's thinking blocks with empty DeepSeek-compatible thinking blocks.
 * DeepSeek Reasoner requires every assistant message to contain a thinking block.
 */
function replaceThinkingBlocksForReasoner(
	body: Record<string, unknown>,
): number {
	const messages = body.messages;
	if (!Array.isArray(messages)) return 0;

	let count = 0;

	for (const message of messages) {
		if (!message || typeof message !== 'object') continue;
		const msg = message as Record<string, unknown>;
		if (msg.role !== 'assistant') continue;

		const content = msg.content;
		if (typeof content === 'string') {
			msg.content = [
				{ type: 'thinking', thinking: '' },
				{ type: 'text', text: content },
			];
			count++;
			continue;
		}

		if (!Array.isArray(content)) continue;

		let hasThinking = false;
		const filtered: unknown[] = [];

		for (const block of content) {
			if (!block || typeof block !== 'object') {
				filtered.push(block);
				continue;
			}

			const blockType = (block as Record<string, unknown>).type as
				| string
				| undefined;
			if (blockType && THINKING_CONTENT_TYPES.has(blockType)) {
				if (!hasThinking) {
					filtered.push({ type: 'thinking', thinking: '' });
					hasThinking = true;
				}
				count++;
			} else {
				filtered.push(block);
			}
		}

		if (!hasThinking) {
			filtered.unshift({ type: 'thinking', thinking: '' });
			count++;
		}

		msg.content = filtered;
	}

	return count;
}
