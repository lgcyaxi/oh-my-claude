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
  getActiveSessionCount,
  getActiveSessions,
} from "./session";
import { getProxyStats, getProviderRequestCounts } from "./handler";
import type { ProxySwitchState } from "./types";
import { loadConfig, isProviderConfigured } from "../config";

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
        const state = sessionId
          ? readSessionState(sessionId)
          : readSwitchState();
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
            endpoints: ["/health", "/status", "/sessions", "/usage", "/switch", "/revert", "/stop"],
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
