/**
 * Proxy request handler — core routing logic
 *
 * Decides whether to passthrough to Anthropic or forward to
 * an external provider based on the current switch state.
 *
 * Body consumption strategy: the request body is read ONCE at the top
 * of handleMessages() and passed as a string through all handlers.
 * This avoids the "body already consumed" bug when fallback paths
 * need to re-read the body after an error.
 */

import { readSwitchState, resetSwitchState, decrementAndCheck, isTimedOut } from "./state";
import { getPassthroughAuth, getProviderAuth } from "./auth";
import { forwardToUpstream, createStreamingResponse } from "./stream";
import { loadConfig, isProviderConfigured } from "../config";
import { sanitizeRequestBody, stripThinkingFromBody } from "./sanitize";

/** Startup timestamp for uptime tracking */
const startedAt = Date.now();

/** Request counter for logging */
let requestCount = 0;

/**
 * Tracks whether any switch has occurred during this proxy session.
 * Once a switch happens, passthrough requests must strip thinking blocks
 * to avoid Anthropic rejecting non-Anthropic thinking signatures.
 */
let switchOccurredInSession = false;

/**
 * Handle an incoming /v1/messages request from Claude Code
 *
 * Routes to either:
 * 1. Anthropic API (passthrough) — default
 * 2. External provider (switched) — when proxy-switch.json says switched=true
 *
 * Body is read once here and passed through to avoid double-consumption issues.
 */
export async function handleMessages(req: Request): Promise<Response> {
  requestCount++;
  const reqId = requestCount;

  // Read body ONCE — prevents double-consumption when fallback paths need the body
  const bodyText = await req.text();

  try {
    const state = readSwitchState();

    // Check timeout auto-revert
    if (state.switched && isTimedOut(state)) {
      console.error(`[proxy #${reqId}] Switch timed out, reverting to passthrough`);
      resetSwitchState();
      state.switched = false;
    }

    if (!state.switched) {
      // PASSTHROUGH: forward to api.anthropic.com with real API key
      return await handlePassthrough(req, reqId, bodyText);
    }

    // Validate switch state has required fields
    if (!state.provider || !state.model) {
      console.error(`[proxy #${reqId}] Invalid switch state (missing provider/model), reverting`);
      resetSwitchState();
      return await handlePassthrough(req, reqId, bodyText);
    }

    // SWITCHED: forward to provider's Anthropic-compatible endpoint
    switchOccurredInSession = true;
    return await handleSwitched(req, reqId, bodyText, state.provider, state.model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[proxy #${reqId}] Error: ${message}`);

    // On error, fall through to passthrough to avoid breaking Claude Code
    try {
      console.error(`[proxy #${reqId}] Falling back to passthrough`);
      return await handlePassthrough(req, reqId, bodyText);
    } catch (fallbackError) {
      const fbMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      return new Response(
        JSON.stringify({ error: { type: "proxy_error", message: fbMsg } }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }
  }
}

/**
 * Passthrough request to Anthropic API
 *
 * In OAuth mode, forwards original auth headers as-is.
 * In API key mode, substitutes the stored API key.
 *
 * When a switch has occurred during this session, conversation history
 * may contain thinking blocks with non-Anthropic signatures. These must
 * be stripped to avoid "Invalid signature in thinking block" errors.
 */
async function handlePassthrough(
  req: Request,
  reqId: number,
  bodyText: string
): Promise<Response> {
  const { apiKey, baseUrl, authMode } = getPassthroughAuth();
  const isOAuth = authMode === "oauth";

  // Reconstruct the target URL preserving the path
  const url = new URL(req.url);
  const targetUrl = `${baseUrl}${url.pathname}${url.search}`;

  console.error(`[proxy #${reqId}] → Anthropic (passthrough${isOAuth ? "/oauth" : ""}) ${url.pathname}`);

  // If a switch has occurred, conversation may contain non-Anthropic thinking
  // blocks with invalid signatures — strip them before forwarding to Anthropic
  let bodyOverride: Record<string, unknown> | undefined;
  if (switchOccurredInSession && bodyText) {
    try {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      stripThinkingFromBody(body);
      bodyOverride = body;
      console.error(`[proxy #${reqId}] Stripped thinking blocks (post-switch passthrough)`);
    } catch {
      // If body parsing fails, forward raw body text as-is
      console.error(`[proxy #${reqId}] Warning: could not parse body for thinking sanitization`);
    }
  }

  const upstreamResponse = await forwardToUpstream(
    req, targetUrl, apiKey, bodyOverride, isOAuth, bodyText
  );
  return createStreamingResponse(upstreamResponse);
}

/**
 * Switched request to external provider.
 *
 * If the provider API key is not configured, gracefully falls back
 * to native Claude (passthrough) instead of erroring — this ensures
 * Claude Code never breaks even if the user hasn't set up all providers.
 */
async function handleSwitched(
  req: Request,
  reqId: number,
  bodyText: string,
  provider: string,
  model: string
): Promise<Response> {
  // Check if provider is configured before attempting
  const config = loadConfig();
  if (!isProviderConfigured(config, provider)) {
    console.error(
      `[proxy #${reqId}] Provider "${provider}" not configured (API key missing), ` +
      `falling back to native Claude`
    );
    // Decrement counter so switch still exhausts
    decrementAndCheck();
    return await handlePassthrough(req, reqId, bodyText);
  }

  // Provider is configured — attempt switched request
  try {
    const { apiKey, baseUrl } = getProviderAuth(provider);

    // Parse body to rewrite the model field and sanitize for provider compatibility
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    body.model = model;
    sanitizeRequestBody(body, provider);

    // Reconstruct the target URL preserving the path
    const url = new URL(req.url);
    const targetUrl = `${baseUrl}${url.pathname}${url.search}`;

    console.error(
      `[proxy #${reqId}] → ${provider}/${model} (switched) ${url.pathname}`
    );

    const upstreamResponse = await forwardToUpstream(req, targetUrl, apiKey, body);

    // Decrement counter and auto-revert if exhausted
    const stillSwitched = decrementAndCheck();
    if (!stillSwitched) {
      console.error(`[proxy #${reqId}] Switch exhausted, reverted to passthrough`);
    }

    return createStreamingResponse(upstreamResponse);
  } catch (error) {
    // Provider request failed — fallback to native Claude
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[proxy #${reqId}] Provider "${provider}" request failed: ${message}, ` +
      `falling back to native Claude`
    );
    decrementAndCheck();
    return await handlePassthrough(req, reqId, bodyText);
  }
}

/**
 * Handle any non-messages request (e.g., /v1/complete, other API paths)
 * Always passthrough these to Anthropic
 */
export async function handleOtherRequest(req: Request): Promise<Response> {
  requestCount++;
  const reqId = requestCount;

  try {
    const { apiKey, baseUrl, authMode } = getPassthroughAuth();
    const isOAuth = authMode === "oauth";
    const url = new URL(req.url);
    const targetUrl = `${baseUrl}${url.pathname}${url.search}`;

    console.error(`[proxy #${reqId}] → Anthropic (passthrough${isOAuth ? "/oauth" : ""}) ${url.pathname}`);

    const upstreamResponse = await forwardToUpstream(req, targetUrl, apiKey, undefined, isOAuth);
    return createStreamingResponse(upstreamResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[proxy #${reqId}] Error: ${message}`);
    return new Response(
      JSON.stringify({ error: { type: "proxy_error", message } }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
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
