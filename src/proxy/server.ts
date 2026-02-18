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

import { handleMessages, handleOtherRequest } from "./handler";
import { handleControl, registerShutdown } from "./control";
import { readSwitchState, resetSwitchState } from "./state";
import { parseSessionFromPath, cleanupStaleSessions, getCleanupIntervalMs } from "./session";
import { DEFAULT_PROXY_CONFIG } from "./types";

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

  // Ensure clean global state on startup
  resetSwitchState();

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

  // Log initial state
  const state = readSwitchState();
  console.error(
    `  Mode: ${state.switched ? `switched → ${state.provider}/${state.model}` : "passthrough → Anthropic"}`
  );
  console.error("  Session isolation: enabled (path-based /s/{id}/...)");
  if (process.env.OMC_PROXY_DEBUG === "1") {
    console.error("  Debug: ON (verbose logging for all endpoints)");
  }

  // Periodic cleanup of stale sessions
  const cleanupTimer = setInterval(cleanupStaleSessions, getCleanupIntervalMs());

  // Handle graceful shutdown
  const shutdown = () => {
    console.error("\n[proxy] Shutting down...");
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
