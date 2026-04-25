/**
 * Other request handler — handles non-messages API paths
 *
 * Always passthroughs to Anthropic (e.g., /v1/complete, other paths).
 * Also intercepts and caches /api/oauth/usage responses for statusline.
 */

import { getPassthroughAuth } from '../auth/auth';
import { forwardToUpstream, createStreamingResponse } from '../response/stream';
import { parseSessionFromPath } from '../state/session';
import {
	nextRequestId,
	QUIET_PATHS,
	isDebug,
	cacheUsageResponse,
} from './stats';
import { toErrorMessage } from '../../shared/utils';

export async function handleOtherRequest(
	req: Request,
	sessionId?: string,
): Promise<Response> {
	const reqId = nextRequestId();

	try {
		const { apiKey, baseUrl, authMode } = getPassthroughAuth();
		const isOAuth = authMode === 'oauth';
		const url = new URL(req.url);

		const sessionInfo = parseSessionFromPath(url.pathname);
		const canonicalPath = sessionInfo
			? sessionInfo.strippedPath
			: url.pathname;
		const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;

		const isQuiet = !isDebug && QUIET_PATHS.includes(canonicalPath);
		if (!isQuiet) {
			const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : '';
			console.error(
				`[proxy #${reqId}]${sessionTag} → Anthropic (passthrough${isOAuth ? '/oauth' : ''}) ${canonicalPath}`,
			);
		}

		const upstreamResponse = await forwardToUpstream(
			req,
			targetUrl,
			apiKey,
			undefined,
			isOAuth,
		);

		if (canonicalPath === '/api/oauth/usage' && upstreamResponse.ok) {
			cacheUsageResponse(
				upstreamResponse.clone() as globalThis.Response,
			).catch((e) =>
				console.warn(
					`[proxy #${reqId}] usage cache failed:`,
					e instanceof Error ? e.message : e,
				),
			);
		}

		return createStreamingResponse(upstreamResponse);
	} catch (error) {
		const message = toErrorMessage(error);
		console.error(`[proxy #${reqId}] Error: ${message}`);
		return new Response(
			JSON.stringify({ error: { type: 'proxy_error', message } }),
			{ status: 502, headers: { 'content-type': 'application/json' } },
		);
	}
}
