/**
 * Proxy control API server (port 18911)
 *
 * Provides HTTP endpoints for health checks, status queries,
 * and switch control from CLI or MCP tools.
 *
 * Session isolation: endpoints accept an optional `?session=ID` query
 * parameter. When present, operations target the in-memory session state.
 * When absent, operations target the global file-based state (backward compat).
 */

import { readSwitchState, writeSwitchState, resetSwitchState } from "./state";
import {
  readSessionState,
  writeSessionState,
  resetSessionState,
  hasSession,
  getActiveSessionCount,
  getActiveSessions,
} from "./session";
import { getProxyStats, getProviderRequestCounts } from "./handler";
import { getLatestResponse } from "./response-cache";
import type { ProxySwitchState } from "./types";
import { loadConfig, isProviderConfigured } from "../shared/config";

/** Shutdown function set by server.ts */
let shutdownProxy: (() => void) | null = null;

/** Register shutdown function from server */
export function registerShutdown(fn: () => void) {
  shutdownProxy = fn;
}

/**
 * Handle control API requests
 *
 * Endpoints:
 * - GET  /health   → { status: "ok", uptime, requestCount, activeSessions }
 * - GET  /status   → current ProxySwitchState (session or global)
 * - GET  /sessions → list all active sessions with state
 * - GET  /usage    → per-provider request counts
 * - POST /switch  → activate switch (body: { provider, model, requests?, timeout_ms? })
 * - POST /revert  → reset to passthrough
 * - POST /stop    → shutdown proxy
 *
 * All endpoints accept optional `?session=ID` query parameter for session isolation.
 */
