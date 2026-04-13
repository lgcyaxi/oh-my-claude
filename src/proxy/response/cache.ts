/**
 * Proxy response cache — captures API responses during SSE streaming
 *
 * Per-session ring buffer (max 5 entries) stores completed responses
 * so auxiliary sessions can retrieve clean model output via the control API
 * instead of fragile pane-scrollback parsing.
 *
 * Capture is side-effect only — all chunks pass through unmodified.
 */

/** Captured response entry */
export interface CapturedResponse {
	/** Monotonic sequence within session */
	seq: number;
	/** Accumulated response text */
	text: string;
	/** Provider name */
	provider: string;
	/** Model ID */
	model: string;
	/** Completion timestamp (0 while streaming) */
	completedAt: number;
	/** True while still receiving SSE chunks */
	streaming: boolean;
	/** Token usage (populated on completion) */
	usage?: { inputTokens: number; outputTokens: number };
}

// ── In-memory cache ─────────────────────────────────────────────────

const MAX_ENTRIES_PER_SESSION = 5;

/** Per-session response cache: sessionId → CapturedResponse[] */
const cache = new Map<string, CapturedResponse[]>();

/** Per-session monotonic sequence counter */
const seqCounters = new Map<string, number>();

/** Start a new capture entry. Returns the assigned sequence number. */
export function startCapture(
	sessionId: string,
	provider: string,
	model: string,
): number {
	const seq = (seqCounters.get(sessionId) ?? 0) + 1;
	seqCounters.set(sessionId, seq);

	const entry: CapturedResponse = {
		seq,
		text: '',
		provider,
		model,
		completedAt: 0,
		streaming: true,
	};

	let entries = cache.get(sessionId);
	if (!entries) {
		entries = [];
		cache.set(sessionId, entries);
	}

	entries.push(entry);

	// Evict oldest when over limit
	while (entries.length > MAX_ENTRIES_PER_SESSION) {
		entries.shift();
	}

	return seq;
}

/** Append text delta to an in-progress capture. */
export function appendText(sessionId: string, seq: number, text: string): void {
	const entries = cache.get(sessionId);
	if (!entries) return;
	const entry = entries.find((e) => e.seq === seq);
	if (entry && entry.streaming) {
		entry.text += text;
		// Notify listeners of new delta
		const set = listeners.get(sessionId);
		if (set) {
			for (const listener of set) {
				try {
					listener.onDelta(text);
				} catch {
					/* ignore listener errors */
				}
			}
		}
	}
}

/** Mark a capture as complete. */
export function completeCapture(
	sessionId: string,
	seq: number,
	usage?: { inputTokens: number; outputTokens: number },
): void {
	const entries = cache.get(sessionId);
	if (!entries) return;
	const entry = entries.find((e) => e.seq === seq);
	if (entry) {
		entry.streaming = false;
		entry.completedAt = Date.now();
		if (usage) entry.usage = usage;
		// Notify listeners of completion
		const set = listeners.get(sessionId);
		if (set) {
			for (const listener of set) {
				try {
					listener.onComplete(entry);
				} catch {
					/* ignore listener errors */
				}
			}
		}
	}
}

/** Get the latest completed response with seq >= minSeq. */
export function getLatestResponse(
	sessionId: string,
	minSeq?: number,
): CapturedResponse | null {
	const entries = cache.get(sessionId);
	if (!entries) return null;

	// Search from newest to oldest
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i]!;
		if (entry.streaming) continue;
		if (minSeq !== undefined && entry.seq < minSeq) continue;
		return entry;
	}
	return null;
}

/** Clean up all cached responses for a session. */
export function cleanupSessionCache(sessionId: string): void {
	cache.delete(sessionId);
	seqCounters.delete(sessionId);
	listeners.delete(sessionId);
}

// ── Event listener registry for streaming ──────────────────────────

/** Listener callback types */
export type CaptureListener = {
	onDelta: (text: string) => void;
	onComplete: (response: CapturedResponse) => void;
};

/** Per-session listener registry: sessionId → Set<CaptureListener> */
const listeners = new Map<string, Set<CaptureListener>>();

/** Register a listener for real-time capture events on a session. */
export function addCaptureListener(
	sessionId: string,
	listener: CaptureListener,
): void {
	let set = listeners.get(sessionId);
	if (!set) {
		set = new Set();
		listeners.set(sessionId, set);
	}
	set.add(listener);
}

/** Remove a previously registered listener. */
export function removeCaptureListener(
	sessionId: string,
	listener: CaptureListener,
): void {
	const set = listeners.get(sessionId);
	if (set) {
		set.delete(listener);
		if (set.size === 0) listeners.delete(sessionId);
	}
}

// ── SSE Capture TransformStream ─────────────────────────────────────

