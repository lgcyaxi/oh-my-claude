/**
 * Proxy request handler — core routing logic
 *
 * Routing priority (highest first):
 * 1.  Route directive in system prompt [omc-route:provider/model]
 * 2.  Session-scoped state (if session ID present in URL path)
 * 3.  Global state (file-based, backward compatible)
 * 4.  Passthrough to Anthropic (default)
 *
 * Body consumption strategy: the request body is read ONCE at the top
 * of handleMessages() and passed as a string through all handlers.
 * This avoids the "body already consumed" bug when fallback paths
 * need to re-read the body after an error.
 *
 * Thinking block handling: passthrough requests always strip thinking
 * blocks from conversation history to prevent "Invalid signature"
 * errors from non-Anthropic-signed blocks after model switching.
 */

import { readSwitchState, resetSwitchState } from './state';
import {
	readSessionState,
	writeSessionState,
	resetSessionState,
	hasSession,
	parseSessionFromPath,
	recordSessionProviderRequest,
} from './session';
import { extractRouteDirective } from './route-directive';
import { getPassthroughAuth, getProviderAuth } from './auth';
import { forwardToUpstream, createStreamingResponse } from './stream';
import { loadConfig, isProviderConfigured } from '../shared/config';
import { sanitizeRequestBody, stripThinkingFromBody } from './sanitize';
import { rewriteSystemIdentity } from './identity';
import { isOpenAIFormatProvider } from './format-converter';
import { convertAnthropicToOpenAI } from './format-converter';
import { convertAnthropicToResponses } from './responses-converter';
import { wrapWithCapture } from './response-cache';
import { resolveEffectiveModel } from './model-resolver';
import { forwardToProvider } from './provider-forward';
import {
	createOpenAIToAnthropicResponse,
	createResponsesToAnthropicResponse,
	collectStreamToAnthropicJson,
} from './response-builders';
import type { ProxySwitchState } from './types';
import modelsRegistry from '../shared/config/models-registry.json';

/** Startup timestamp for uptime tracking */
const startedAt = Date.now();

/** Request counter for logging */
let requestCount = 0;

/** Per-provider request counter for usage tracking */
const providerRequestCounts = new Map<string, number>();

/** Provider types that use the OpenAI Responses API (not Chat Completions) */
const RESPONSES_API_PROVIDERS = new Set(['openai-oauth']);

/** Paths that are logged only in debug mode (too noisy for regular use) */
const QUIET_PATHS = ['/v1/messages/count_tokens'];

/** Whether debug logging is enabled (set OMC_PROXY_DEBUG=1) */
const isDebug = process.env.OMC_PROXY_DEBUG === '1';

/**
 * Handle an incoming /v1/messages request from Claude Code
 *
 * Routes to either:
 * 1. External provider via route directive (permanent per-agent)
 * 2. External provider via session/global switch state (temporary)
 * 3. Anthropic API (passthrough) — default
 *
 * @param sessionId - Optional session ID extracted from URL path by server.ts
 */