export async function handleControl(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const sessionId = url.searchParams.get("session") || undefined;

  // CORS headers for local development
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : " [global]";

  try {
    switch (path) {
      case "/health": {
        const stats = getProxyStats();
        return jsonResponse(
          {
            status: "ok",
            uptime: stats.uptime,
            uptimeHuman: formatUptime(stats.uptime),
            requestCount: stats.requestCount,
            activeSessions: getActiveSessionCount(),
          },
          200,
          corsHeaders
        );
      }

      case "/status": {
        // Priority: session state (includes process default fallback) → global file
        let state: ProxySwitchState;
        if (sessionId) {
          state = readSessionState(sessionId);
        } else {
          // No session ID: check process default first, then global file
          const { getDefaultSwitchState } = await import("./session");
          const defaultState = getDefaultSwitchState();
          state = defaultState ?? readSwitchState();
        }
        return jsonResponse(
          { ...state, sessionId: sessionId ?? null },
          200,
          corsHeaders
        );
      }

      case "/sessions": {
        const activeSessions = getActiveSessions();
        return jsonResponse(
          { sessions: activeSessions, count: activeSessions.length },
          200,
          corsHeaders
        );
      }

      case "/usage": {
        const providerCounts = getProviderRequestCounts();
        return jsonResponse(
          { providers: providerCounts },
          200,
          corsHeaders
        );
      }

      case "/providers": {
        // Return only configured (available) providers with their models
        // Used by menubar to show only switchable providers
        const provConfig = loadConfig();
        const registry = await import("../shared/config/models-registry.json");
        const available: Array<{ name: string; label: string; models: Array<{ id: string; label: string }> }> = [];

        // Non-LLM model patterns for Ollama filtering
        const NON_LLM_PATTERNS = [
          /^bge-/i, /^nomic-embed/i, /^mxbai-embed/i, /^snowflake-arctic-embed/i,
          /^all-minilm/i, /^paraphrase-/i, /^minicpm-v/i, /^llava/i, /^bakllava/i,
          /^moondream/i, /^granite3-guardian/i,
          /-ocr[:/]|^.*-ocr$/i,              // OCR models (glm-ocr, deepseek-ocr)
          /-embedding[:/]|^.*-embedding$/i,  // embedding models (qwen3-embedding)
        ];

        for (const p of registry.providers) {
          const pName = (p as any).name as string;
          // Skip claude-subscription (not switchable via proxy)
          const pc = provConfig.providers[pName];
          if (!pc || pc.type === "claude-subscription") continue;

          // Only show configured providers (has API key / OAuth / localhost)
          if (!isProviderConfigured(provConfig, pName)) continue;

          let models: Array<{ id: string; label: string }> = ((p as any).models as Array<{ id: string; label: string }>) ?? [];

          // Ollama: auto-discover models if registry list is empty
          if (pName === "ollama" && models.length === 0) {
            try {
              const ollamaHost = (process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE || "http://localhost:11434").replace(/\/v1\/?$/, "");
              const resp = await fetch(`${ollamaHost}/api/tags`, {
                signal: AbortSignal.timeout(3000),
              });
              if (resp.ok) {
                const data = (await resp.json()) as { models?: Array<{ name: string }> };
                models = (data.models ?? [])
                  .filter((m) => !NON_LLM_PATTERNS.some((pat) => pat.test(m.name)))
                  .map((m) => ({ id: m.name, label: m.name }));
              }
            } catch {
              // Ollama unreachable — show provider with no models
            }
          }

          available.push({
            name: pName,
            label: (p as any).label ?? pName,
            models,
          });
        }

        return jsonResponse({ providers: available }, 200, corsHeaders);
      }

      case "/response": {
        const respSessionId = url.searchParams.get("session");
        if (!respSessionId) {
          return jsonResponse(
            { error: "session query parameter is required" },
            400,
            corsHeaders,
          );
        }

        const minSeq = url.searchParams.has("seq")
          ? parseInt(url.searchParams.get("seq")!, 10)
          : undefined;
        const shouldWait = url.searchParams.get("wait") === "true";
        const timeoutMs = Math.min(
          parseInt(url.searchParams.get("timeout") ?? "30000", 10) || 30000,
          120000,
        );

        if (shouldWait) {
          // Long-poll: check every 500ms until response found or timeout
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const resp = getLatestResponse(respSessionId, minSeq);
            if (resp) {
              return jsonResponse({ found: true, response: resp }, 200, corsHeaders);
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          // Timeout — return not found
          return jsonResponse({ found: false }, 200, corsHeaders);
        }

        // Immediate check
        const resp = getLatestResponse(respSessionId, minSeq);
        if (resp) {
          return jsonResponse({ found: true, response: resp }, 200, corsHeaders);
        }
        return jsonResponse({ found: false }, 200, corsHeaders);
      }

      case "/stream": {
        const streamSessionId = url.searchParams.get("session");
        if (!streamSessionId) {
          return jsonResponse(
            { error: "session query parameter is required" },
            400,
            corsHeaders,
          );
        }

        const streamTimeoutMs = Math.min(
          parseInt(url.searchParams.get("timeout") ?? "120000", 10) || 120000,
          300000,
        );

        const { addCaptureListener, removeCaptureListener } = await import("./response-cache");
        type CaptureListenerType = import("./response-cache").CaptureListener;

        const encoder = new TextEncoder();
        let listenerRef: CaptureListenerType | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const stream = new ReadableStream({
          start(controller) {
            // Send initial connection event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", session: streamSessionId })}\n\n`));

            // Register capture listener
            listenerRef = {
              onDelta: (text: string) => {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`));
                } catch {
                  // Stream may be closed
                }
              },
              onComplete: (response) => {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", seq: response.seq, provider: response.provider, model: response.model, usage: response.usage })}\n\n`));
                } catch {
                  // Stream may be closed
                }
              },
            };

            addCaptureListener(streamSessionId, listenerRef);

            // Timeout: close stream after timeout
            timeoutId = setTimeout(() => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "timeout" })}\n\n`));
                controller.close();
              } catch { /* already closed */ }
            }, streamTimeoutMs);
          },
          cancel() {
            // Clean up on client disconnect
            if (listenerRef) {
              removeCaptureListener(streamSessionId, listenerRef);
              listenerRef = null;
            }
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            "connection": "keep-alive",
            ...corsHeaders,
          },
        });
      }

      case "/switch": {
        if (req.method !== "POST") {
          return jsonResponse(
            { error: "Method not allowed. Use POST." },
            405,
            corsHeaders
          );
        }

        const body = (await req.json()) as {
          provider?: string;
          model?: string;
        };

        if (!body.provider || !body.model) {
          return jsonResponse(
            { error: "provider and model are required" },
            400,
            corsHeaders
          );
        }

        // Validate provider exists and is not claude-subscription
        const config = loadConfig();
        const providerConfig = config.providers[body.provider];

        if (!providerConfig) {
          return jsonResponse(
            {
              error: `Unknown provider: "${body.provider}"`,
              available: Object.keys(config.providers),
            },
            400,
            corsHeaders
          );
        }

        if (providerConfig.type === "claude-subscription") {
          return jsonResponse(
            { error: `Cannot switch to "${body.provider}" — it uses Claude subscription.` },
            400,
            corsHeaders
          );
        }

        // Warn if API key not configured (still allow — handler will fallback)
        const providerConfigured = isProviderConfigured(config, body.provider);

        const state: ProxySwitchState = {
          switched: true,
          provider: body.provider,
          model: body.model,
          switchedAt: Date.now(),
        };

        // Write to session-scoped or global state
        if (sessionId) {
          writeSessionState(sessionId, state);
        } else {
          writeSwitchState(state);
        }

        const warning = !providerConfigured
          ? `Warning: ${body.provider} API key not set. Requests will fallback to native Claude.`
          : undefined;

        console.error(
          `[control]${sessionTag} Switched to ${body.provider}/${body.model}` +
          (warning ? ` [${warning}]` : "")
        );

        return jsonResponse(
          { ...state, sessionId: sessionId ?? null, ...(warning && { warning }) },
          200,
          corsHeaders
        );
      }

      case "/revert": {
        if (req.method !== "POST") {
          return jsonResponse(
            { error: "Method not allowed. Use POST." },
            405,
            corsHeaders
          );
        }

        if (sessionId) {
          resetSessionState(sessionId);
        } else {
          resetSwitchState();
        }

        console.error(`[control]${sessionTag} Reverted to passthrough`);

        return jsonResponse(
          { switched: false, sessionId: sessionId ?? null, message: "Reverted to passthrough" },
          200,
          corsHeaders
        );
      }

      case "/models": {
        // List available models for a provider (currently supports Ollama auto-discovery)
        const modelsProvider = url.searchParams.get("provider");
        if (!modelsProvider) {
          return jsonResponse({ error: "provider query param is required" }, 400, corsHeaders);
        }

        if (modelsProvider === "ollama") {
          // Non-LLM model families to filter out (OCR, embedding, vision-only, etc.)
          const NON_LLM_PATTERNS = [
            /^granite3-guardian/i,
            /^bge-/i,             // embedding models
            /^nomic-embed/i,      // embedding models
            /^mxbai-embed/i,      // embedding models
            /^snowflake-arctic-embed/i,
            /^all-minilm/i,       // embedding models
            /^paraphrase-/i,      // embedding models
            /^minicpm-v/i,        // vision-only OCR
            /^llava/i,            // vision-only
            /^bakllava/i,         // vision-only
            /-ocr[:/]|^.*-ocr$/i,              // OCR models
            /-embedding[:/]|^.*-embedding$/i,  // embedding models
            /^moondream/i,        // vision-only
          ];

          function isLLMModel(name: string): boolean {
            return !NON_LLM_PATTERNS.some((p) => p.test(name));
          }

          try {
            const ollamaHost = (process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE || "http://localhost:11434").replace(/\/v1\/?$/, "");
            const resp = await fetch(`${ollamaHost}/api/tags`, {
              signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
              const data = (await resp.json()) as { models?: Array<{ name: string; size: number; modified_at: string }> };
              const allModels = data.models ?? [];
              const models = allModels
                .filter((m) => isLLMModel(m.name))
                .map((m) => ({
                  id: m.name,
                  label: m.name,
                  size: m.size,
                }));
              return jsonResponse(
                { provider: "ollama", models, filtered: allModels.length - models.length },
                200,
                corsHeaders
              );
            }
            return jsonResponse(
              { error: "Ollama API not reachable", hint: "Is Ollama running? Try: ollama serve" },
              502,
              corsHeaders
            );
          } catch {
            return jsonResponse(
              { error: "Ollama API not reachable", hint: "Is Ollama running? Try: ollama serve" },
              502,
              corsHeaders
            );
          }
        }

        // For other providers, return models from registry
        const modelsRegistryData = await import("../shared/config/models-registry.json");
        const providerEntry = modelsRegistryData.providers.find((p: any) => p.name === modelsProvider);
        if (providerEntry) {
          return jsonResponse(
            { provider: modelsProvider, models: providerEntry.models },
            200,
            corsHeaders
          );
        }
        return jsonResponse({ error: `Unknown provider: ${modelsProvider}` }, 404, corsHeaders);
      }

      case "/stop": {
        if (req.method !== "POST") {
          return jsonResponse(
            { error: "Method not allowed. Use POST." },
            405,
            corsHeaders
          );
        }

        console.error("[control] Stopping proxy server...");

        // Send response before actually shutting down
        const response = jsonResponse(
          { message: "Proxy server stopping" },
          200,
          corsHeaders
        );

        // Shutdown asynchronously after response
        setTimeout(() => {
          if (shutdownProxy) {
            shutdownProxy();
          } else {
            console.error("[control] Warning: No shutdown handler registered");
            process.exit(0);
          }
        }, 100);

        return response;
      }

      default:
        return jsonResponse(
          {
            error: "Not found",
            endpoints: ["/health", "/status", "/sessions", "/usage", "/providers", "/response", "/stream", "/switch", "/revert", "/models", "/stop"],
            hint: "Add ?session=ID for session-scoped operations",
          },
          404,
          corsHeaders
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[control] Error: ${message}`);
    return jsonResponse(
      { error: message },
      500,
      corsHeaders
    );
  }
}

/** Helper: create a JSON response */
function jsonResponse(
  data: unknown,
  status: number,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
  });
}

/** Helper: format uptime as human-readable string */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
