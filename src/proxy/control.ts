/**
 * Proxy control API server (port 18911)
 *
 * Provides HTTP endpoints for health checks, status queries,
 * and switch control from CLI or MCP tools.
 */

import { readSwitchState, writeSwitchState, resetSwitchState } from "./state";
import { getProxyStats } from "./handler";
import type { ProxySwitchState } from "./types";
import { DEFAULT_PROXY_CONFIG } from "./types";
import { loadConfig, isProviderConfigured } from "../config";

/**
 * Handle control API requests
 *
 * Endpoints:
 * - GET  /health  → { status: "ok", uptime, requestCount }
 * - GET  /status  → current ProxySwitchState
 * - POST /switch  → activate switch (body: { provider, model, requests?, timeout_ms? })
 * - POST /revert  → reset to passthrough
 */
export async function handleControl(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

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
          },
          200,
          corsHeaders
        );
      }

      case "/status": {
        const state = readSwitchState();
        return jsonResponse(state, 200, corsHeaders);
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
          requests?: number;
          timeout_ms?: number;
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

        const now = Date.now();
        const requests = body.requests ?? DEFAULT_PROXY_CONFIG.defaultRequests;
        const isUnlimited = requests < 0;
        const timeoutMs = body.timeout_ms ?? (isUnlimited ? 0 : DEFAULT_PROXY_CONFIG.defaultTimeoutMs);

        const state: ProxySwitchState = {
          switched: true,
          provider: body.provider,
          model: body.model,
          requestsRemaining: requests,
          switchedAt: now,
          timeoutAt: timeoutMs > 0 ? now + timeoutMs : undefined,
        };

        writeSwitchState(state);

        const warning = !providerConfigured
          ? `Warning: ${body.provider} API key not set. Requests will fallback to native Claude.`
          : undefined;

        console.error(
          `[control] Switched to ${body.provider}/${body.model} ` +
          `(requests: ${requests === 0 ? "unlimited" : requests}, ` +
          `timeout: ${timeoutMs}ms)` +
          (warning ? ` [${warning}]` : "")
        );

        return jsonResponse(
          { ...state, ...(warning && { warning }) },
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

        resetSwitchState();
        console.error("[control] Reverted to passthrough");

        return jsonResponse(
          { switched: false, message: "Reverted to passthrough" },
          200,
          corsHeaders
        );
      }

      default:
        return jsonResponse(
          {
            error: "Not found",
            endpoints: ["/health", "/status", "/switch", "/revert"],
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
