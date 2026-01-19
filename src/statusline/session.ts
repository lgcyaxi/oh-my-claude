/**
 * Session ID management for per-session status tracking
 *
 * Each Claude Code session gets a unique session ID to isolate:
 * - Active task tracking
 *
 * Session ID is based on Claude Code's parent PID (PPID) so that:
 * - All hooks (task-tracker, statusline) share the same session
 * - MCP server can discover the session via a shared file
 * - Different terminal windows have independent sessions
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";

// Base directory for session data
const SESSIONS_DIR = join(homedir(), ".claude", "oh-my-claude", "sessions");
const PPID_FILE = join(homedir(), ".claude", "oh-my-claude", "current-ppid.txt");

// Module-level session ID (generated once per process)
let _sessionId: string | null = null;

/**
 * Check if a process with given PID is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // On Unix, kill with signal 0 checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get process info (command name and PPID) for a given PID
 * Returns null if process doesn't exist
 */
function getProcessInfo(pid: number): { comm: string; ppid: number } | null {
  // Windows: use wmic or PowerShell to get process info
  if (process.platform === "win32") {
    try {
      // Use PowerShell to get process name and parent process ID
      const result = spawnSync("powershell", [
        "-NoProfile",
        "-Command",
        `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object @{Name='Name';Expression={$_.ProcessName}}, @{Name='ParentId';Expression={$_.ParentProcessId}} | ConvertTo-Json`
      ], {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.status !== 0 || !result.stdout) {
        return null;
      }
      const data = JSON.parse(result.stdout.trim());
      if (!data || !data.Name || !data.ParentId) {
        return null;
      }
      return { comm: data.Name, ppid: data.ParentId };
    } catch {
      return null;
    }
  }

  // Unix/Linux/macOS: use ps command
  try {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "comm=,ppid="], {
      encoding: "utf-8",
      timeout: 1000,
    });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }
    const output = result.stdout.trim();
    // Output format: "comm ppid" (e.g., "claude 12345" or "/path/to/claude 12345")
    const parts = output.split(/\s+/);
    if (parts.length < 2) return null;
    const ppidStr = parts[parts.length - 1] ?? "";
    const comm = parts.slice(0, -1).join(" ");
    const ppid = parseInt(ppidStr, 10);
    if (isNaN(ppid)) return null;
    return { comm, ppid };
  } catch {
    return null;
  }
}

/**
 * Find Claude Code process by walking up the process tree
 * Returns the PID of the Claude Code process, or null if not found
 */
function findClaudeCodePID(): number | null {
  let currentPid = process.ppid;
  const maxDepth = 10; // Prevent infinite loops

  for (let i = 0; i < maxDepth; i++) {
    const info = getProcessInfo(currentPid);
    if (!info) break;

    // Check if this is the Claude Code process
    // Unix: "claude" or path ending with "/claude"
    // Windows: "claude.exe" or "claude" (without extension from PowerShell)
    const commLower = info.comm.toLowerCase();
    const isClaude = process.platform === "win32"
      ? (commLower === "claude" || commLower === "claude.exe")
      : (commLower === "claude" || commLower.endsWith("/claude"));

    if (isClaude) {
      return currentPid;
    }

    // Move up to parent
    // On Windows, PID 0 is System Idle Process, on Unix 1 is init
    const minPid = process.platform === "win32" ? 0 : 1;
    if (info.ppid <= minPid) break;
    currentPid = info.ppid;
  }

  return null;
}

/**
 * Get the Claude Code PID for session identification
 *
 * Strategy:
 * 1. Walk up the process tree to find a process named "claude"
 * 2. If not found, check the shared PPID file (written by hooks)
 * 3. Fall back to own PPID
 */
