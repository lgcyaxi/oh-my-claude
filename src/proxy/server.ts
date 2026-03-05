#!/usr/bin/env bun
/**
 * oh-my-claude Proxy Server
 *
 * Intercepts Claude Code's API calls and routes them to either
 * Anthropic (passthrough) or external providers (switched).
 *
 * Two servers:
 * - Proxy (default: 18910) — Claude Code connects here via ANTHROPIC_BASE_URL
 * - Control (default: 18911) — health/status/switch/revert endpoints
 *
 * Session isolation:
 * - URLs like /s/{sessionId}/v1/messages use per-session in-memory state
 * - URLs like /v1/messages use global file-based state (backward compat)
 *
 * Usage:
 *   bun run src/proxy/server.ts
 *   bun run src/proxy/server.ts --port 18910 --control-port 18911
 */

import { handleMessages, handleOtherRequest, handleModelsRequest } from "./handler";
import { handleControl, registerShutdown } from "./control";
import { readSwitchState, resetSwitchState } from "./state";
import { parseSessionFromPath, cleanupStaleSessions, getCleanupIntervalMs } from "./session";
import { initializeAuth } from "./auth";
import { DEFAULT_PROXY_CONFIG } from "./types";
import { UsagePoller } from "./usage-poller";

// Parse CLI arguments
function parseArgs(): { port: number; controlPort: number } {
  const args = process.argv.slice(2);
  let port = DEFAULT_PROXY_CONFIG.port;
  let controlPort = DEFAULT_PROXY_CONFIG.controlPort;

  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === "--port" && next) {
      port = parseInt(next, 10);
      i++;
    } else if (args[i] === "--control-port" && next) {
      controlPort = parseInt(next, 10);
      i++;
    }
  }

  return { port, controlPort };
}

/**
 * Start the proxy and control servers
 */
async function main() {
  const { port, controlPort } = parseArgs();

  // Ensure auth config exists (auto-detects api-key vs oauth mode)
  const authConfig = initializeAuth();
  const authModeLabel = authConfig.authMode === "oauth" ? "oauth (subscription)" : "api-key";

  // Check for pre-configured switch from env vars (used by bridge workers)
  const switchProviderRaw = process.env.OMC_PROXY_SWITCH_PROVIDER;
  const switchModel = process.env.OMC_PROXY_SWITCH_MODEL;

  if (switchProviderRaw && switchModel) {
    // Resolve CLI alias (e.g. "zp") to config provider name (e.g. "zhipu")
    // The proxy handler uses config provider names, not CLI aliases.
    const ALIAS_TO_PROVIDER: Record<string, string> = {
      ds: "deepseek", deepseek: "deepseek",
      "ds-r": "deepseek",
      zp: "zhipu", zhipu: "zhipu",
      zai: "zhipu-global", "zp-g": "zhipu-global", "zhipu-global": "zhipu-global",
      mm: "minimax", minimax: "minimax",
      "mm-cn": "minimax-cn", "minimax-cn": "minimax-cn",
      km: "kimi", kimi: "kimi",
      ay: "aliyun", aliyun: "aliyun", ali: "aliyun",
    };
    const switchProvider = ALIAS_TO_PROVIDER[switchProviderRaw] ?? switchProviderRaw;

    // Apply pre-configured switch at startup.
    // Write to in-memory default session state — this is per-process isolated.
    // Also set the per-process default switch so ANY session on this proxy inherits it.
    const { setDefaultSwitchState } = require("./session") as typeof import("./session");
    const switchState = {
      switched: true,
      provider: switchProvider,
      model: switchModel,
      switchedAt: Date.now(),
    };
    // Set process-local default: any session without explicit switch state inherits this
    setDefaultSwitchState(switchState);
  } else {
    // Ensure clean global state on startup
    resetSwitchState();
  }

  // Start proxy server
  const proxy = Bun.serve({
    port,
    // SSE streaming responses from Claude API can take 30-120+ seconds.
    // Bun's default idleTimeout is 10s which causes premature disconnects.
    idleTimeout: 255, // max allowed by Bun (seconds)
    fetch(req: Request): Promise<Response> | Response {
      const url = new URL(req.url);
      let pathname = url.pathname;
      let sessionId: string | undefined;

      // Check for session prefix: /s/{sessionId}/...
      const sessionInfo = parseSessionFromPath(pathname);
      if (sessionInfo) {
        sessionId = sessionInfo.sessionId;
        pathname = sessionInfo.strippedPath;
      }

      // Route /v1/messages to the switching handler
      if (pathname === "/v1/messages") {
        return handleMessages(req, sessionId);
      }

      // Intercept GET /v1/models — return provider-specific model list when switched
      if (pathname === "/v1/models" && req.method === "GET") {
        return handleModelsRequest(req, sessionId);
      }

      // All other paths — passthrough to Anthropic
      return handleOtherRequest(req, sessionId);
    },
    error(error: Error): Response {
      console.error(`[proxy] Server error: ${error.message}`);
      return new Response(
        JSON.stringify({
          error: { type: "proxy_error", message: error.message },
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    },
  });

  // Start control server
  const control = Bun.serve({
    port: controlPort,
    fetch: handleControl,
    error(error: Error): Response {
      console.error(`[control] Server error: ${error.message}`);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    },
  });

  console.error("oh-my-claude Proxy Server");
  console.error(`  Proxy:   http://localhost:${proxy.port}`);
  console.error(`  Control: http://localhost:${control.port}`);
  console.error("");
  console.error("Set in your shell:");
  console.error(`  export ANTHROPIC_BASE_URL=http://localhost:${proxy.port}`);
  console.error("");

  // Log initial state (prefer process default over global file for bridge workers)
  const { getDefaultSwitchState } = require("./session") as typeof import("./session");
  const state = getDefaultSwitchState() ?? readSwitchState();
  console.error(`  Auth:  ${authModeLabel}`);
  console.error(
    `  Mode: ${state.switched ? `switched → ${state.provider}/${state.model}` : "passthrough → Anthropic"}`
  );
  console.error("  Session isolation: enabled (path-based /s/{id}/...)");
  if (process.env.OMC_PROXY_DEBUG === "1") {
    console.error("  Debug: ON (verbose logging for all endpoints)");
  }

  // Periodic cleanup of stale sessions
  const cleanupTimer = setInterval(cleanupStaleSessions, getCleanupIntervalMs());

  // Background usage poller — keeps cache fresh for instant statusline renders
  const usagePoller = new UsagePoller();
  usagePoller.start();

  // Handle graceful shutdown
  const shutdown = () => {
    console.error("\n[proxy] Shutting down...");
    usagePoller.stop();
    clearInterval(cleanupTimer);
    resetSwitchState();
    proxy.stop();
    control.stop();
    process.exit(0);
  };

  // Register shutdown for /stop endpoint
  registerShutdown(shutdown);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start proxy server:", error);
  process.exit(1);
});
