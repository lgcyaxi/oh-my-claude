import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

/** Persisted state for a single registered AI */
export interface AIEntry {
  name: string;
  cliCommand: string;
  startedAt: string;
  paneId?: string;
  pid?: number;
  terminalBackend?: "wezterm" | "windows-terminal" | "tmux";
  runtimeDir?: string;
  projectPath?: string;
}

/** Full bridge state persisted to disk */
export interface BridgeState {
  ais: AIEntry[];
  startedAt: string;
}

const STATE_DIR = join(tmpdir(), "oh-my-claude-bridge");
const STATE_FILE = join(STATE_DIR, "bridge-state.json");

/**
 * Read persisted bridge state from disk.
 * Returns empty state if file doesn't exist or is corrupt.
 */
export function readBridgeState(): BridgeState {
  try {
    if (!existsSync(STATE_FILE)) {
      return { ais: [], startedAt: new Date().toISOString() };
    }
    const content = readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(content) as BridgeState;
    if (!Array.isArray(parsed.ais)) {
      return { ais: [], startedAt: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { ais: [], startedAt: new Date().toISOString() };
  }
}

/**
 * Write bridge state to disk.
 */
export function writeBridgeState(state: BridgeState): void {
  try {
    if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Silently fail — state is best-effort
  }
}

/**
 * Add an AI entry to persisted state.
 */
export function addAIToState(entry: AIEntry): void {
  const state = readBridgeState();
  // Replace existing entry with same name
  state.ais = state.ais.filter((ai) => ai.name !== entry.name);
  state.ais.push(entry);
  writeBridgeState(state);
}

/**
 * Remove an AI entry from persisted state.
 */
export function removeAIFromState(name: string): void {
  const state = readBridgeState();
  state.ais = state.ais.filter((ai) => ai.name !== name);
  writeBridgeState(state);
}

/**
 * Clear all state (used by bridge down all).
 */
export function clearBridgeState(): void {
  try {
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Get the state file path (for diagnostics).
 */
export function getStateFilePath(): string {
  return STATE_FILE;
}

// ── Per-session bridge request tracking ─────────────────────────────
// Allows statusline to show request counts scoped to the current session.

export interface SessionBridgeRequest {
  requestId: string;
  aiName: string;
  status: "queued" | "processing" | "completed" | "error";
  createdAt: string;
}

export interface SessionBridgeState {
  activeRequests: SessionBridgeRequest[];
  lastUpdated: string;
}

/**
 * Get the per-session bridge state file path.
 * Uses Claude Code's PPID-based session directory.
 */
function getSessionBridgeStatePath(): string | null {
  try {
    const { getSessionId, ensureSessionDir } = require("../statusline/session");
    ensureSessionDir();
    const sessionId = getSessionId();
    return join(homedir(), ".claude", "oh-my-claude", "sessions", sessionId, "bridge-requests.json");
  } catch {
    return null;
  }
}

/**
 * Read per-session bridge request state.
 */
export function readSessionBridgeState(): SessionBridgeState {
  const path = getSessionBridgeStatePath();
  if (!path || !existsSync(path)) {
    return { activeRequests: [], lastUpdated: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { activeRequests: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Write per-session bridge request state.
 */
export function writeSessionBridgeState(state: SessionBridgeState): void {
  const path = getSessionBridgeStatePath();
  if (!path) return;
  try {
    const dir = join(path, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Non-critical
  }
}

/**
 * Add a bridge request to per-session state.
 */
export function addSessionBridgeRequest(requestId: string, aiName: string): void {
  const state = readSessionBridgeState();
  state.activeRequests.push({
    requestId,
    aiName,
    status: "processing",
    createdAt: new Date().toISOString(),
  });
  state.lastUpdated = new Date().toISOString();
  writeSessionBridgeState(state);
}

/**
 * Update a bridge request status in per-session state.
 */
export function updateSessionBridgeRequest(
  requestId: string,
  status: "completed" | "error"
): void {
  const state = readSessionBridgeState();
  const req = state.activeRequests.find(r => r.requestId === requestId);
  if (req) {
    req.status = status;
  }
  // Clean up completed/errored requests older than 5 minutes
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  state.activeRequests = state.activeRequests.filter(r =>
    r.status === "processing" || r.status === "queued" ||
    new Date(r.createdAt).getTime() > fiveMinAgo
  );
  state.lastUpdated = new Date().toISOString();
  writeSessionBridgeState(state);
}
