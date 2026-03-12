/**
 * Switched handler — forwards requests to external providers
 *
 * Uses session-specific or global state depending on whether sessionId is present.
 * If the provider API key is not configured, gracefully falls back to passthrough.
 */

import { getProviderAuth } from '../auth/auth';
import { loadConfig, isProviderConfigured } from '../../shared/config';
import { sanitizeRequestBody } from '../sanitize';
import { rewriteSystemIdentity } from '../identity';
import { isOpenAIFormatProvider } from '../converters/openai-stream';
import { convertAnthropicToOpenAI } from '../converters/openai-request';
import { convertAnthropicToResponses } from '../converters/responses-request';
import { wrapWithCapture } from '../response/cache';
import { resolveEffectiveModel } from '../routing/model-resolver';
import { forwardToProvider } from '../routing/provider-forward';
import { createStreamingResponse } from '../response/stream';
import {
	createOpenAIToAnthropicResponse,
	createResponsesToAnthropicResponse,
} from '../response/builders';
import { recordSessionProviderRequest } from '../state/session';
import { handlePassthrough } from './passthrough';
import { RESPONSES_API_PROVIDERS, trackProviderRequest } from './stats';

export async function handleSwitched(
	req: Request,
	reqId: number,
	bodyText: string,
	provider: string,
	model: string,
	sessionId?: string,
	sessionTag: string = '',
): Promise<Response> {
	// Check if provider is configured before attempting
	const config = loadConfig();
	if (!isProviderConfigured(config, provider)) {
		console.error(
			`[proxy #${reqId}]${sessionTag} Provider "${provider}" not configured (API key missing), ` +
				`falling back to native Claude`,
		);
		return await handlePassthrough(req, reqId, bodyText, sessionTag);
	}

	try {
		const { apiKey, baseUrl, providerType } =
			await getProviderAuth(provider);
		const useResponsesAPI = RESPONSES_API_PROVIDERS.has(providerType);
		const openAIFormat = isOpenAIFormatProvider(providerType);

		// Parse body and resolve effective model (supports `/model` command)
		const body = JSON.parse(bodyText) as Record<string, unknown>;
		const originalModel = body.model as string;
		const effectiveModel = resolveEffectiveModel(
			originalModel,
			model,
			provider,
		);

		// Rewrite Claude identity in system prompt before any conversion
		rewriteSystemIdentity(body, effectiveModel);

		let targetUrl: string;
		let forwardBody: Record<string, unknown>;

		if (useResponsesAPI) {
			forwardBody = convertAnthropicToResponses(body, effectiveModel);
			targetUrl = `${baseUrl}/responses`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${effectiveModel} (switched/responses-api) /responses`,
			);
		} else if (openAIFormat) {
			forwardBody = convertAnthropicToOpenAI(body, effectiveModel);
			targetUrl = `${baseUrl}/chat/completions`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${effectiveModel} (switched/openai-fmt) /chat/completions`,
			);
		} else {
			body.model = effectiveModel;
			sanitizeRequestBody(body, provider);
			forwardBody = body;

			const url = new URL(req.url);
			targetUrl = `${baseUrl}/v1/messages${url.search}`;

			const modelNote =
				effectiveModel !== model ? ` (user: ${effectiveModel})` : '';
			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${effectiveModel} (switched${modelNote}) /v1/messages`,
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
			result = await createResponsesToAnthropicResponse(
				upstreamResponse,
				originalModel,
			);
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
				effectiveModel,
			);
		}

		return wrapWithCapture(result, sessionId, provider, effectiveModel);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[proxy #${reqId}]${sessionTag} Provider "${provider}" request failed: ${message}, ` +
				`falling back to native Claude`,
		);
		return await handlePassthrough(req, reqId, bodyText, sessionTag);
	}
}
