/**
 * Passthrough handler — transparent pipe to Anthropic API
 *
 * Zero body modification. Forwards the raw request exactly as received.
 * In OAuth mode, forwards original auth headers as-is.
 * In API key mode, substitutes the stored API key.
 */

import { getPassthroughAuth } from '../auth/auth';
import { forwardToUpstream, createStreamingResponse } from '../response/stream';
import { parseSessionFromPath } from '../state/session';

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
	return createStreamingResponse(upstreamResponse);
}
