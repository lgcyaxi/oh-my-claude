/**
 * Passthrough handler — transparent pipe to Anthropic API
 *
 * Zero body modification. Forwards the raw request exactly as received.
 * In OAuth mode, forwards original auth headers as-is.
 * In API key mode, substitutes the stored API key.
 *
 * Includes automatic retry: if Anthropic rejects the request due to an
 * invalid thinking block signature, strips thinking blocks and retries.
 */

import { getPassthroughAuth } from '../auth/auth';
import { forwardToUpstream, createStreamingResponse } from '../response/stream';
import { parseSessionFromPath } from '../state/session';
import { stripThinkingBlocks, stripTopLevelKeys } from '../sanitizers/types';

/** Error pattern for invalid thinking block signatures */
const THINKING_SIGNATURE_ERROR = 'Invalid `signature` in `thinking` block';

export async function handlePassthrough(
	req: Request,
	reqId: number,
	bodyText: string,
	sessionTag: string = '',
): Promise<Response> {
	const { apiKey, baseUrl, authMode } = getPassthroughAuth();
	const isOAuth = authMode === 'oauth';

	const url = new URL(req.url);
	const sessionInfo = parseSessionFromPath(url.pathname);
	const canonicalPath = sessionInfo ? sessionInfo.strippedPath : url.pathname;
	const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;

	console.error(
		`[proxy #${reqId}]${sessionTag} → Anthropic (passthrough${isOAuth ? '/oauth' : ''}) ${canonicalPath}`,
	);

	const upstreamResponse = await forwardToUpstream(
		req,
		targetUrl,
		apiKey,
		undefined,
		isOAuth,
		bodyText,
	);

	// Check for thinking signature error and retry with thinking blocks stripped
	if (upstreamResponse.status === 400) {
		const responseBody = await upstreamResponse.text();
		if (responseBody.includes(THINKING_SIGNATURE_ERROR)) {
			console.error(
				`[proxy #${reqId}]${sessionTag} ⚠ Anthropic rejected thinking block signature, retrying with thinking stripped`,
			);

			try {
				const body = JSON.parse(bodyText) as Record<string, unknown>;
				const strippedBlocks = stripThinkingBlocks(body);
				const strippedKeys = stripTopLevelKeys(body);

				console.error(
					`[proxy #${reqId}]${sessionTag} Stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`,
				);

				const retryResponse = await forwardToUpstream(
					req,
					targetUrl,
					apiKey,
					body,
					isOAuth,
				);
				return createStreamingResponse(retryResponse);
			} catch (retryError) {
				console.error(
					`[proxy #${reqId}]${sessionTag} Retry failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
				);
				// Return original error response
				return new Response(responseBody, {
					status: 400,
					headers: { 'content-type': 'application/json' },
				});
			}
		}

		// Non-signature 400 error — return as-is
		return new Response(responseBody, {
			status: 400,
			headers: {
				'content-type': upstreamResponse.headers.get('content-type') ?? 'application/json',
			},
		});
	}

	return createStreamingResponse(upstreamResponse);
}
