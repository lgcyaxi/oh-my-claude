/**
 * OpenAI Chat Completions SSE → Anthropic Messages API SSE stream conversion
 *
 * TransformStream that converts OpenAI streaming events to Anthropic format,
 * maintaining proper lifecycle events:
 * message_start → content_block_start → content_block_delta* → content_block_stop → message_delta → message_stop
 */

import { randomUUID } from 'node:crypto';

/**
 * Determine if a provider type uses OpenAI-format API
 */
export function isOpenAIFormatProvider(providerType: string): boolean {
	return (
		providerType === 'openai-oauth' || providerType === 'openai-compatible'
	);
}

export class OpenAIToAnthropicStreamConverter extends TransformStream<
	Uint8Array,
	Uint8Array
> {
	private decoder = new TextDecoder();
	private encoder = new TextEncoder();
	private buffer = '';
	private readonly originalModel: string;
	private readonly messageId: string;
	private sentMessageStart = false;
	private sentBlockStart = false;
	private contentBlockIndex = 0;
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

		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;
			const dataStr = line.slice(6).trim();

			if (dataStr === '[DONE]') {
				this.emitEnd(controller);
				continue;
			}

			try {
				const data = JSON.parse(dataStr) as Record<string, unknown>;
				this.processChunk(data, controller);
			} catch {
				// Skip invalid JSON
			}
		}
	}

	private processChunk(
		data: Record<string, unknown>,
		controller: TransformStreamDefaultController<Uint8Array>,
	): void {
		// Use provider-reported usage if available (final chunk with stream_options.include_usage)
		const usage = data.usage as
			| { completion_tokens?: number; prompt_tokens?: number }
			| undefined;
		if (usage?.completion_tokens) {
			this.outputTokens = usage.completion_tokens;
		}

		const choices = data.choices as
			| Array<Record<string, unknown>>
			| undefined;
		if (!choices || choices.length === 0) return;

		const choice = choices[0]!;
		const delta = choice.delta as Record<string, unknown> | undefined;
		const finishReason = choice.finish_reason as string | null;

		// Emit message_start on first chunk
		if (!this.sentMessageStart) {
			this.emitEvent(controller, 'message_start', {
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

		if (delta) {
			// Handle tool calls
			const toolCalls = delta.tool_calls as
				| Array<Record<string, unknown>>
				| undefined;
			if (toolCalls && toolCalls.length > 0) {
				for (const tc of toolCalls) {
					this.processToolCallDelta(tc, controller);
				}
				return;
			}

			// Handle text content
			const content = delta.content as string | undefined;
			if (content !== undefined && content !== null) {
				if (!this.sentBlockStart) {
					this.emitEvent(controller, 'content_block_start', {
						type: 'content_block_start',
						index: this.contentBlockIndex,
						content_block: { type: 'text', text: '' },
					});
					this.sentBlockStart = true;
				}

				// Estimate tokens from text length (~4 chars/token) since chunks != tokens
				this.outputTokens += Math.max(1, Math.ceil(content.length / 4));
				this.emitEvent(controller, 'content_block_delta', {
					type: 'content_block_delta',
					index: this.contentBlockIndex,
					delta: { type: 'text_delta', text: content },
				});
			}
		}

		// Handle finish
		if (finishReason) {
			this.emitEnd(controller, finishReason);
		}
	}

	private processToolCallDelta(
		tc: Record<string, unknown>,
		controller: TransformStreamDefaultController<Uint8Array>,
	): void {
		const fn = tc.function as Record<string, unknown> | undefined;
		if (!fn) return;

		const id = tc.id as string | undefined;
		const name = fn.name as string | undefined;
		const args = fn.arguments as string | undefined;

		if (id && name) {
			if (this.sentBlockStart) {
				this.emitEvent(controller, 'content_block_stop', {
					type: 'content_block_stop',
					index: this.contentBlockIndex,
				});
				this.contentBlockIndex++;
				this.sentBlockStart = false;
			}

			this.emitEvent(controller, 'content_block_start', {
				type: 'content_block_start',
				index: this.contentBlockIndex,
				content_block: { type: 'tool_use', id, name, input: {} },
			});
			this.sentBlockStart = true;
		}

		if (args) {
			this.emitEvent(controller, 'content_block_delta', {
				type: 'content_block_delta',
				index: this.contentBlockIndex,
				delta: { type: 'input_json_delta', partial_json: args },
			});
		}
	}

	private emitEnd(
		controller: TransformStreamDefaultController<Uint8Array>,
		finishReason?: string,
	): void {
		if (this.sentBlockStart) {
			this.emitEvent(controller, 'content_block_stop', {
				type: 'content_block_stop',
				index: this.contentBlockIndex,
			});
			this.sentBlockStart = false;
		}

		// Map OpenAI finish_reason → Anthropic stop_reason explicitly so unknown
		// values (e.g. provider-specific reasons) are at least logged instead of
		// silently coalesced to 'end_turn'.
		let stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence';
		switch (finishReason) {
			case 'stop':
				stopReason = 'end_turn';
				break;
			case 'length':
				stopReason = 'max_tokens';
				break;
			case 'tool_calls':
			case 'function_call':
				stopReason = 'tool_use';
				break;
			case 'content_filter':
				stopReason = 'stop_sequence';
				break;
			default:
				if (finishReason) {
					console.warn(
						`[openai-stream] unknown finish_reason "${finishReason}", mapping to end_turn`,
					);
				}
				stopReason = 'end_turn';
				break;
		}

		this.emitEvent(controller, 'message_delta', {
			type: 'message_delta',
			delta: { stop_reason: stopReason, stop_sequence: null },
			usage: { output_tokens: this.outputTokens },
		});

		this.emitEvent(controller, 'message_stop', { type: 'message_stop' });
	}

	private emitEvent(
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
		if (this.sentMessageStart && this.sentBlockStart) {
			this.emitEnd(controller);
		}
		if (this.buffer.length > 0) {
			if (this.buffer.startsWith('data: ')) {
				const dataStr = this.buffer.slice(6).trim();
				if (dataStr === '[DONE]') {
					this.emitEnd(controller);
				}
			}
		}
	}
}
