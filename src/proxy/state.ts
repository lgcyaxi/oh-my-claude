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
      switchedAt: parsed.switchedAt,
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