export async function handleMessages(
	req: Request,
	sessionId?: string,
): Promise<Response> {
	requestCount++;
	const reqId = requestCount;
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
				// Route directive found — route to specified provider
				// Does NOT consume switch counters (permanent per-agent routing)
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
		}

		// --- Priority 1.5: DISABLED ---
		// Auto-route by body model ID was removed because it silently intercepted requests
		// without updating session switch state, causing the menubar and statusline to show
		// incorrect model info. Use explicit switch (switch_model / -p flag) instead.

		// --- Priority 2 & 3: Session state → global state → passthrough ---
		let state: ProxySwitchState;

		if (sessionId) {
			state = readSessionState(sessionId);
			// Fall back to global state if session has no active switch
			if (!state.switched) {
				const globalState = readSwitchState();
				if (globalState.switched) {
					state = globalState;
				}
			}
			// Materialize inherited state (from process default or global) into session store
			// so that recordSessionProviderRequest doesn't overwrite it with DEFAULT_SWITCH_STATE
			if (state.switched && !hasSession(sessionId)) {
				writeSessionState(sessionId, state);
			}
		} else {
			state = readSwitchState();
		}

		if (!state.switched) {
			// PASSTHROUGH: forward to api.anthropic.com with real API key
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

		// SWITCHED: forward to provider's Anthropic-compatible endpoint
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
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[proxy #${reqId}]${sessionTag} Error: ${message}`);

		// On error, fall through to passthrough to avoid breaking Claude Code
		try {
			console.error(
				`[proxy #${reqId}]${sessionTag} Falling back to passthrough`,
			);
			return await handlePassthrough(req, reqId, bodyText, sessionTag);
		} catch (fallbackError) {
			const fbMsg =
				fallbackError instanceof Error
					? fallbackError.message
					: String(fallbackError);
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

/**
 * Handle a request routed by a directive [omc-route:provider/model].
 *
 * Skips switch state entirely — directive routing is permanent per-agent.
 * Does NOT decrement any counters.
 */
async function handleDirectiveRoute(
	req: Request,
	reqId: number,
	bodyText: string,
	parsedBody: Record<string, unknown>,
	provider: string,
	model: string,
	sessionTag: string,
	sessionId?: string,
): Promise<Response> {
	// Check if provider is configured
	const config = loadConfig();
	if (!isProviderConfigured(config, provider)) {
		console.error(
			`[proxy #${reqId}]${sessionTag} Route directive → ${provider}/${model} but provider not configured, ` +
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

		// Rewrite Claude identity in system prompt before any conversion
		rewriteSystemIdentity(parsedBody, model);

		let targetUrl: string;
		let forwardBody: Record<string, unknown>;

		const requestStream = parsedBody.stream !== false;

		if (useResponsesAPI) {
			// Responses API provider (Codex): convert Anthropic → Responses API
			forwardBody = convertAnthropicToResponses(parsedBody, model);
			targetUrl = `${baseUrl}/responses`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${model} (directive/responses-api) /responses`,
			);
		} else if (openAIFormat) {
			// OpenAI-format provider: convert Anthropic → OpenAI Chat Completions
			forwardBody = convertAnthropicToOpenAI(parsedBody, model);
			targetUrl = `${baseUrl}/chat/completions`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${model} (directive/openai-fmt) /chat/completions`,
			);
		} else {
			// Anthropic-format provider: rewrite model and sanitize
			const body = parsedBody;
			body.model = model;
			sanitizeRequestBody(body, provider);
			forwardBody = body;

			const url = new URL(req.url);
			targetUrl = `${baseUrl}/v1/messages${url.search}`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${model} (directive) /v1/messages`,
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

		// Track per-provider request count (global + session)
		providerRequestCounts.set(
			provider,
			(providerRequestCounts.get(provider) ?? 0) + 1,
		);
		if (sessionId) recordSessionProviderRequest(sessionId, provider);

		let result: Response;
		if (useResponsesAPI) {
			// Codex always streams — if caller requested non-streaming, buffer the SSE into JSON
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
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[proxy #${reqId}]${sessionTag} Route directive ${provider}/${model} failed: ${message}, ` +
				`falling back to passthrough`,
		);
		return await handlePassthrough(req, reqId, bodyText, sessionTag);
	}
}

/**
 * Passthrough request to Anthropic API
 *
 * In OAuth mode, forwards original auth headers as-is.
 * In API key mode, substitutes the stored API key.
 *
 * Always strips thinking blocks from conversation history to prevent
 * "Invalid signature in thinking block" errors.
 */
async function handlePassthrough(
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

/**
 * Switched request to external provider.
 *
 * Uses session-specific or global state depending on whether sessionId is present.
 * If the provider API key is not configured, gracefully falls back to passthrough.
 */
async function handleSwitched(
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

	// Provider is configured — attempt switched request
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
			// Responses API provider (Codex): convert Anthropic → Responses API
			forwardBody = convertAnthropicToResponses(body, effectiveModel);
			targetUrl = `${baseUrl}/responses`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${effectiveModel} (switched/responses-api) /responses`,
			);
		} else if (openAIFormat) {
			// OpenAI-format provider: convert Anthropic → OpenAI Chat Completions
			forwardBody = convertAnthropicToOpenAI(body, effectiveModel);
			targetUrl = `${baseUrl}/chat/completions`;

			console.error(
				`[proxy #${reqId}]${sessionTag} → ${provider}/${effectiveModel} (switched/openai-fmt) /chat/completions`,
			);
		} else {
			// Anthropic-format provider: set resolved model and sanitize
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

		// Track per-provider request count (global + session)
		providerRequestCounts.set(
			provider,
			(providerRequestCounts.get(provider) ?? 0) + 1,
		);
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
		// Provider request failed — fallback to native Claude
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[proxy #${reqId}]${sessionTag} Provider "${provider}" request failed: ${message}, ` +
				`falling back to native Claude`,
		);
		return await handlePassthrough(req, reqId, bodyText, sessionTag);
	}
}

/**
 * Handle any non-messages request (e.g., /v1/complete, other API paths)
 * Always passthrough these to Anthropic
 *
 * @param sessionId - Ignored for non-messages requests (always passthrough)
 */
export async function handleOtherRequest(
	req: Request,
	sessionId?: string,
): Promise<Response> {
	requestCount++;
	const reqId = requestCount;

	try {
		const { apiKey, baseUrl, authMode } = getPassthroughAuth();
		const isOAuth = authMode === 'oauth';
		const url = new URL(req.url);

		// Strip session prefix from path before forwarding to Anthropic
		const sessionInfo = parseSessionFromPath(url.pathname);
		const canonicalPath = sessionInfo
			? sessionInfo.strippedPath
			: url.pathname;
		const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;

		// Skip logging for noisy endpoints unless debug mode is on
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

		// Intercept /api/oauth/usage responses — cache for statusline
		if (canonicalPath === '/api/oauth/usage' && upstreamResponse.ok) {
			cacheUsageResponse(
				upstreamResponse.clone() as globalThis.Response,
			).catch(() => {});
		}

		return createStreamingResponse(upstreamResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[proxy #${reqId}] Error: ${message}`);
		return new Response(
			JSON.stringify({ error: { type: 'proxy_error', message } }),
			{ status: 502, headers: { 'content-type': 'application/json' } },
		);
	}
}

/**
 * Cache OAuth usage response for statusline consumption.
 * Writes to ~/.claude/oh-my-claude/cache/api_usage.json.
 */
async function cacheUsageResponse(
	response: globalThis.Response,
): Promise<void> {
	try {
		const data = (await response.json()) as {
			five_hour?: { utilization: number; resets_at?: string };
			seven_day?: { utilization: number; resets_at?: string };
		};
		if (!data.five_hour) return;
		const { mkdirSync, writeFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const { homedir } = await import('node:os');
		const cacheDir = join(homedir(), '.claude', 'oh-my-claude', 'cache');
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(
			join(cacheDir, 'api_usage.json'),
			JSON.stringify({
				timestamp: Date.now(),
				five_hour: data.five_hour,
				seven_day: data.seven_day,
			}),
			'utf-8',
		);
	} catch {
		// Non-critical — ignore cache write failures
	}
}

/**
 * Get proxy uptime and request count for status reporting
 */
export function getProxyStats(): { uptime: number; requestCount: number } {
	return {
		uptime: Date.now() - startedAt,
		requestCount,
	};
}

/**
 * Get per-provider request counts for usage tracking
 */
export function getProviderRequestCounts(): Record<string, number> {
	return Object.fromEntries(providerRequestCounts);
}

/**
 * Handle GET /v1/models — return models from registry for the current session's provider.
 *
 * When switched to an external provider, returns that provider's models from the registry
 * so that Claude Code's `/model` command shows the right options instead of Anthropic models.
 * When not switched (passthrough mode), passthroughs to Anthropic.
 */
export async function handleModelsRequest(
	req: Request,
	sessionId?: string,
): Promise<Response> {
	const config = loadConfig();
	const now = Math.floor(Date.now() / 1000);

	// Always return all configured providers' models so /model picker shows everything
	type RegistryModel = { id: string; label?: string };
	type RegistryProvider = { name: string; models: RegistryModel[] };
	type Registry = {
		providers: RegistryProvider[];
		crossProviderAliases?: Record<
			string,
			Array<{ provider: string; model: string }>
		>;
	};
	const reg = modelsRegistry as unknown as Registry;

	// Build alias winner map: modelId → winning provider name
	const aliasWinners = new Map<string, string>();
	for (const [modelId, targets] of Object.entries(
		reg.crossProviderAliases ?? {},
	)) {
		for (const target of targets) {
			if (isProviderConfigured(config, target.provider)) {
				aliasWinners.set(modelId, target.provider);
				break;
			}
		}
	}

	const seen = new Set<string>();
	const models: Array<{
		type: 'model';
		id: string;
		display_name: string;
		created_at: number;
	}> = [];

	for (const p of reg.providers) {
		if (!isProviderConfigured(config, p.name)) continue;
		if (p.name === 'ollama') continue; // dynamic list, unknown at build time

		for (const m of p.models) {
			if (seen.has(m.id)) continue; // already emitted by a higher-priority provider

			// If this model has an alias winner that is a DIFFERENT provider, skip here
			// (the winner will emit it when we reach that provider's iteration)
			const winner = aliasWinners.get(m.id);
			if (winner && winner !== p.name) continue;

			seen.add(m.id);
			models.push({
				type: 'model',
				id: m.id,
				display_name: m.label ?? m.id,
				created_at: now,
			});
		}
	}

	if (models.length === 0) {
		// No external providers configured — fall back to Anthropic's native list
		return handleOtherRequest(req, sessionId);
	}

	return new Response(
		JSON.stringify({
			data: models,
			has_more: false,
			first_id: models[0]?.id,
			last_id: models[models.length - 1]?.id,
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } },
	);
}
