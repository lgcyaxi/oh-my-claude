/**
 * Provider forwarding — routes requests to external provider upstreams
 *
 * Handles both OpenAI-format (Chat Completions / Responses API) and
 * Anthropic-format providers, applying appropriate auth headers and
 * cleaning up provider-specific incompatible headers.
 */

import { forwardToUpstream } from '../response/stream';

/**
 * Forward a request to either an OpenAI-format or Anthropic-format upstream.
 *
 * For OpenAI/Responses API providers, uses Bearer auth and sets Content-Type.
 * For Anthropic-format providers, delegates to forwardToUpstream with x-api-key.
 *
 * Adds provider-specific headers (Codex).
 */
export async function forwardToProvider(
	req: Request,
	targetUrl: string,
	apiKey: string,
	body: Record<string, unknown>,
	isOpenAIFormat: boolean,
	provider?: string,
	providerType?: string,
): Promise<Response> {
	if (!isOpenAIFormat) {
		const cleanReq = new Request(req, {
			headers: new Headers(req.headers),
		});

		// Ollama natively supports Anthropic thinking protocol — keep the header.
		// All other providers reject unknown headers like interleaved-thinking-2025-05-14.
		if (provider !== 'ollama') {
			cleanReq.headers.delete('anthropic-beta');
		}

		// OpenRouter's Anthropic-compatible endpoint requires Bearer auth
		// (x-api-key forces "anthropic" provider, which excludes free models)
		const useBearerAuth = provider === 'openrouter';
		return forwardToUpstream(cleanReq, targetUrl, apiKey, body, false, undefined, useBearerAuth);
	}

	// OpenAI-format: use Bearer token auth
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${apiKey}`,
	};

	// Forward accept header for streaming
	const accept = req.headers.get('accept');
	if (accept) headers['Accept'] = accept;

	// Codex-specific headers (OpenAI OAuth)
	if (providerType === 'openai-oauth') {
		headers['originator'] = 'oh-my-claude';
		// Add ChatGPT-Account-Id from stored credential
		try {
			const { getCredential } = await import('../../shared/auth/store');
			const cred = getCredential('openai');
			if (cred && cred.type === 'oauth-openai' && cred.accountId) {
				headers['ChatGPT-Account-Id'] = cred.accountId;
			}
		} catch {
			// Non-critical — account ID is optional
		}
	}

	return fetch(targetUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(5 * 60 * 1000), // 5 min timeout
	});
}
