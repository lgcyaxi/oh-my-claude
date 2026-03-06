/**
 * Response builders — converts upstream responses to Anthropic Messages API format
 *
 * Handles three upstream formats:
 * 1. OpenAI Chat Completions (streaming SSE + non-streaming JSON)
 * 2. OpenAI Responses API (always-streaming SSE, used by Codex)
 * 3. Anthropic-format (pass-through with streaming wrapper)
 *
 * Also provides collectStreamToAnthropicJson for buffering always-streaming
 * providers (Codex) into a single JSON response when `stream: false` is requested.
 */

import { OpenAIToAnthropicStreamConverter } from '../converters/openai-stream';
import { ResponsesToAnthropicStreamConverter } from '../converters/responses-stream';

// ── OpenAI Chat Completions response builder ─────────────────────────────────

/**
 * Create a streaming response that converts OpenAI SSE format to Anthropic SSE format.
 * Used when proxying to OpenAI-format providers (OpenAI).
 */
export async function createOpenAIToAnthropicResponse(
	upstreamResponse: Response,
	originalModel: string,
	sessionId?: string,
	provider?: string,
): Promise<Response> {
	const contentType = upstreamResponse.headers.get('content-type') ?? '';

	// Non-streaming response: convert OpenAI JSON → Anthropic JSON
	if (
		!contentType.includes('text/event-stream') &&
		contentType.includes('application/json')
	) {
		const data = (await upstreamResponse.json()) as Record<string, unknown>;
		const anthropic = convertOpenAIJsonToAnthropic(data, originalModel);
		return new Response(JSON.stringify(anthropic), {
			status: upstreamResponse.status,
			headers: { 'content-type': 'application/json' },
		});
	}

	// Streaming: pipe through converter
	if (!upstreamResponse.body) {
		return new Response(null, { status: upstreamResponse.status });
	}

	console.error(
		`[stream] Converting OpenAI SSE → Anthropic SSE (model: "${originalModel}")`,
	);
	const converter = new OpenAIToAnthropicStreamConverter(originalModel);

	// If sessionId provided, capture during conversion using manual reader piping
	if (sessionId && provider) {
		const { startCapture, appendText, completeCapture } =
			await import('./cache');
		const seq = startCapture(sessionId, provider, originalModel);
		let inputTokens = 0;
		let outputTokens = 0;

		const captureTransform = new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				controller.enqueue(chunk);
				// Parse chunk for text_delta events
				const text = new TextDecoder().decode(chunk);
				const lines = text.split('\n');
				for (const line of lines) {
					if (
						line.startsWith('data: ') &&
						line.includes('content_block_delta')
					) {
						try {
							const data = JSON.parse(line.slice(6));
							if (data.delta?.text)
								appendText(sessionId, seq, data.delta.text);
						} catch {
							/* ignore */
						}
					}
					if (
						line.startsWith('data: ') &&
						line.includes('message_start')
					) {
						try {
							const data = JSON.parse(line.slice(6));
							inputTokens =
								data.message?.usage?.input_tokens || 0;
						} catch {
							/* ignore */
						}
					}
					if (
						line.startsWith('data: ') &&
						line.includes('message_delta')
					) {
						try {
							const data = JSON.parse(line.slice(6));
							outputTokens = data.usage?.output_tokens || 0;
						} catch {
							/* ignore */
						}
					}
					if (
						line.startsWith('data: ') &&
						line.includes('message_stop')
					) {
						completeCapture(sessionId, seq, {
							inputTokens,
							outputTokens,
						});
					}
				}
			},
		});

		const converterStream = captureTransform.readable;
		const captureWriter = captureTransform.writable.getWriter();
		const converterReader = converter.readable.getReader();

		(async () => {
			try {
				while (true) {
					const { done, value } = await converterReader.read();
					if (done) break;
					await captureWriter.write(value);
				}
				await captureWriter.close();
			} catch (err) {
				try {
					captureWriter.abort(err);
				} catch {
					/* ignore */
				}
			}
		})();

		return new Response(converterStream, {
			status: 200,
			headers: {
				'content-type': 'text/event-stream',
				'cache-control': 'no-cache',
				connection: 'keep-alive',
			},
		});
	}

	const transformedStream = upstreamResponse.body.pipeThrough(converter);

	return new Response(transformedStream, {
		status: 200,
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
		},
	});
}

