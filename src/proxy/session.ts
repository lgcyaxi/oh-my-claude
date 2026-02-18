/**
 * Per-session proxy state management
 *
 * Maintains in-memory switch state keyed by session ID, enabling multiple
 * Claude Code instances to use the proxy simultaneously without interference.
 *
 * Session IDs are embedded in the ANTHROPIC_BASE_URL path:
 *   http://localhost:18910/s/a7f3b2c1/v1/messages
 *
 * When no session ID is present, the proxy falls back to the global state
 * file (proxy-switch.json) for backward compatibility.
 *
 * State is intentionally volatile (in-memory only):
 * - No file contention between sessions
 * - Clean slate on proxy restart (no zombie state)
 * - Stale sessions auto-cleaned after 2 hours
 */

import type { ProxySwitchState } from "./types";
import { DEFAULT_SWITCH_STATE } from "./types";

/** Session entry: switch state + last activity timestamp + provider usage */
interface SessionEntry {
  state: ProxySwitchState;
  lastActivity: number;
  /** Per-provider request counts for this session */
  providerCounts: Map<string, number>;
}

/** In-memory session state map: sessionId -> SessionEntry */
const sessions = new Map<string, SessionEntry>();

/** Stale session TTL: 2 hours */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Cleanup interval: every 10 minutes */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Parse a session ID from a URL pathname.
 *
 * Matches paths like `/s/a7f3b2c1/v1/messages` and returns:
 * - sessionId: "a7f3b2c1"
 * - strippedPath: "/v1/messages"
 *
 * Returns null if no session prefix is found (backward compat path).
 */
export function parseSessionFromPath(pathname: string): {
  sessionId: string;
  strippedPath: string;
} | null {
  const match = pathname.match(/^\/s\/([a-zA-Z0-9_-]+)(\/.*)?$/);
  if (!match) return null;

  return {
    sessionId: match[1]!,
    strippedPath: match[2] || "/",
  };
}

/**
 * Read session switch state from in-memory store.
 * Returns default passthrough state if session doesn't exist.
 */
export function readSessionState(sessionId: string): ProxySwitchState {
  const entry = sessions.get(sessionId);
  if (!entry) {
    return { ...DEFAULT_SWITCH_STATE };
  }

  // Update last activity timestamp
  entry.lastActivity = Date.now();

  return { ...entry.state };
}

/**
 * Write session switch state to in-memory store.
 * Creates the session entry if it doesn't exist.
 */
export function writeSessionState(sessionId: string, state: ProxySwitchState): void {
  const existing = sessions.get(sessionId);
  sessions.set(sessionId, {
    state: { ...state },
    lastActivity: Date.now(),
    providerCounts: existing?.providerCounts ?? new Map(),
  });
}

/**
 * Reset session switch state to passthrough mode.
 */
export function resetSessionState(sessionId: string): void {
  const existing = sessions.get(sessionId);
  sessions.set(sessionId, {
    state: { ...DEFAULT_SWITCH_STATE },
    lastActivity: Date.now(),
    providerCounts: existing?.providerCounts ?? new Map(),
  });
}

/**
 * Clean up sessions that have been inactive for longer than SESSION_TTL_MS.
 * Called periodically by the proxy server.
 *
 * @returns Number of sessions cleaned up
 */
export function cleanupStaleSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, entry] of sessions) {
    if (now - entry.lastActivity > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.error(`[session] Cleaned up ${cleaned} stale session(s), ${sessions.size} active`);
  }

  return cleaned;
}

/**
 * Get the cleanup interval period in milliseconds.
 * Used by server.ts to set up the periodic cleanup timer.
 */
export function getCleanupIntervalMs(): number {
  return CLEANUP_INTERVAL_MS;
}

/**
 * Get the number of active sessions (for status reporting).
 */
export function getActiveSessionCount(): number {
  return sessions.size;
}

/**
 * Check if a session exists in the store.
 */
export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/**
 * Record a provider request for a session (for usage tracking).
 * Creates the session entry if it doesn't exist yet.
 */
export function recordSessionProviderRequest(sessionId: string, provider: string): void {
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = {
      state: { ...DEFAULT_SWITCH_STATE },
      lastActivity: Date.now(),
      providerCounts: new Map(),
    };
    sessions.set(sessionId, entry);
  }
  entry.lastActivity = Date.now();
  entry.providerCounts.set(provider, (entry.providerCounts.get(provider) ?? 0) + 1);
}

/**
 * Get all active sessions with their state and last activity.
 * Used by the control API /sessions endpoint.
 */
export function getActiveSessions(): Array<{
  sessionId: string;
  switched: boolean;
  provider?: string;
  model?: string;
  lastActivity: number;
  providerCounts: Record<string, number>;
}> {
  const result: Array<{
    sessionId: string;
    switched: boolean;
    provider?: string;
    model?: string;
    lastActivity: number;
    providerCounts: Record<string, number>;
  }> = [];

  for (const [sessionId, entry] of sessions) {
    result.push({
      sessionId,
      switched: entry.state.switched,
      provider: entry.state.provider,
      model: entry.state.model,
      lastActivity: entry.lastActivity,
      providerCounts: Object.fromEntries(entry.providerCounts),
    });
  }

  // Sort by last activity (most recent first)
  result.sort((a, b) => b.lastActivity - a.lastActivity);

  return result;
}
