/**
 * Handler module entry point — main request router + re-exports
 *
 * Routing priority (highest first):
 * 1.  Route directive in system prompt [omc-route:provider/model]
 * 2.  Model-driven auto-routing (if model is in registry and provider configured)
 * 3.  Session-scoped state (if session ID present in URL path)
 * 4.  Global state (file-based, backward compatible)
 * 5.  Passthrough to Anthropic (default)
 */

import { readSwitchState, resetSwitchState } from '../state/switch';
import {
	readSessionState,
	writeSessionState,
	resetSessionState,
	hasSession,
	recordSessionProviderRequest,
} from '../state/session';
import { extractRouteDirective } from '../routing/route-directive';
import {
	resolveModelToProvider,
	resolveModelRoute,
	providerModelSets,
} from '../routing/model-resolver';
import { nextRequestId } from './stats';
import { handlePassthrough } from './passthrough';
import { handleSwitched } from './switched';
import { handleDirectiveRoute } from './directive';
import { loadConfig, isProviderConfigured } from '../../shared/config';
import type { ProxySwitchState } from '../state/types';
import { displayModel } from './display';
import { toErrorMessage } from '../../shared/utils';

// Re-export all handler functions for consumers
export { handlePassthrough } from './passthrough';
export { handleSwitched } from './switched';
export { handleDirectiveRoute } from './directive';
export { handleOtherRequest } from './other';
export { handleModelsRequest } from './models';
export { getProxyStats, getProviderRequestCounts } from './stats';

/**
 * Handle an incoming /v1/messages request from Claude Code
 */
export async function handleMessages(
	req: Request,
	sessionId?: string,
): Promise<Response> {
	const reqId = nextRequestId();
	const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : '';

	// Read body ONCE — prevents double-consumption when fallback paths need the body
	const bodyText = await req.text();

	try {
		// --- Priority 1: Route directive in system prompt ---
		let parsedBody: Record<string, unknown> | undefined;
		try {
			parsedBody = JSON.parse(bodyText) as Record<string, unknown>;
		} catch {
			// Not valid JSON — skip directive check, forward raw
		}

		if (parsedBody) {
			const directive = extractRouteDirective(parsedBody);
			if (directive) {
				if (directive.provider) {
					// Legacy format: [omc-route:provider/model] — direct route
					return await handleDirectiveRoute(
						req,
						reqId,
						bodyText,
						parsedBody,
						directive.provider,
						directive.model,
						sessionTag,
						sessionId,
					);
				}

				// Model-only format: [omc-route:model] — resolve provider from model
				const config = loadConfig();
				const resolved = resolveModelRoute(directive.model, (p) =>
					isProviderConfigured(config, p),
				);
				if (resolved) {
					console.error(
						`[proxy #${reqId}]${sessionTag} Model-only directive: ${directive.model} → ${resolved.provider}/${resolved.effectiveModel}`,
					);
					return await handleDirectiveRoute(
						req,
						reqId,
						bodyText,
						parsedBody,
						resolved.provider,
						resolved.effectiveModel,
						sessionTag,
						sessionId,
					);
				}

				// No configured provider serves this model — fall through to other priorities
				console.error(
					`[proxy #${reqId}]${sessionTag} Model-only directive: ${directive.model} — no configured provider, falling through`,
				);
			}
		}

		// --- Priority 2: Model-driven auto-routing ---
		if (parsedBody) {
			const requestModel = parsedBody.model as string | undefined;
			const config = loadConfig();

			const provider = resolveModelToProvider(requestModel, (p) =>
				isProviderConfigured(config, p),
			);

			if (provider) {
				// Use request model if specified, otherwise get first model from provider
				const model: string =
					requestModel ||
					providerModelSets.get(provider)?.values().next().value ||
					'unknown';

				console.error(
					`[proxy #${reqId}]${sessionTag} Auto-routing: ${requestModel} → ${displayModel(provider, model)}`,
				);

				return await handleDirectiveRoute(
					req,
					reqId,
					bodyText,
					parsedBody,
					provider,
					model,
					sessionTag,
					sessionId,
				);
			}
		}

		// --- Priority 3 & 4: Session state → global state → passthrough ---
		let state: ProxySwitchState;

		if (sessionId) {
			state = readSessionState(sessionId);
			if (!state.switched) {
				const globalState = readSwitchState();
				if (globalState.switched) {
					state = globalState;
				}
			}
			// Materialize inherited state into session store
			if (state.switched && !hasSession(sessionId)) {
				writeSessionState(sessionId, state);
			}
		} else {
			state = readSwitchState();
		}

		if (!state.switched) {
			if (sessionId) recordSessionProviderRequest(sessionId, 'anthropic');
			return await handlePassthrough(req, reqId, bodyText, sessionTag);
		}

		// Validate switch state has required fields
		if (!state.provider || !state.model) {
			console.error(
				`[proxy #${reqId}]${sessionTag} Invalid switch state (missing provider/model), reverting`,
			);
			if (sessionId) {
				resetSessionState(sessionId);
			} else {
				resetSwitchState();
			}
			return await handlePassthrough(req, reqId, bodyText, sessionTag);
		}

		return await handleSwitched(
			req,
			reqId,
			bodyText,
			state.provider,
			state.model,
			sessionId,
			sessionTag,
		);
	} catch (error) {
		const message = toErrorMessage(error);
		console.error(`[proxy #${reqId}]${sessionTag} Error: ${message}`);

		try {
			console.error(
				`[proxy #${reqId}]${sessionTag} Falling back to passthrough`,
			);
			return await handlePassthrough(req, reqId, bodyText, sessionTag);
		} catch (fallbackError) {
			const fbMsg = toErrorMessage(fallbackError);
			return new Response(
				JSON.stringify({
					error: { type: 'proxy_error', message: fbMsg },
				}),
				{
					status: 502,
					headers: { 'content-type': 'application/json' },
				},
			);
		}
	}
}