// ── Responses API (Codex) response builder ────────────────────────────────────

/**
 * Create a streaming response that converts Responses API SSE format to Anthropic SSE format.
 * Used when proxying to Codex / OpenAI OAuth providers.
 */
export async function createResponsesToAnthropicResponse(
	upstreamResponse: Response,
	originalModel: string,
): Promise<Response> {
	// Error response — log body for debugging, then pass through
	if (upstreamResponse.status >= 400) {
		let errorBody = '';
		try {
			errorBody = await upstreamResponse.text();
			console.error(
				`[proxy] Codex API error: ${upstreamResponse.status} ${errorBody}`,
			);
		} catch {
			console.error(
				`[proxy] Codex API error: ${upstreamResponse.status} (could not read body)`,
			);
		}
		return new Response(errorBody || null, {
			status: upstreamResponse.status,
			headers: {
				'content-type':
					upstreamResponse.headers.get('content-type') ||
					'application/json',
			},
		});
	}

	if (!upstreamResponse.body) {
		return new Response(null, { status: upstreamResponse.status });
	}

	// Non-streaming response: convert Responses API JSON → Anthropic JSON
	const responseContentType =
		upstreamResponse.headers.get('content-type') ?? '';
	if (
		responseContentType.includes('application/json') &&
		!responseContentType.includes('text/event-stream')
	) {
		const data = (await upstreamResponse.json()) as Record<string, unknown>;
		const anthropic = convertResponsesJsonToAnthropic(data, originalModel);
		return new Response(JSON.stringify(anthropic), {
			status: upstreamResponse.status,
			headers: { 'content-type': 'application/json' },
		});
	}

	// Streaming: Codex API may not set Content-Type: text/event-stream despite returning SSE.
	// We request stream: true, so assume streaming for all 2xx responses with a body.
	console.error(
		`[stream] Converting Responses API SSE → Anthropic SSE (model: "${originalModel}")`,
	);

	// Use manual reader-based piping instead of pipeThrough.
	// Bun 1.x has issues where TransformStream.transform() is never invoked
	// when the input comes from a fetch Response body via pipeThrough.
	const converter = new ResponsesToAnthropicStreamConverter(originalModel);
	const writer = converter.writable.getWriter();
	const reader = upstreamResponse.body.getReader();

	// Pipe upstream → converter in the background
	(async () => {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				await writer.write(value);
			}
			await writer.close();
		} catch (err) {
			console.error(
				`[codex] Stream pipe error: ${err instanceof Error ? err.message : String(err)}`,
			);
			try {
				writer.abort(err);
			} catch {
				/* ignore */
			}
		}
	})();

	return new Response(converter.readable, {
		status: 200,
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
		},
	});
}

// ── SSE-to-JSON buffer for always-streaming providers ─────────────────────────

/**
 * Collect a streaming SSE Anthropic response into a single JSON response.
 *
 * Used when the caller requests `stream: false` but the upstream provider
 * only supports streaming (e.g., Codex Responses API).
 *
 * Reads all SSE events, accumulates text deltas, and returns a complete
 * Anthropic Messages API JSON response.
 */