function getClaudeCodePPID(): number {
  // Strategy 1: Walk up the process tree to find Claude Code
  const claudePid = findClaudeCodePID();
  if (claudePid !== null) {
    return claudePid;
  }

  // Strategy 2: Check shared PPID file (for MCP server discovery)
  try {
    if (existsSync(PPID_FILE)) {
      const content = readFileSync(PPID_FILE, "utf-8").trim();
      const parts = content.split(":");
      const pidStr = parts[0] ?? "";
      const timestampStr = parts[1] ?? "";
      const savedPpid = parseInt(pidStr, 10);
      const savedTimestamp = parseInt(timestampStr, 10);

      // Only use saved PPID if:
      // 1. It's a valid number
      // 2. The process is still running
      // 3. It was written within the last 30 minutes
      if (!isNaN(savedPpid) && savedPpid > 0 &&
          isProcessRunning(savedPpid) &&
          Date.now() - savedTimestamp < 30 * 60 * 1000) {
        return savedPpid;
      }
    }
  } catch {
    // Ignore errors, fall back to own PPID
  }

  // Strategy 3: Fall back to own PPID
  return process.ppid;
}

/**
 * Write the current PPID to the shared file
 * Called by hooks to advertise their Claude Code parent
 */
export function writeCurrentPPID(): void {
  try {
    const ppid = process.ppid;
    const timestamp = Date.now();
    const dir = join(homedir(), ".claude", "oh-my-claude");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(PPID_FILE, `${ppid}:${timestamp}`);
  } catch {
    // Silently fail
  }
}

/**
 * Get or create the session ID for this process
 * Uses Claude Code's PPID to ensure all related processes share the same session
 */
export function getSessionId(): string {
  if (!_sessionId) {
    const ppid = getClaudeCodePPID();
    _sessionId = `pid-${ppid}`;

    // Lazy cleanup of stale sessions on first access
    cleanupStaleSessions();
  }
  return _sessionId;
}

/**
 * Get the sessions directory path
 */
export function getSessionsDir(): string {
  return SESSIONS_DIR;
}

/**
 * Get the status file path for a session
 */
export function getSessionStatusPath(sessionId?: string): string {
  const id = sessionId ?? getSessionId();
  return join(SESSIONS_DIR, id, "status.json");
}

/**
 * Get the task agents file path for a session
 */
export function getSessionTaskAgentsPath(sessionId?: string): string {
  const id = sessionId ?? getSessionId();
  return join(SESSIONS_DIR, id, "task-agents.json");
}

/**
 * Ensure session directory exists
 */
export function ensureSessionDir(sessionId?: string): string {
  const id = sessionId ?? getSessionId();
  const sessionDir = join(SESSIONS_DIR, id);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

/**
 * Get all active session directories
 * Returns session IDs that have been updated recently (within maxAge)
 */
export function getActiveSessions(maxAgeMs: number = 30 * 60 * 1000): string[] {
  if (!existsSync(SESSIONS_DIR)) {
    return [];
  }

  const now = Date.now();
  const sessions: string[] = [];

  try {
    const entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const statusPath = join(SESSIONS_DIR, entry.name, "status.json");
        if (existsSync(statusPath)) {
          const stat = statSync(statusPath);
          if (now - stat.mtimeMs < maxAgeMs) {
            sessions.push(entry.name);
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return sessions;
}

/**
 * Cleanup stale session directories
 * Removes sessions for PIDs that are no longer running
 */
export function cleanupStaleSessions(maxAgeMs: number = 60 * 60 * 1000): number {
  if (!existsSync(SESSIONS_DIR)) {
    return 0;
  }

  const now = Date.now();
  let cleaned = 0;

  try {
    const entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionDir = join(SESSIONS_DIR, entry.name);
        const dirName = entry.name;

        // Check if this is a PID-based session directory
        if (dirName.startsWith("pid-")) {
          const pidStr = dirName.substring(4);
          const pid = parseInt(pidStr, 10);

          // If PID is valid and process is NOT running, clean up
          if (!isNaN(pid) && pid > 0 && !isProcessRunning(pid)) {
            rmSync(sessionDir, { recursive: true, force: true });
            cleaned++;
            continue;
          }
        }

        // For non-PID directories (old format) or still-running PIDs,
        // fall back to time-based cleanup
        const statusPath = join(sessionDir, "status.json");
        let isStale = false;
        if (existsSync(statusPath)) {
          const stat = statSync(statusPath);
          isStale = now - stat.mtimeMs > maxAgeMs;
        } else {
          const stat = statSync(sessionDir);
          isStale = now - stat.mtimeMs > maxAgeMs;
        }

        if (isStale) {
          rmSync(sessionDir, { recursive: true, force: true });
          cleaned++;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return cleaned;
}