/**
 * TransformStream that parses Anthropic-format SSE events and captures
 * response text as a side effect. All chunks pass through unmodified.
 *
 * Captures:
 * - message_start → input_tokens
 * - content_block_delta (text_delta) → appendText()
 * - message_delta → output_tokens
 * - message_stop → completeCapture()
 */
export class SSECaptureTransformStream extends TransformStream<
	Uint8Array,
	Uint8Array
> {
	constructor(sessionId: string, seq: number) {
		let buffer = '';
		let inputTokens = 0;
		let outputTokens = 0;
		const decoder = new TextDecoder();

		super({
			transform(chunk, controller) {
				// Pass through unmodified
				controller.enqueue(chunk);

				// Parse SSE events from the chunk
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const dataStr = line.slice(6).trim();
					if (dataStr === '[DONE]') continue;

					try {
						const data = JSON.parse(dataStr) as Record<
							string,
							unknown
						>;
						const type = data.type as string;

						if (type === 'message_start') {
							const msg = data.message as
								| Record<string, unknown>
								| undefined;
							const usage = msg?.usage as
								| Record<string, unknown>
								| undefined;
							if (usage?.input_tokens)
								inputTokens = usage.input_tokens as number;
						} else if (type === 'content_block_delta') {
							const delta = data.delta as
								| Record<string, unknown>
								| undefined;
							if (
								delta?.type === 'text_delta' &&
								typeof delta.text === 'string'
							) {
								appendText(sessionId, seq, delta.text);
							}
						} else if (type === 'message_delta') {
							const usage = data.usage as
								| Record<string, unknown>
								| undefined;
							if (usage?.output_tokens)
								outputTokens = usage.output_tokens as number;
						} else if (type === 'message_stop') {
							completeCapture(sessionId, seq, {
								inputTokens,
								outputTokens,
							});
						}
					} catch {
						// Invalid JSON — ignore, passthrough is unaffected
					}
				}
			},

			flush() {
				// If stream ends without message_stop, complete anyway
				const entries = cache.get(sessionId);
				const entry = entries?.find((e) => e.seq === seq);
				if (entry?.streaming) {
					completeCapture(sessionId, seq, {
						inputTokens,
						outputTokens,
					});
				}
			},
		});
	}
}

// ── Response wrapping ───────────────────────────────────────────────

/**
 * Wrap a proxy response with capture. SSE streams are piped through
 * SSECaptureTransformStream; JSON responses are captured directly.
 *
 * Returns the original Response (or a new one with the capture stream).
 * Skips capture if sessionId is undefined.
 */
export function wrapWithCapture(
	response: Response,
	sessionId: string | undefined,
	provider: string,
	model: string,
): Response {
	if (!sessionId) return response;

	const contentType = response.headers.get('content-type') ?? '';

	// SSE stream: capture via manual reader-based piping.
	// Uses reader/writer instead of pipeThrough to avoid Bun 1.x bug where
	// chained TransformStreams silently drop transform() invocations.
	if (contentType.includes('text/event-stream') && response.body) {
		const seq = startCapture(sessionId, provider, model);
		const captureTransform = new SSECaptureTransformStream(sessionId, seq);
		const writer = captureTransform.writable.getWriter();
		const reader = response.body.getReader();

		// Pipe response body → capture transform in background
		(async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					await writer.write(value);
				}
				await writer.close();
			} catch (err) {
				try {
					writer.abort(err);
				} catch {
					/* ignore */
				}
			}
		})();

		return new Response(captureTransform.readable, {
			status: response.status,
			headers: response.headers,
		});
	}

	// JSON response: capture directly
	if (contentType.includes('application/json') && response.body) {
		const seq = startCapture(sessionId, provider, model);

		// Clone the response so we can read the body for capture
		// without consuming the original
		const [stream1, stream2] = response.body.tee();

		// Read one branch for capture (async, fire-and-forget)
		(async () => {
			try {
				const reader = stream2.getReader();
				const chunks: Uint8Array[] = [];
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (value) chunks.push(value);
				}
				// Extract text content from Anthropic Messages API JSON
				try {
					const body = JSON.parse(
						chunks.map((c) => new TextDecoder().decode(c)).join(''),
					) as Record<string, unknown>;
					const content = body.content as
						| Array<Record<string, unknown>>
						| undefined;
					const textParts =
						content
							?.filter((c) => c.type === 'text')
							.map((c) => c.text as string) ?? [];
					appendText(sessionId, seq, textParts.join(''));

					const usage = body.usage as
						| Record<string, unknown>
						| undefined;
					completeCapture(sessionId, seq, {
						inputTokens: (usage?.input_tokens as number) ?? 0,
						outputTokens: (usage?.output_tokens as number) ?? 0,
					});
				} catch {
					completeCapture(sessionId, seq);
				}
			} catch {
				completeCapture(sessionId, seq);
			}
		})();

		return new Response(stream1, {
			status: response.status,
			headers: response.headers,
		});
	}

	// Not a capturable response type
	return response;
}
