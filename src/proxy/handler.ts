/**
 * Proxy request handler — core routing logic
 *
 * Routing priority (highest first):
 * 1. Route directive in system prompt [omc-route:provider/model]
 * 2. Session-scoped state (if session ID present in URL path)
 * 3. Global state (file-based, backward compatible)
 * 4. Passthrough to Anthropic (default)
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

import { readSwitchState, resetSwitchState } from "./state";
import {
  readSessionState,
  resetSessionState,
  parseSessionFromPath,
  recordSessionProviderRequest,
} from "./session";
import { extractRouteDirective } from "./route-directive";
import { getPassthroughAuth, getProviderAuth } from "./auth";
import { forwardToUpstream, createStreamingResponse } from "./stream";
import { loadConfig, isProviderConfigured } from "../config";
import { sanitizeRequestBody, stripThinkingFromBody } from "./sanitize";
import { convertAnthropicToOpenAI, OpenAIToAnthropicStreamConverter, isOpenAIFormatProvider } from "./format-converter";
import { convertAnthropicToResponses, ResponsesToAnthropicStreamConverter } from "./responses-converter";
import type { ProxySwitchState } from "./types";

/** Startup timestamp for uptime tracking */
const startedAt = Date.now();

/** Request counter for logging */
let requestCount = 0;

/** Per-provider request counter for usage tracking */
const providerRequestCounts = new Map<string, number>();

/** Provider types that use the OpenAI Responses API (not Chat Completions) */
const RESPONSES_API_PROVIDERS = new Set(["openai-oauth"]);

/** Paths that are logged only in debug mode (too noisy for regular use) */
const QUIET_PATHS = ["/v1/messages/count_tokens"];

