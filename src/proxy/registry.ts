/**
 * Proxy session registry — file-based discovery for GUI tools
 *
 * Allows external apps (e.g., menu bar switcher) to discover
 * running oh-my-claude proxy sessions and their control ports.
 *
 * Uses atomic writes (temp file + rename) to prevent corruption.
 */

import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { PROXY_REGISTRY, getWindowsProxyRegistryPath } from "../cli/utils/paths";

/** A registered proxy session entry */
export interface ProxySessionEntry {
  /** Short hex session ID (e.g., "a7f3b2c1") */
  sessionId: string;
  /** Proxy server port (Claude Code connects here) */
  port: number;
  /** Control API port (health/status/switch/revert) */
  controlPort: number;
  /** OS process ID of the proxy child */
  pid: number;
  /** Timestamp when the session started */
  startedAt: number;
  /** Working directory of the CC session */
  cwd?: string;
  /** Terminal pane ID (for cleanup via cc stop) */
  paneId?: string;
  /** Terminal backend used ("wezterm" | "tmux") */
  terminalBackend?: string;
  /** Whether proxy was spawned as a detached daemon */
  detached?: boolean;
  /** Session origin: "wsl2" for WSL sessions, undefined for native */
  source?: "wsl2";
}

/**
 * Read all entries from the registry file.
 * Returns empty array if file doesn't exist or is invalid.
 */
export function readProxyRegistry(): ProxySessionEntry[] {
  try {
    if (!existsSync(PROXY_REGISTRY)) return [];
    const content = readFileSync(PROXY_REGISTRY, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed as ProxySessionEntry[];
  } catch {
    return [];
  }
}

/**
 * Write entries atomically: write to temp file, then rename.
 */
function writeRegistryAtomic(entries: ProxySessionEntry[]): void {
  const dir = dirname(PROXY_REGISTRY);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpFile = join(dir, `.proxy-sessions.${randomBytes(4).toString("hex")}.tmp`);
  try {
    writeFileSync(tmpFile, JSON.stringify(entries, null, 2), "utf-8");
    renameSync(tmpFile, PROXY_REGISTRY);
  } catch (err) {
    // Clean up temp file on failure
    try { unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

/**
 * Read a proxy registry from an arbitrary path.
 */
function readRegistryAt(path: string): ProxySessionEntry[] {
  try {
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed as ProxySessionEntry[];
  } catch {
    return [];
  }
}

/**
 * Atomic write to an arbitrary registry path.
 */
function writeRegistryAtomicAt(path: string, entries: ProxySessionEntry[]): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpFile = join(dir, `.proxy-sessions.${randomBytes(4).toString("hex")}.tmp`);
  try {
    writeFileSync(tmpFile, JSON.stringify(entries, null, 2), "utf-8");
    renameSync(tmpFile, path);
  } catch (err) {
    try { unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

/**
 * Check if a PID is alive.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register a new proxy session in the registry.
 */
export function registerProxySession(entry: ProxySessionEntry): void {
  const entries = readProxyRegistry().filter(
    (e) => e.sessionId !== entry.sessionId
  );
  entries.push(entry);
  writeRegistryAtomic(entries);

  // Dual-write to Windows-side registry when running in WSL2
  const winPath = getWindowsProxyRegistryPath();
  if (winPath) {
    try {
      const winEntries = readRegistryAt(winPath).filter(
        (e) => e.sessionId !== entry.sessionId
      );
      winEntries.push({ ...entry, source: "wsl2" });
      writeRegistryAtomicAt(winPath, winEntries);
    } catch {
      // Best-effort — don't fail the session if Windows write fails
    }
  }
}

/**
 * Remove a session from the registry.
 */
export function unregisterProxySession(sessionId: string): void {
  const entries = readProxyRegistry().filter(
    (e) => e.sessionId !== sessionId
  );
  writeRegistryAtomic(entries);

  // Remove from Windows-side registry too
  const winPath = getWindowsProxyRegistryPath();
  if (winPath) {
    try {
      const winEntries = readRegistryAt(winPath).filter(
        (e) => e.sessionId !== sessionId
      );
      writeRegistryAtomicAt(winPath, winEntries);
    } catch {
      // Best-effort
    }
  }
}

/**
 * Remove entries whose PIDs are no longer alive.
 * @returns Number of stale entries removed
 */
export function cleanupStaleEntries(): number {
  const entries = readProxyRegistry();
  const alive = entries.filter((e) => isPidAlive(e.pid));
  const removed = entries.length - alive.length;

  if (removed > 0) {
    writeRegistryAtomic(alive);
  }

  return removed;
}
