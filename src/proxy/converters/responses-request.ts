/**
 * Anthropic → OpenAI Responses API request conversion
 *
 * Converts Anthropic Messages API request bodies to the OpenAI Responses API
 * format used by Codex (chatgpt.com/backend-api/codex/responses).
 *
 * Reference: anomalyco/opencode packages/opencode/src/plugin/codex.ts
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

interface ResponsesInputItem {
	type: string;
	role?: string;
	content?: ResponsesContentPart[] | string;
	call_id?: string;
	name?: string;
	arguments?: string;
	id?: string;
	output?: string;
	status?: string;
}

interface ResponsesContentPart {
	type: string;
	text?: string;
	image_url?: string;
}

/**
 * Convert Anthropic Messages API request → OpenAI Responses API request.
 */
export function convertAnthropicToResponses(
	body: Record<string, unknown>,
	targetModel: string,
): Record<string, unknown> {
	const input: ResponsesInputItem[] = [];

	// Map Anthropic tool_use IDs (toolu_xxx) to OpenAI-compatible IDs (fc_xxx).
	// OpenAI Responses API requires function_call IDs to start with "fc_".
	const toolIdMap = new Map<string, string>();

	const anthropicMessages = (body.messages ?? []) as AnthropicMessage[];
	for (const msg of anthropicMessages) {
		const items = convertMessageToInputItems(msg, toolIdMap);
		input.push(...items);
	}

	const result: Record<string, unknown> = {
		model: targetModel,
		input,
		stream: true,
		store: false,
	};

	// System prompt → instructions field
	const system = body.system;
	if (system) {
		if (typeof system === 'string') {
			result.instructions = system;
		} else if (Array.isArray(system)) {
			const text = (system as AnthropicContentBlock[])
				.filter((b) => b.type === 'text' && b.text)
				.map((b) => b.text!)
				.join('\n\n');
			result.instructions = text || 'You are a helpful assistant.';
		}
	} else {
		result.instructions = 'You are a helpful assistant.';
	}

	// Convert tools
	const tools = body.tools;
	if (Array.isArray(tools) && tools.length > 0) {
		result.tools = (tools as Array<Record<string, unknown>>).map((t) => ({
			type: 'function',
			name: t.name,
			description: t.description,
			parameters: t.input_schema,
		}));
	}

	return result;
}

/**
 * Map an Anthropic tool_use ID (toolu_xxx) to an OpenAI-compatible ID (fc_xxx).
 * Caches the mapping so tool_use and tool_result reference the same ID.
 */
export function mapToolId(
	anthropicId: string,
	idMap: Map<string, string>,
): string {
	const existing = idMap.get(anthropicId);
	if (existing) return existing;

	const suffix = anthropicId.startsWith('toolu_')
		? anthropicId.slice(6)
		: randomUUID().replace(/-/g, '');
	const fcId = `fc_${suffix}`;
	idMap.set(anthropicId, fcId);
	return fcId;
}

/**
 * Convert a single Anthropic message to Responses API input items.
 */
function convertMessageToInputItems(
	msg: AnthropicMessage,
	toolIdMap: Map<string, string>,
): ResponsesInputItem[] {
	if (typeof msg.content === 'string') {
		if (msg.role === 'assistant') {
			return [
				{
					type: 'message',
					role: 'assistant',
					content: [{ type: 'output_text', text: msg.content }],
				},
			];
		}
		return [
			{
				type: 'message',
				role: 'user',
				content: [{ type: 'input_text', text: msg.content }],
			},
		];
	}

	if (!Array.isArray(msg.content)) {
		return [
			{
				type: 'message',
				role: msg.role === 'assistant' ? 'assistant' : 'user',
				content: [
					{
						type:
							msg.role === 'assistant'
								? 'output_text'
								: 'input_text',
						text: String(msg.content),
					},
				],
			},
		];
	}

	const blocks = msg.content as AnthropicContentBlock[];
	const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');
	const toolResultBlocks = blocks.filter((b) => b.type === 'tool_result');

	// Tool results → function_call_output items
	if (toolResultBlocks.length > 0 && msg.role === 'user') {
		const items: ResponsesInputItem[] = [];
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
				const anthropicId = block.tool_use_id ?? '';
				items.push({
					type: 'function_call_output',
					call_id:
						toolIdMap.get(anthropicId) ??
						mapToolId(anthropicId, toolIdMap),
					output: content,
				});
			} else if (block.type === 'text' && block.text) {
				items.push({
					type: 'message',
					role: 'user',
					content: [{ type: 'input_text', text: block.text }],
				});
			}
		}
		return items;
	}

	// Assistant with tool_use blocks → message + function_call items
	if (toolUseBlocks.length > 0 && msg.role === 'assistant') {
		const items: ResponsesInputItem[] = [];

		const textParts = blocks
			.filter((b) => b.type === 'text' && b.text)
			.map((b) => b.text!)
			.join('');

		if (textParts) {
			items.push({
				type: 'message',
				role: 'assistant',
				content: [{ type: 'output_text', text: textParts }],
			});
		}

		for (const block of toolUseBlocks) {
			const anthropicId = block.id ?? '';
			const fcId = mapToolId(anthropicId, toolIdMap);
			items.push({
				type: 'function_call',
				id: fcId,
				call_id: fcId,
				name: block.name ?? '',
				arguments:
					typeof block.input === 'string'
						? block.input
						: JSON.stringify(block.input ?? {}),
				status: 'completed',
			});
		}

		return items;
	}

	// Regular user or assistant message
	const contentParts: ResponsesContentPart[] = [];
	for (const block of blocks) {
		if (block.type === 'text' && block.text) {
			contentParts.push({
				type: msg.role === 'assistant' ? 'output_text' : 'input_text',
				text: block.text,
			});
		} else if (block.type === 'image' && block.source) {
			contentParts.push({
				type: 'input_image',
				image_url: `data:${block.source.media_type};base64,${block.source.data}`,
			});
		}
	}

	if (contentParts.length === 0) {
		contentParts.push({
			type: msg.role === 'assistant' ? 'output_text' : 'input_text',
			text: '',
		});
	}

	return [
		{
			type: 'message',
			role: msg.role === 'assistant' ? 'assistant' : 'user',
			content: contentParts,
		},
	];
}