/** Whether debug logging is enabled (set OMC_PROXY_DEBUG=1) */
const isDebug = process.env.OMC_PROXY_DEBUG === "1";

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
export async function handleMessages(req: Request, sessionId?: string): Promise<Response> {
  requestCount++;
  const reqId = requestCount;
  const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : "";

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
        return await handleDirectiveRoute(req, reqId, bodyText, parsedBody, directive.provider, directive.model, sessionTag, sessionId);
      }
    }

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
    } else {
      state = readSwitchState();
    }

    if (!state.switched) {
      // PASSTHROUGH: forward to api.anthropic.com with real API key
      if (sessionId) recordSessionProviderRequest(sessionId, "anthropic");
      return await handlePassthrough(req, reqId, bodyText, sessionTag);
    }

    // Validate switch state has required fields
    if (!state.provider || !state.model) {
      console.error(`[proxy #${reqId}]${sessionTag} Invalid switch state (missing provider/model), reverting`);
      if (sessionId) {
        resetSessionState(sessionId);
      } else {
        resetSwitchState();
      }
      return await handlePassthrough(req, reqId, bodyText, sessionTag);
    }

    // SWITCHED: forward to provider's Anthropic-compatible endpoint
    return await handleSwitched(req, reqId, bodyText, state.provider, state.model, sessionId, sessionTag);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[proxy #${reqId}]${sessionTag} Error: ${message}`);

    // On error, fall through to passthrough to avoid breaking Claude Code
    try {
      console.error(`[proxy #${reqId}]${sessionTag} Falling back to passthrough`);
      return await handlePassthrough(req, reqId, bodyText, sessionTag);
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
      `falling back to passthrough`
    );
    return await handlePassthrough(req, reqId, bodyText, sessionTag);
  }

  try {
    const { apiKey, baseUrl, providerType } = await getProviderAuth(provider);
    const originalModel = parsedBody.model as string;
    const useResponsesAPI = RESPONSES_API_PROVIDERS.has(providerType);
    const openAIFormat = isOpenAIFormatProvider(providerType);

    let targetUrl: string;
    let forwardBody: Record<string, unknown>;

    const requestStream = parsedBody.stream !== false;

    if (useResponsesAPI) {
      // Responses API provider (Codex): convert Anthropic → Responses API
      forwardBody = convertAnthropicToResponses(parsedBody, model);
      targetUrl = `${baseUrl}/responses`;

      console.error(
        `[proxy #${reqId}]${sessionTag} → ${provider}/${model} (directive/responses-api) /responses`
      );
    } else if (openAIFormat) {
      // OpenAI-format provider: convert Anthropic → OpenAI Chat Completions
      forwardBody = convertAnthropicToOpenAI(parsedBody, model);
      targetUrl = `${baseUrl}/chat/completions`;

      console.error(
        `[proxy #${reqId}]${sessionTag} → ${provider}/${model} (directive/openai-fmt) /chat/completions`
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
        `[proxy #${reqId}]${sessionTag} → ${provider}/${model} (directive) /v1/messages`
      );
    }

    const upstreamResponse = await forwardToProvider(req, targetUrl, apiKey, forwardBody, openAIFormat || useResponsesAPI, provider, providerType);

    // Track per-provider request count (global + session)
    providerRequestCounts.set(provider, (providerRequestCounts.get(provider) ?? 0) + 1);
    if (sessionId) recordSessionProviderRequest(sessionId, provider);

    if (useResponsesAPI) {
      // Codex always streams — if caller requested non-streaming, buffer the SSE into JSON
      if (!requestStream) {
        return await collectStreamToAnthropicJson(
          await createResponsesToAnthropicResponse(upstreamResponse, originalModel),
          originalModel,
        );
      }
      return await createResponsesToAnthropicResponse(upstreamResponse, originalModel);
    }
    if (openAIFormat) {
      return await createOpenAIToAnthropicResponse(upstreamResponse, originalModel);
    }
    return createStreamingResponse(upstreamResponse, undefined, originalModel, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[proxy #${reqId}]${sessionTag} Route directive ${provider}/${model} failed: ${message}, ` +
      `falling back to passthrough`
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
  sessionTag: string = ""
): Promise<Response> {
  const { apiKey, baseUrl, authMode } = getPassthroughAuth();
  const isOAuth = authMode === "oauth";

  // Reconstruct the target URL — strip session prefix if present
  const url = new URL(req.url);
  const sessionInfo = parseSessionFromPath(url.pathname);
  const canonicalPath = sessionInfo ? sessionInfo.strippedPath : url.pathname;
  const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;

  console.error(`[proxy #${reqId}]${sessionTag} → Anthropic (passthrough${isOAuth ? "/oauth" : ""}) ${canonicalPath}`);

  // Always strip thinking blocks from conversation history
  let bodyOverride: Record<string, unknown> | undefined;
  if (bodyText) {
    try {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      const strippedCount = stripThinkingFromBody(body);
      if (strippedCount > 0) {
        bodyOverride = body;
        if (isDebug) {
          console.error(`[proxy #${reqId}]${sessionTag} Stripped ${strippedCount} thinking blocks (passthrough)`);
        }
      }
    } catch {
      console.error(`[proxy #${reqId}]${sessionTag} Warning: could not parse body for thinking sanitization`);
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
  sessionTag: string = ""
): Promise<Response> {
  // Check if provider is configured before attempting
  const config = loadConfig();
  if (!isProviderConfigured(config, provider)) {
    console.error(
      `[proxy #${reqId}]${sessionTag} Provider "${provider}" not configured (API key missing), ` +
      `falling back to native Claude`
    );
    return await handlePassthrough(req, reqId, bodyText, sessionTag);
  }

  // Provider is configured — attempt switched request
  try {
    const { apiKey, baseUrl, providerType } = await getProviderAuth(provider);
    const useResponsesAPI = RESPONSES_API_PROVIDERS.has(providerType);
    const openAIFormat = isOpenAIFormatProvider(providerType);

    // Parse body to rewrite the model field
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    const originalModel = body.model as string;

    let targetUrl: string;
    let forwardBody: Record<string, unknown>;

    if (useResponsesAPI) {
      // Responses API provider (Codex): convert Anthropic → Responses API
      forwardBody = convertAnthropicToResponses(body, model);
      targetUrl = `${baseUrl}/responses`;

      console.error(
        `[proxy #${reqId}]${sessionTag} → ${provider}/${model} (switched/responses-api) /responses`
      );
    } else if (openAIFormat) {
      // OpenAI-format provider: convert Anthropic → OpenAI Chat Completions
      forwardBody = convertAnthropicToOpenAI(body, model);
      targetUrl = `${baseUrl}/chat/completions`;

      console.error(
        `[proxy #${reqId}]${sessionTag} → ${provider}/${model} (switched/openai-fmt) /chat/completions`
      );
    } else {
      // Anthropic-format provider: rewrite model and sanitize
      body.model = model;
      sanitizeRequestBody(body, provider);
      forwardBody = body;

      const url = new URL(req.url);
      targetUrl = `${baseUrl}/v1/messages${url.search}`;

      console.error(
        `[proxy #${reqId}]${sessionTag} → ${provider}/${model} (switched) /v1/messages`
      );
    }

    const upstreamResponse = await forwardToProvider(req, targetUrl, apiKey, forwardBody, openAIFormat || useResponsesAPI, provider, providerType);

    // Track per-provider request count (global + session)
    providerRequestCounts.set(provider, (providerRequestCounts.get(provider) ?? 0) + 1);
    if (sessionId) recordSessionProviderRequest(sessionId, provider);

    if (useResponsesAPI) {
      return await createResponsesToAnthropicResponse(upstreamResponse, originalModel);
    }
    if (openAIFormat) {
      return await createOpenAIToAnthropicResponse(upstreamResponse, originalModel);
    }
    return createStreamingResponse(upstreamResponse, undefined, originalModel, model);
  } catch (error) {
    // Provider request failed — fallback to native Claude
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[proxy #${reqId}]${sessionTag} Provider "${provider}" request failed: ${message}, ` +
      `falling back to native Claude`
    );
    return await handlePassthrough(req, reqId, bodyText, sessionTag);
  }
}

/**
 * Forward a request to either an OpenAI-format or Anthropic-format upstream.
 *
 * For OpenAI/Responses API providers, uses Bearer auth and sets Content-Type.
 * For Anthropic-format providers, delegates to forwardToUpstream with x-api-key.
 *
 * Adds provider-specific headers (Codex).
 */
async function forwardToProvider(
  req: Request,
  targetUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
  isOpenAIFormat: boolean,
  provider?: string,
  providerType?: string
): Promise<Response> {
  if (!isOpenAIFormat) {
    return forwardToUpstream(req, targetUrl, apiKey, body);
  }

  // OpenAI-format: use Bearer token auth
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };

  // Forward accept header for streaming
  const accept = req.headers.get("accept");
  if (accept) headers["Accept"] = accept;

  // Codex-specific headers (OpenAI OAuth)
  if (providerType === "openai-oauth") {
    headers["originator"] = "oh-my-claude";
    // Add ChatGPT-Account-Id from stored credential
    try {
      const { getCredential } = await import("../auth/store");
      const cred = getCredential("openai");
      if (cred && cred.type === "oauth-openai" && cred.accountId) {
        headers["ChatGPT-Account-Id"] = cred.accountId;
      }
    } catch {
      // Non-critical — account ID is optional
    }
  }

  return fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5 * 60 * 1000), // 5 min timeout
  });
}

