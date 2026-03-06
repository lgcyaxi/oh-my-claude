/**
 * Passthrough handler — forwards requests directly to Anthropic API
 *
 * In OAuth mode, forwards original auth headers as-is.
 * In API key mode, substitutes the stored API key.
 *
 * Always strips thinking blocks from conversation history to prevent
 * "Invalid signature in thinking block" errors.
 */

import { getPassthroughAuth } from '../auth/auth';
import { forwardToUpstream, createStreamingResponse } from '../response/stream';
import { parseSessionFromPath } from '../state/session';
import { stripThinkingFromBody } from '../sanitize';
import { isDebug } from './stats';

export async function handlePassthrough(
	req: Request,
	reqId: number,
	bodyText: string,
	sessionTag: string = '',
): Promise<Response> {
	const { apiKey, baseUrl, authMode } = getPassthroughAuth();
	const isOAuth = authMode === 'oauth';

	// Reconstruct the target URL — strip session prefix if present
	const url = new URL(req.url);
	const sessionInfo = parseSessionFromPath(url.pathname);
	const canonicalPath = sessionInfo ? sessionInfo.strippedPath : url.pathname;
	const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;

	console.error(
		`[proxy #${reqId}]${sessionTag} → Anthropic (passthrough${isOAuth ? '/oauth' : ''}) ${canonicalPath}`,
	);

	// Always strip thinking blocks and handle adaptive thinking for contaminated history
	let bodyOverride: Record<string, unknown> | undefined;
	if (bodyText) {
		try {
			const body = JSON.parse(bodyText) as Record<string, unknown>;
			const { strippedCount, modified } = stripThinkingFromBody(body);
			if (modified) {
				bodyOverride = body;
				if (isDebug) {
					console.error(
						`[proxy #${reqId}]${sessionTag} Sanitized body: ${strippedCount} thinking blocks stripped, thinking mode adjusted (passthrough)`,
					);
				}
			}
		} catch {
			console.error(
				`[proxy #${reqId}]${sessionTag} Warning: could not parse body for thinking sanitization`,
			);
		}
	}

	const upstreamResponse = await forwardToUpstream(
		req,
		targetUrl,
		apiKey,
		bodyOverride,
		isOAuth,
		bodyText,
	);
	return createStreamingResponse(upstreamResponse);
}
