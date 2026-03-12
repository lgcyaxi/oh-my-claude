/**
 * Control API response endpoints
 *
 * Handles: /response (long-poll), /stream (SSE)
 */

import { getLatestResponse } from '../response/cache';
import { jsonResponse } from './helpers';

export async function handleResponse(
	url: URL,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const respSessionId = url.searchParams.get('session');
	if (!respSessionId) {
		return jsonResponse(
			{ error: 'session query parameter is required' },
			400,
			corsHeaders,
		);
	}

	const minSeq = url.searchParams.has('seq')
		? parseInt(url.searchParams.get('seq')!, 10)
		: undefined;
	const shouldWait = url.searchParams.get('wait') === 'true';
	const timeoutMs = Math.min(
		parseInt(url.searchParams.get('timeout') ?? '30000', 10) || 30000,
		120000,
	);

	if (shouldWait) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const resp = getLatestResponse(respSessionId, minSeq);
			if (resp) {
				return jsonResponse(
					{ found: true, response: resp },
					200,
					corsHeaders,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		return jsonResponse({ found: false }, 200, corsHeaders);
	}

	const resp = getLatestResponse(respSessionId, minSeq);
	if (resp) {
		return jsonResponse({ found: true, response: resp }, 200, corsHeaders);
	}
	return jsonResponse({ found: false }, 200, corsHeaders);
}

export async function handleStream(
	url: URL,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const streamSessionId = url.searchParams.get('session');
	if (!streamSessionId) {
		return jsonResponse(
			{ error: 'session query parameter is required' },
			400,
			corsHeaders,
		);
	}

	const streamTimeoutMs = Math.min(
		parseInt(url.searchParams.get('timeout') ?? '120000', 10) || 120000,
		300000,
	);

	const { addCaptureListener, removeCaptureListener } =
		await import('../response/cache');
	type CaptureListenerType = import('../response/cache').CaptureListener;

	const encoder = new TextEncoder();
	let listenerRef: CaptureListenerType | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({ type: 'connected', session: streamSessionId })}\n\n`,
				),
			);

			listenerRef = {
				onDelta: (text: string) => {
					try {
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({ type: 'delta', text })}\n\n`,
							),
						);
					} catch {
						// Stream may be closed
					}
				},
				onComplete: (response) => {
					try {
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({ type: 'done', seq: response.seq, provider: response.provider, model: response.model, usage: response.usage })}\n\n`,
							),
						);
					} catch {
						// Stream may be closed
					}
				},
			};

			addCaptureListener(streamSessionId, listenerRef);

			timeoutId = setTimeout(() => {
				try {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ type: 'timeout' })}\n\n`,
						),
					);
					controller.close();
				} catch {
					/* already closed */
				}
			}, streamTimeoutMs);
		},
		cancel() {
			if (listenerRef) {
				removeCaptureListener(streamSessionId, listenerRef);
				listenerRef = null;
			}
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
			...corsHeaders,
		},
	});
}