export async function collectStreamToAnthropicJson(
	sseResponse: Response,
	originalModel: string,
): Promise<Response> {
	if (!sseResponse.body) {
		return new Response(
			JSON.stringify({
				id: `msg_${Date.now()}`,
				type: 'message',
				role: 'assistant',
				content: [{ type: 'text', text: '' }],
				model: originalModel,
				stop_reason: 'end_turn',
				stop_sequence: null,
				usage: { input_tokens: 0, output_tokens: 0 },
			}),
			{ status: 200, headers: { 'content-type': 'application/json' } },
		);
	}

	const reader = sseResponse.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let messageId = `msg_${Date.now()}`;
	const textBlocks: string[] = [];
	let stopReason = 'end_turn';
	let inputTokens = 0;
	let outputTokens = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const dataStr = line.slice(6).trim();
				if (dataStr === '[DONE]') continue;

				try {
					const data = JSON.parse(dataStr) as Record<string, unknown>;
					const type = data.type as string;

					if (type === 'message_start') {
						const msg = data.message as
							| Record<string, unknown>
							| undefined;
						if (msg?.id) messageId = msg.id as string;
						const usage = msg?.usage as
							| Record<string, unknown>
							| undefined;
						if (usage?.input_tokens)
							inputTokens = usage.input_tokens as number;
					} else if (type === 'content_block_delta') {
						const delta = data.delta as
							| Record<string, unknown>
							| undefined;
						if (delta?.type === 'text_delta') {
							textBlocks.push(delta.text as string);
						}
					} else if (type === 'message_delta') {
						const delta = data.delta as
							| Record<string, unknown>
							| undefined;
						if (delta?.stop_reason)
							stopReason = delta.stop_reason as string;
						const usage = data.usage as
							| Record<string, unknown>
							| undefined;
						if (usage?.output_tokens)
							outputTokens = usage.output_tokens as number;
					}
				} catch {
					// Skip invalid JSON
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	const result = {
		id: messageId,
		type: 'message',
		role: 'assistant',
		content: [{ type: 'text', text: textBlocks.join('') }],
		model: originalModel,
		stop_reason: stopReason,
		stop_sequence: null,
		usage: { input_tokens: inputTokens, output_tokens: outputTokens },
	};

	console.error(
		`[proxy] Collected streaming response → JSON (${textBlocks.join('').length} chars)`,
	);

	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

// ── Non-streaming JSON response converters ────────────────────────────────────

/**
 * Convert OpenAI Chat Completions JSON response → Anthropic Messages API JSON.
 */
export function convertOpenAIJsonToAnthropic(
	data: Record<string, unknown>,
	originalModel: string,
): Record<string, unknown> {
	const choices = data.choices as Array<Record<string, unknown>> | undefined;
	const message = choices?.[0]?.message as
		| Record<string, unknown>
		| undefined;
	const text = (message?.content as string) ?? '';
	const usage = data.usage as Record<string, unknown> | undefined;

	return {
		id: (data.id as string) ?? `msg_${Date.now()}`,
		type: 'message',
		role: 'assistant',
		content: [{ type: 'text', text }],
		model: originalModel,
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: {
			input_tokens: (usage?.prompt_tokens as number) ?? 0,
			output_tokens: (usage?.completion_tokens as number) ?? 0,
		},
	};
}

/**
 * Convert OpenAI Responses API JSON response → Anthropic Messages API JSON.
 */
export function convertResponsesJsonToAnthropic(
	data: Record<string, unknown>,
	originalModel: string,
): Record<string, unknown> {
	const output = data.output as Array<Record<string, unknown>> | undefined;
	// Find first message output item with text content
	let text = '';
	if (output) {
		for (const item of output) {
			if (item.type === 'message') {
				const itemContent = item.content as
					| Array<Record<string, unknown>>
					| undefined;
				const textPart = itemContent?.find(
					(c) => c.type === 'output_text',
				);
				if (textPart) {
					text = (textPart.text as string) ?? '';
					break;
				}
			}
		}
	}
	const usage = data.usage as Record<string, unknown> | undefined;

	return {
		id: (data.id as string) ?? `msg_${Date.now()}`,
		type: 'message',
		role: 'assistant',
		content: [{ type: 'text', text }],
		model: originalModel,
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: {
			input_tokens: (usage?.input_tokens as number) ?? 0,
			output_tokens: (usage?.output_tokens as number) ?? 0,
		},
	};
}
