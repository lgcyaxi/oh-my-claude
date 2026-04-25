/**
 * Directive route handler — routes requests based on [omc-route:provider/model]
 * directives in system prompts.
 *
 * Skips switch state entirely — directive routing is permanent per-agent.
 * Does NOT decrement any counters.
 */

import { getProviderAuth } from '../auth/auth';
import { loadConfig, isProviderConfigured } from '../../shared/config';
import { sanitizeRequestBody } from '../sanitize';
import { rewriteSystemIdentity } from '../identity';
import { isOpenAIFormatProvider } from '../converters/openai-stream';
import { convertAnthropicToOpenAI } from '../converters/openai-request';
import { convertAnthropicToResponses } from '../converters/responses-request';
import { wrapWithCapture } from '../response/cache';
import { forwardToProvider } from '../routing/provider-forward';
import { createStreamingResponse } from '../response/stream';
import {
	createOpenAIToAnthropicResponse,
	createResponsesToAnthropicResponse,
	collectStreamToAnthropicJson,
} from '../response/builders';
import { recordSessionProviderRequest } from '../state/session';
import { handlePassthrough } from './passthrough';
import { RESPONSES_API_PROVIDERS, trackProviderRequest } from './stats';
import { displayModel } from './display';
import { toErrorMessage } from '../../shared/utils';

export async function handleDirectiveRoute(
	req: Request,
	reqId: number,
	bodyText: string,
	parsedBody: Record<string, unknown>,
	provider: string,
	model: string,
	sessionTag: string,
	sessionId?: string,
): Promise<Response> {
	const config = loadConfig();
	if (!isProviderConfigured(config, provider)) {
		console.error(
			`[proxy #${reqId}]${sessionTag} Route directive → ${displayModel(provider, model)} but provider not configured, ` +
				`falling back to passthrough`,
		);
		return await handlePassthrough(req, reqId, bodyText, sessionTag);
	}

	try {
		const { apiKey, baseUrl, providerType } =
			await getProviderAuth(provider);
		const originalModel = parsedBody.model as string;
		const useResponsesAPI = RESPONSES_API_PROVIDERS.has(providerType);
		const openAIFormat = isOpenAIFormatProvider(providerType);

		rewriteSystemIdentity(parsedBody, model);

		let targetUrl: string;
		let forwardBody: Record<string, unknown>;

		const requestStream = parsedBody.stream !== false;

		if (useResponsesAPI) {
			forwardBody = convertAnthropicToResponses(parsedBody, model);
			targetUrl = `${baseUrl}/responses`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${displayModel(provider, model)} (directive/responses-api) /responses`,
			);
		} else if (openAIFormat) {
			forwardBody = convertAnthropicToOpenAI(parsedBody, model);
			targetUrl = `${baseUrl}/chat/completions`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${displayModel(provider, model)} (directive/openai-fmt) /chat/completions`,
			);
		} else {
			const body = parsedBody;
			body.model = model;
			// Directive names the model explicitly — derive DeepSeek effort from
			// the target model: Pro takes the thinking path (effort=max), Flash
			// takes the fast path (no effort, thinking stripped).
			const directiveEffort = resolveDirectiveEffort(provider, model);
			sanitizeRequestBody(body, provider, { effort: directiveEffort });
			forwardBody = body;

			const url = new URL(req.url);
			targetUrl = `${baseUrl}/v1/messages${url.search}`;

			const effortNote = directiveEffort ? ` effort=${directiveEffort}` : '';
			console.error(
				`[proxy #${reqId}]${sessionTag} → ${displayModel(provider, model)} (directive${effortNote}) /v1/messages`,
			);
		}

		const upstreamResponse = await forwardToProvider(
			req,
			targetUrl,
			apiKey,
			forwardBody,
			openAIFormat || useResponsesAPI,
			provider,
			providerType,
		);

		trackProviderRequest(provider);
		if (sessionId) recordSessionProviderRequest(sessionId, provider);

		let result: Response;
		if (useResponsesAPI) {
			if (!requestStream) {
				result = await collectStreamToAnthropicJson(
					await createResponsesToAnthropicResponse(
						upstreamResponse,
						originalModel,
					),
					originalModel,
				);
			} else {
				result = await createResponsesToAnthropicResponse(
					upstreamResponse,
					originalModel,
				);
			}
		} else if (openAIFormat) {
			result = await createOpenAIToAnthropicResponse(
				upstreamResponse,
				originalModel,
				sessionId,
				provider,
			);
		} else {
			result = createStreamingResponse(
				upstreamResponse,
				undefined,
				originalModel,
				model,
			);
		}

		return wrapWithCapture(result, sessionId, provider, model);
	} catch (error) {
		const message = toErrorMessage(error);
		console.error(
			`[proxy #${reqId}]${sessionTag} Route directive ${displayModel(provider, model)} failed: ${message}, ` +
				`falling back to passthrough`,
		);
		return await handlePassthrough(req, reqId, bodyText, sessionTag);
	}
}

/**
 * Decide DeepSeek thinking effort when the route directive names an explicit
 * model. No tier lookup needed — the model fully determines the code path.
 *
 *   - `deepseek-v4-pro`   → effort=max (thinking path)
 *   - `deepseek-v4-flash` → undefined  (fast path, sanitizer strips thinking)
 *
 * Other providers ignore the returned value.
 */
function resolveDirectiveEffort(
	provider: string,
	model: string,
): 'low' | 'medium' | 'high' | 'max' | undefined {
	if (provider !== 'deepseek') return undefined;
	if (model === 'deepseek-v4-pro') return 'max';
	return undefined;
}
