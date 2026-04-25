/**
 * MCP Server Manager — provider classification + statusline glue
 *
 * Provides:
 * - Provider type classification (isDirectCallViable)
 * - Status file write for statusline display (updateStatusFile)
 *
 * Historical note: this module used to export `isProxyAvailable`,
 * `routeViaProxy`, `routeViaClaude`, and `convertAnthropicResponseToChat`.
 * Those helpers hard-coded the legacy proxy ports 18910/18911 and were
 * never called from anywhere in the live code paths (the real proxy
 * routing now lives in `src/proxy/` and uses per-session ports from
 * `proxy-sessions.json`). They were removed to eliminate a latent
 * footgun and keep this module lean.
 */

import { writeFileSync } from "node:fs";
import { getSessionStatusPath, ensureSessionDir, cleanupStaleSessions } from "../../statusline/session";

// Cleanup stale sessions lazily on first use (avoid side effects at import time)
let sessionsCleanedUp = false;
function ensureSessionsCleanedUp(): void {
  if (sessionsCleanedUp) return;
  sessionsCleanedUp = true;
  cleanupStaleSessions(60 * 60 * 1000); // 1 hour
}

/**
 * Check if a provider type supports direct API calls (has API key auth).
 * OAuth and subscription providers require the proxy.
 */
export function isDirectCallViable(providerType: string): boolean {
  switch (providerType) {
    case "openai-compatible":
    case "anthropic-compatible":
      return true;
    case "openai-oauth":
    case "claude-subscription":
      return false;
    default:
      return true;
  }
}

/**
 * Write current status to file for statusline integration.
 * Called on server startup and periodically.
 */
export function updateStatusFile(): void {
  try {
    ensureSessionsCleanedUp();
    ensureSessionDir();
    const statusPath = getSessionStatusPath();

    const status = {
      activeTasks: [],
      concurrency: { active: 0, limit: 0, queued: 0 },
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(statusPath, JSON.stringify(status, null, 2));
  } catch (error) {
    console.error("Failed to update status file:", error);
  }
}
