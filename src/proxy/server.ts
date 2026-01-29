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
 * Usage:
 *   bun run src/proxy/server.ts
 *   bun run src/proxy/server.ts --port 18910 --control-port 18911
 */

import { handleMessages, handleOtherRequest } from "./handler";
import { handleControl } from "./control";
import { readSwitchState, resetSwitchState } from "./state";
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

  // Ensure clean state on startup
  resetSwitchState();

  // Start proxy server
  const proxy = Bun.serve({
    port,
    fetch(req: Request): Promise<Response> | Response {
      const url = new URL(req.url);

      // Route /v1/messages to the switching handler
      if (url.pathname === "/v1/messages") {
        return handleMessages(req);
      }

      // All other paths — passthrough to Anthropic
      return handleOtherRequest(req);
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

  // Handle graceful shutdown
  const shutdown = () => {
    console.error("\n[proxy] Shutting down...");
    resetSwitchState();
    proxy.stop();
    control.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start proxy server:", error);
  process.exit(1);
});