/**
 * Create a streaming response that converts OpenAI SSE format to Anthropic SSE format.
 * Used when proxying to OpenAI-format providers (OpenAI).
 */
async function createOpenAIToAnthropicResponse(
  upstreamResponse: Response,
  originalModel: string
): Promise<Response> {
  const contentType = upstreamResponse.headers.get("content-type") ?? "";

  // Non-streaming response: convert OpenAI JSON → Anthropic JSON
  if (!contentType.includes("text/event-stream") && contentType.includes("application/json")) {
    const data = await upstreamResponse.json() as Record<string, unknown>;
    const anthropic = convertOpenAIJsonToAnthropic(data, originalModel);
    return new Response(JSON.stringify(anthropic), {
      status: upstreamResponse.status,
      headers: { "content-type": "application/json" },
    });
  }

  // Streaming: pipe through converter
  if (!upstreamResponse.body) {
    return new Response(null, { status: upstreamResponse.status });
  }

  console.error(`[stream] Converting OpenAI SSE → Anthropic SSE (model: "${originalModel}")`);
  const converter = new OpenAIToAnthropicStreamConverter(originalModel);
  const transformedStream = upstreamResponse.body.pipeThrough(converter);

  return new Response(transformedStream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

/**
 * Create a streaming response that converts Responses API SSE format to Anthropic SSE format.
 * Used when proxying to Codex / OpenAI OAuth providers.
 */
async function createResponsesToAnthropicResponse(
  upstreamResponse: Response,
  originalModel: string
): Promise<Response> {
  // Error response — log body for debugging, then pass through
  if (upstreamResponse.status >= 400) {
    let errorBody = "";
    try {
      errorBody = await upstreamResponse.text();
      console.error(`[proxy] Codex API error: ${upstreamResponse.status} ${errorBody}`);
    } catch {
      console.error(`[proxy] Codex API error: ${upstreamResponse.status} (could not read body)`);
    }
    return new Response(errorBody || null, {
      status: upstreamResponse.status,
      headers: {
        "content-type": upstreamResponse.headers.get("content-type") || "application/json",
      },
    });
  }

  if (!upstreamResponse.body) {
    return new Response(null, { status: upstreamResponse.status });
  }

  // Non-streaming response: convert Responses API JSON → Anthropic JSON
  const responseContentType = upstreamResponse.headers.get("content-type") ?? "";
  if (responseContentType.includes("application/json") && !responseContentType.includes("text/event-stream")) {
    const data = await upstreamResponse.json() as Record<string, unknown>;
    const anthropic = convertResponsesJsonToAnthropic(data, originalModel);
    return new Response(JSON.stringify(anthropic), {
      status: upstreamResponse.status,
      headers: { "content-type": "application/json" },
    });
  }

  // Streaming: Codex API may not set Content-Type: text/event-stream despite returning SSE.
  // We request stream: true, so assume streaming for all 2xx responses with a body.
  console.error(`[stream] Converting Responses API SSE → Anthropic SSE (model: "${originalModel}")`);

  // Use manual reader-based piping instead of pipeThrough.
  // Bun 1.x has issues where TransformStream.transform() is never invoked
  // when the input comes from a fetch Response body via pipeThrough.
  const converter = new ResponsesToAnthropicStreamConverter(originalModel);
  const writer = converter.writable.getWriter();
  const reader = upstreamResponse.body.getReader();

  // Pipe upstream → converter in the background
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (err) {
      console.error(`[codex] Stream pipe error: ${err instanceof Error ? err.message : String(err)}`);
      try { writer.abort(err); } catch { /* ignore */ }
    }
  })();

  return new Response(converter.readable, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

/**
 * Handle any non-messages request (e.g., /v1/complete, other API paths)
 * Always passthrough these to Anthropic
 *
 * @param sessionId - Ignored for non-messages requests (always passthrough)
 */
export async function handleOtherRequest(req: Request, sessionId?: string): Promise<Response> {
  requestCount++;
  const reqId = requestCount;

  try {
    const { apiKey, baseUrl, authMode } = getPassthroughAuth();
    const isOAuth = authMode === "oauth";
    const url = new URL(req.url);

    // Strip session prefix from path before forwarding to Anthropic
    const sessionInfo = parseSessionFromPath(url.pathname);
    const canonicalPath = sessionInfo ? sessionInfo.strippedPath : url.pathname;
    const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;

    // Skip logging for noisy endpoints unless debug mode is on
    const isQuiet = !isDebug && QUIET_PATHS.includes(canonicalPath);
    if (!isQuiet) {
      const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : "";
      console.error(`[proxy #${reqId}]${sessionTag} → Anthropic (passthrough${isOAuth ? "/oauth" : ""}) ${canonicalPath}`);
    }

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

/**
 * Get per-provider request counts for usage tracking
 */
export function getProviderRequestCounts(): Record<string, number> {
  return Object.fromEntries(providerRequestCounts);
}

// ── SSE-to-JSON buffer for always-streaming providers ───────────────

/**
 * Collect a streaming SSE Anthropic response into a single JSON response.
 *
 * Used when the caller requests `stream: false` but the upstream provider
 * only supports streaming (e.g., Codex Responses API).
 *
 * Reads all SSE events, accumulates text deltas, and returns a complete
 * Anthropic Messages API JSON response.
 */
async function collectStreamToAnthropicJson(
  sseResponse: Response,
  originalModel: string,
): Promise<Response> {
  if (!sseResponse.body) {
    return new Response(JSON.stringify({
      id: `msg_${Date.now()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "" }], model: originalModel,
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const reader = sseResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let messageId = `msg_${Date.now()}`;
  const textBlocks: string[] = [];
  let stopReason = "end_turn";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") continue;

        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>;
          const type = data.type as string;

          if (type === "message_start") {
            const msg = data.message as Record<string, unknown> | undefined;
            if (msg?.id) messageId = msg.id as string;
            const usage = msg?.usage as Record<string, unknown> | undefined;
            if (usage?.input_tokens) inputTokens = usage.input_tokens as number;
          } else if (type === "content_block_delta") {
            const delta = data.delta as Record<string, unknown> | undefined;
            if (delta?.type === "text_delta") {
              textBlocks.push(delta.text as string);
            }
          } else if (type === "message_delta") {
            const delta = data.delta as Record<string, unknown> | undefined;
            if (delta?.stop_reason) stopReason = delta.stop_reason as string;
            const usage = data.usage as Record<string, unknown> | undefined;
            if (usage?.output_tokens) outputTokens = usage.output_tokens as number;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result = {
    id: messageId,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: textBlocks.join("") }],
    model: originalModel,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };

  console.error(`[proxy] Collected streaming response → JSON (${textBlocks.join("").length} chars)`);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Non-streaming JSON response converters ──────────────────────────

/**
 * Convert OpenAI Chat Completions JSON response → Anthropic Messages API JSON.
 */
function convertOpenAIJsonToAnthropic(
  data: Record<string, unknown>,
  originalModel: string
): Record<string, unknown> {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const text = (message?.content as string) ?? "";
  const usage = data.usage as Record<string, unknown> | undefined;

  return {
    id: (data.id as string) ?? `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: originalModel,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: (usage?.prompt_tokens as number) ?? 0,
      output_tokens: (usage?.completion_tokens as number) ?? 0,
    },
  };
}

/**
 * Convert OpenAI Responses API JSON response → Anthropic Messages API JSON.
 */
function convertResponsesJsonToAnthropic(
  data: Record<string, unknown>,
  originalModel: string
): Record<string, unknown> {
  const output = data.output as Array<Record<string, unknown>> | undefined;
  // Find first message output item with text content
  let text = "";
  if (output) {
    for (const item of output) {
      if (item.type === "message") {
        const itemContent = item.content as Array<Record<string, unknown>> | undefined;
        const textPart = itemContent?.find((c) => c.type === "output_text");
        if (textPart) {
          text = (textPart.text as string) ?? "";
          break;
        }
      }
    }
  }
  const usage = data.usage as Record<string, unknown> | undefined;

  return {
    id: (data.id as string) ?? `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: originalModel,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: (usage?.input_tokens as number) ?? 0,
      output_tokens: (usage?.output_tokens as number) ?? 0,
    },
  };
}
