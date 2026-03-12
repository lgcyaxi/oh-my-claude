/**
 * OpenAI Responses API SSE → Anthropic Messages API SSE stream conversion
 *
 * TransformStream that converts Responses API streaming events to Anthropic
 * format, handling the different event types:
 *   response.output_item.added → content_block_start
 *   response.output_text.delta → content_block_delta
 *   response.function_call_arguments.delta → content_block_delta (input_json_delta)
 *   response.completed → message_delta + message_stop
 */

import { randomUUID } from 'node:crypto';

export class ResponsesToAnthropicStreamConverter extends TransformStream<
	Uint8Array,
	Uint8Array
> {
	private decoder = new TextDecoder();
	private encoder = new TextEncoder();
	private buffer = '';
	private readonly originalModel: string;
	private readonly messageId: string;
	private sentMessageStart = false;
	private contentBlockIndex = 0;
	private outputItemToBlock = new Map<string, number>();
	private openBlocks = new Set<number>();
	private outputTokens = 0;

	constructor(originalModel: string) {
		super({
			transform: (chunk, controller) =>
				this._transform(chunk, controller),
			flush: (controller) => this._flush(controller),
		});
		this.originalModel = originalModel;
		this.messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
	}

	private _transform(
		chunk: Uint8Array,
		controller: TransformStreamDefaultController<Uint8Array>,
	): void {
		this.buffer += this.decoder.decode(chunk, { stream: true });

		const lines = this.buffer.split('\n');
		this.buffer = lines.pop() ?? '';

		let currentEventType = '';
		for (const line of lines) {
			if (line.startsWith('event: ')) {
				currentEventType = line.slice(7).trim();
				continue;
			}
			if (!line.startsWith('data: ')) continue;
			const dataStr = line.slice(6).trim();

			if (dataStr === '[DONE]') {
				this.emitEnd(controller);
				continue;
			}

			try {
				const data = JSON.parse(dataStr) as Record<string, unknown>;
				this.processEvent(currentEventType, data, controller);
			} catch {
				// Skip invalid JSON
			}
		}
	}

	private processEvent(
		eventType: string,
		data: Record<string, unknown>,
		controller: TransformStreamDefaultController<Uint8Array>,
	): void {
		const type = eventType || (data.type as string) || '';

		if (!this.sentMessageStart) {
			this.emitSSE(controller, 'message_start', {
				type: 'message_start',
				message: {
					id: this.messageId,
					type: 'message',
					role: 'assistant',
					content: [],
					model: this.originalModel,
					stop_reason: null,
					stop_sequence: null,
					usage: { input_tokens: 0, output_tokens: 0 },
				},
			});
			this.sentMessageStart = true;
		}

		switch (type) {
			case 'response.output_item.added': {
				const item = data.item as Record<string, unknown> | undefined;
				if (!item) break;
				const itemId = (item.id as string) ?? '';
				const itemType = item.type as string;
				const blockIdx = this.contentBlockIndex++;
				this.outputItemToBlock.set(itemId, blockIdx);
				this.openBlocks.add(blockIdx);

				if (itemType === 'message' || itemType === 'text') {
					this.emitSSE(controller, 'content_block_start', {
						type: 'content_block_start',
						index: blockIdx,
						content_block: { type: 'text', text: '' },
					});
				} else if (itemType === 'function_call') {
					const name = (item.name as string) ?? '';
					const callId = (item.call_id as string) ?? itemId;
					this.emitSSE(controller, 'content_block_start', {
						type: 'content_block_start',
						index: blockIdx,
						content_block: {
							type: 'tool_use',
							id: callId,
							name,
							input: {},
						},
					});
				}
				break;
			}

			case 'response.content_part.added': {
				const part = data.part as Record<string, unknown> | undefined;
				if (!part) break;

				if (this.openBlocks.size === 0) {
					const blockIdx = this.contentBlockIndex++;
					this.openBlocks.add(blockIdx);
					this.emitSSE(controller, 'content_block_start', {
						type: 'content_block_start',
						index: blockIdx,
						content_block: { type: 'text', text: '' },
					});
				}
				break;
			}

			case 'response.output_text.delta': {
				const delta = (data.delta as string) ?? '';
				if (!delta) break;

				this.outputTokens++;

				const itemId = (data.item_id as string) ?? '';
				let blockIdx = this.outputItemToBlock.get(itemId);

				if (blockIdx === undefined) {
					blockIdx = this.contentBlockIndex++;
					this.outputItemToBlock.set(itemId, blockIdx);
					this.openBlocks.add(blockIdx);
					this.emitSSE(controller, 'content_block_start', {
						type: 'content_block_start',
						index: blockIdx,
						content_block: { type: 'text', text: '' },
					});
				}

				this.emitSSE(controller, 'content_block_delta', {
					type: 'content_block_delta',
					index: blockIdx,
					delta: { type: 'text_delta', text: delta },
				});
				break;
			}

			case 'response.function_call_arguments.delta': {
				const delta = (data.delta as string) ?? '';
				if (!delta) break;

				const itemId = (data.item_id as string) ?? '';
				let blockIdx = this.outputItemToBlock.get(itemId);

				if (blockIdx === undefined) {
					blockIdx = this.contentBlockIndex++;
					this.outputItemToBlock.set(itemId, blockIdx);
					this.openBlocks.add(blockIdx);
					this.emitSSE(controller, 'content_block_start', {
						type: 'content_block_start',
						index: blockIdx,
						content_block: {
							type: 'tool_use',
							id: itemId,
							name: '',
							input: {},
						},
					});
				}

				this.emitSSE(controller, 'content_block_delta', {
					type: 'content_block_delta',
					index: blockIdx,
					delta: { type: 'input_json_delta', partial_json: delta },
				});
				break;
			}

			case 'response.output_item.done': {
				const item = data.item as Record<string, unknown> | undefined;
				const itemId = (item?.id as string) ?? '';
				const blockIdx = this.outputItemToBlock.get(itemId);
				if (blockIdx !== undefined && this.openBlocks.has(blockIdx)) {
					this.emitSSE(controller, 'content_block_stop', {
						type: 'content_block_stop',
						index: blockIdx,
					});
					this.openBlocks.delete(blockIdx);
				}
				break;
			}

			case 'response.output_text.done':
			case 'response.content_part.done': {
				const itemId = (data.item_id as string) ?? '';
				const blockIdx = this.outputItemToBlock.get(itemId);
				if (blockIdx !== undefined && this.openBlocks.has(blockIdx)) {
					this.emitSSE(controller, 'content_block_stop', {
						type: 'content_block_stop',
						index: blockIdx,
					});
					this.openBlocks.delete(blockIdx);
				}
				break;
			}

			case 'response.completed': {
				this.emitEnd(controller, data);
				break;
			}

			case 'response.failed': {
				const error = data.error as Record<string, unknown> | undefined;
				const errorMsg =
					(error?.message as string) ??
					'Unknown error from Codex API';

				for (const blockIdx of this.openBlocks) {
					this.emitSSE(controller, 'content_block_stop', {
						type: 'content_block_stop',
						index: blockIdx,
					});
				}
				this.openBlocks.clear();

				this.emitSSE(controller, 'message_delta', {
					type: 'message_delta',
					delta: { stop_reason: 'end_turn', stop_sequence: null },
					usage: { output_tokens: this.outputTokens },
				});
				this.emitSSE(controller, 'message_stop', {
					type: 'message_stop',
				});

				console.error(
					`[responses-converter] Response failed: ${errorMsg}`,
				);
				break;
			}

			case 'response.created':
			case 'response.in_progress':
				break;

			default:
				if (type && !type.startsWith('response.')) {
					console.error(
						`[responses-converter] Unknown event type: ${type}`,
					);
				}
				break;
		}
	}

	private emitEnd(
		controller: TransformStreamDefaultController<Uint8Array>,
		completedData?: Record<string, unknown>,
	): void {
		for (const blockIdx of this.openBlocks) {
			this.emitSSE(controller, 'content_block_stop', {
				type: 'content_block_stop',
				index: blockIdx,
			});
		}
		this.openBlocks.clear();

		const response = completedData?.response as
			| Record<string, unknown>
			| undefined;
		const usage = response?.usage as Record<string, unknown> | undefined;
		const outputTokens =
			(usage?.output_tokens as number) ?? this.outputTokens;

		const status = (response?.status as string) ?? 'completed';
		const stopReason =
			status === 'completed'
				? 'end_turn'
				: status === 'incomplete'
					? 'max_tokens'
					: 'end_turn';

		this.emitSSE(controller, 'message_delta', {
			type: 'message_delta',
			delta: { stop_reason: stopReason, stop_sequence: null },
			usage: { output_tokens: outputTokens },
		});

		this.emitSSE(controller, 'message_stop', { type: 'message_stop' });
	}

	private emitSSE(
		controller: TransformStreamDefaultController<Uint8Array>,
		eventType: string,
		data: unknown,
	): void {
		const output = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
		controller.enqueue(this.encoder.encode(output));
	}

	private _flush(
		controller: TransformStreamDefaultController<Uint8Array>,
	): void {
		if (this.sentMessageStart && this.openBlocks.size > 0) {
			this.emitEnd(controller);
		}
	}
}
