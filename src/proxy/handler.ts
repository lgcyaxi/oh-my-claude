/**
 * Proxy request handler — core routing logic
 *
 * Decides whether to passthrough to Anthropic or forward to
 * an external provider based on the current switch state.
 */

import { readSwitchState, resetSwitchState, decrementAndCheck, isTimedOut } from "./state";
import { getPassthroughAuth, getProviderAuth } from "./auth";
import { forwardToUpstream, createStreamingResponse } from "./stream";
import { loadConfig, isProviderConfigured } from "../config";

/** Startup timestamp for uptime tracking */
const startedAt = Date.now();

/** Request counter for logging */
let requestCount = 0;

/**
 * Handle an incoming /v1/messages request from Claude Code
 *
 * Routes to either:
 * 1. Anthropic API (passthrough) — default
 * 2. External provider (switched) — when proxy-switch.json says switched=true
 */
export async function handleMessages(req: Request): Promise<Response> {
  requestCount++;
  const reqId = requestCount;

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
      return await handlePassthrough(req, reqId);
    }

    // SWITCHED: forward to provider's Anthropic-compatible endpoint
    return await handleSwitched(req, reqId, state.provider!, state.model!);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[proxy #${reqId}] Error: ${message}`);

    // On error, fall through to passthrough to avoid breaking Claude Code
    try {
      console.error(`[proxy #${reqId}] Falling back to passthrough`);
      return await handlePassthrough(req, reqId);
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
 */
async function handlePassthrough(req: Request, reqId: number): Promise<Response> {
  const { apiKey, baseUrl, authMode } = getPassthroughAuth();
  const isOAuth = authMode === "oauth";

  // Reconstruct the target URL preserving the path
  const url = new URL(req.url);
  const targetUrl = `${baseUrl}${url.pathname}${url.search}`;

  console.error(`[proxy #${reqId}] → Anthropic (passthrough${isOAuth ? "/oauth" : ""}) ${url.pathname}`);

  const upstreamResponse = await forwardToUpstream(req, targetUrl, apiKey, undefined, isOAuth);
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
    return await handlePassthrough(req, reqId);
  }

  // Provider is configured — attempt switched request
  try {
    const { apiKey, baseUrl } = getProviderAuth(provider);

    // Parse body to rewrite the model field
    const body = await req.json() as Record<string, unknown>;
    body.model = model;

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
    return await handlePassthrough(req, reqId);
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
