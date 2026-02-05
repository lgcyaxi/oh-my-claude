/**
 * Proxy switch state management
 *
 * Reads/writes proxy-switch.json signal file used for IPC
 * between the MCP server (writer) and proxy server (reader).
 *
 * Path: ~/.claude/oh-my-claude/proxy-switch.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { ProxySwitchState } from "./types";
import { DEFAULT_SWITCH_STATE } from "./types";

/** Path to the proxy switch state file */
export function getSwitchStatePath(): string {
  return join(homedir(), ".claude", "oh-my-claude", "proxy-switch.json");
}

/**
 * Read current switch state from disk
 * Returns default passthrough state if file doesn't exist or is invalid
 */
export function readSwitchState(): ProxySwitchState {
  const statePath = getSwitchStatePath();

  try {
    if (!existsSync(statePath)) {
      return { ...DEFAULT_SWITCH_STATE };
    }

    const content = readFileSync(statePath, "utf-8");
    const parsed = JSON.parse(content) as ProxySwitchState;

    // Validate required fields
    if (typeof parsed.switched !== "boolean") {
      return { ...DEFAULT_SWITCH_STATE };
    }

    return {
      switched: parsed.switched,
      provider: parsed.provider,
      model: parsed.model,
      requestsRemaining: parsed.requestsRemaining ?? 0,
      switchedAt: parsed.switchedAt,
      timeoutAt: parsed.timeoutAt,
      skipInitialRequests: parsed.skipInitialRequests,
    };
  } catch {
    return { ...DEFAULT_SWITCH_STATE };
  }
}

/**
 * Write switch state to disk atomically
 * Creates parent directories if needed
 */
export function writeSwitchState(state: ProxySwitchState): void {
  const statePath = getSwitchStatePath();
  const dir = dirname(statePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write to temp file then rename for atomicity
  const tmpPath = `${statePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");

  const { renameSync } = require("node:fs") as typeof import("node:fs");
  renameSync(tmpPath, statePath);
}

/**
 * Reset switch state to passthrough mode
 */
export function resetSwitchState(): void {
  writeSwitchState({ ...DEFAULT_SWITCH_STATE });
}

/**
 * Decrement the request counter and auto-reset if exhausted or timed out.
 *
 * Respects skipInitialRequests: when > 0, the first N requests after switch
 * activation are "free" (not counted). This accounts for slash command
 * overhead (MCP tool call cycle + confirmation response).
 *
 * @returns true if still switched, false if reverted to passthrough
 */
export function decrementAndCheck(): boolean {
  const state = readSwitchState();

  if (!state.switched) {
    return false;
  }

  // Check timeout
  if (state.timeoutAt && Date.now() > state.timeoutAt) {
    resetSwitchState();
    return false;
  }

  // Skip initial requests (slash command overhead)
  if (state.skipInitialRequests && state.skipInitialRequests > 0) {
    state.skipInitialRequests -= 1;
    writeSwitchState(state);
    return true;
  }

  // requestsRemaining < 0 means unlimited (manual revert only)
  if (state.requestsRemaining < 0) {
    return true;
  }

  // Decrement counter
  state.requestsRemaining -= 1;

  if (state.requestsRemaining <= 0) {
    // Exhausted — revert to passthrough
    resetSwitchState();
    return false;
  }

  // Still has remaining requests
  writeSwitchState(state);
  return true;
}

/**
 * Check if the switch state has timed out without modifying state
 */
export function isTimedOut(state: ProxySwitchState): boolean {
  if (!state.switched || !state.timeoutAt) {
    return false;
  }
  return Date.now() > state.timeoutAt;
}
