/**
 * Anthropic → OpenAI Chat Completions request conversion
 *
 * Converts Anthropic Messages API request bodies to OpenAI Chat Completions
 * format for providers that use the OpenAI-compatible API.
 */

import { randomUUID } from 'node:crypto';

interface AnthropicContentBlock {
	type: string;
	text?: string;
	source?: { type: string; media_type: string; data: string };
	id?: string;
	name?: string;
	input?: unknown;
	tool_use_id?: string;
	content?: unknown;
	is_error?: boolean;
}

interface AnthropicMessage {
	role: string;
	content: string | AnthropicContentBlock[];
}

interface OpenAIMessage {
	role: string;
	content: string | OpenAIContentPart[] | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
	name?: string;
}

interface OpenAIContentPart {
	type: string;
	text?: string;
	image_url?: { url: string; detail?: string };
}

interface OpenAIToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

/**
 * Convert an Anthropic Messages API request body to OpenAI Chat Completions format.
 *
 * Handles:
 * - system field → system role message
 * - Content block arrays → simplified content
 * - Image blocks → OpenAI image_url format
 * - Tool use/result blocks → OpenAI tool calls format
 * - Strips thinking config (not supported by OpenAI-format providers)
 */
export function convertAnthropicToOpenAI(
	body: Record<string, unknown>,
	targetModel: string,
): Record<string, unknown> {
	const messages: OpenAIMessage[] = [];

	// Convert system field to system message
	const system = body.system;
	if (system) {
		if (typeof system === 'string') {
			messages.push({ role: 'system', content: system });
		} else if (Array.isArray(system)) {
			const text = (system as AnthropicContentBlock[])
				.filter((b) => b.type === 'text' && b.text)
				.map((b) => b.text!)
				.join('\n\n');
			if (text) {
				messages.push({ role: 'system', content: text });
			}
		}
	}

	// Convert messages
	const anthropicMessages = (body.messages ?? []) as AnthropicMessage[];
	for (const msg of anthropicMessages) {
		const converted = convertMessage(msg);
		if (converted.length > 0) {
			messages.push(...converted);
		}
	}

	const result: Record<string, unknown> = {
		model: targetModel,
		messages,
		stream: body.stream ?? true,
	};

	// Map compatible fields
	if (body.temperature !== undefined) result.temperature = body.temperature;
	if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens;
	if (body.top_p !== undefined) result.top_p = body.top_p;
	if (body.stop_sequences !== undefined) result.stop = body.stop_sequences;

	// Convert tools if present
	const tools = body.tools;
	if (Array.isArray(tools) && tools.length > 0) {
		result.tools = (tools as Array<Record<string, unknown>>).map((t) => ({
			type: 'function',
			function: {
				name: t.name,
				description: t.description,
				parameters: t.input_schema,
			},
		}));
	}

	return result;
}

/**
 * Convert a single Anthropic message to one or more OpenAI messages.
 * Tool use blocks become separate assistant messages with tool_calls.
 * Tool result blocks become tool role messages.
 */
function convertMessage(msg: AnthropicMessage): OpenAIMessage[] {
	// Simple string content
	if (typeof msg.content === 'string') {
		return [{ role: msg.role, content: msg.content }];
	}

	if (!Array.isArray(msg.content)) {
		return [{ role: msg.role, content: msg.content as string }];
	}

	const blocks = msg.content as AnthropicContentBlock[];

	// Check if this message contains tool use blocks (assistant)
	const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');
	const toolResultBlocks = blocks.filter((b) => b.type === 'tool_result');

	// If tool results, convert each to a separate tool message
	if (toolResultBlocks.length > 0 && msg.role === 'user') {
		const results: OpenAIMessage[] = [];
		for (const block of blocks) {
			if (block.type === 'tool_result') {
				const content =
					typeof block.content === 'string'
						? block.content
						: Array.isArray(block.content)
							? (block.content as AnthropicContentBlock[])
									.filter((b) => b.type === 'text')
									.map((b) => b.text ?? '')
									.join('\n')
							: JSON.stringify(block.content ?? '');
				results.push({
					role: 'tool',
					tool_call_id: block.tool_use_id ?? '',
					content,
				});
			} else if (block.type === 'text' && block.text) {
				results.push({ role: 'user', content: block.text });
			}
		}
		return results;
	}

	// If tool use blocks (assistant message)
	if (toolUseBlocks.length > 0 && msg.role === 'assistant') {
		const textParts = blocks
			.filter((b) => b.type === 'text' && b.text)
			.map((b) => b.text!)
			.join('');

		const toolCalls: OpenAIToolCall[] = toolUseBlocks.map((b) => ({
			id: b.id ?? randomUUID(),
			type: 'function' as const,
			function: {
				name: b.name ?? '',
				arguments:
					typeof b.input === 'string'
						? b.input
						: JSON.stringify(b.input ?? {}),
			},
		}));

		return [
			{
				role: 'assistant',
				content: textParts || null,
				tool_calls: toolCalls,
			},
		];
	}

	// Regular content blocks — convert to OpenAI format
	const hasImages = blocks.some((b) => b.type === 'image');
	if (hasImages) {
		const parts: OpenAIContentPart[] = [];
		for (const block of blocks) {
			if (block.type === 'text' && block.text) {
				parts.push({ type: 'text', text: block.text });
			} else if (block.type === 'image' && block.source) {
				parts.push({
					type: 'image_url',
					image_url: {
						url: `data:${block.source.media_type};base64,${block.source.data}`,
					},
				});
			}
		}
		return [{ role: msg.role, content: parts }];
	}

	// Text-only — join into a single string
	const text = blocks
		.filter((b) => b.type === 'text' && b.text)
		.map((b) => b.text!)
		.join('');

	return [{ role: msg.role, content: text || '' }];
}
