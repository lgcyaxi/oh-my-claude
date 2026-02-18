/**
 * Shared proxy lifecycle management
 *
 * Two modes:
 * - `ensureProxyRunning()` — shared daemon for `oh-my-claude proxy start`
 * - `spawnSessionProxy()` — per-session child process for `oh-my-claude cc`
 */

import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, writeFileSync, openSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { PROXY_SCRIPT, PID_FILE, INSTALL_DIR } from "./paths";
import { checkHealth } from "./health";

export interface StartProxyResult {
  pid: number | undefined;
  started: boolean;
}

/**
 * Find an available TCP port by binding to port 0.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/**
 * Find two available TCP ports for proxy + control.
 */
export async function findFreePorts(): Promise<{ port: number; controlPort: number }> {
  const port = await findFreePort();
  const controlPort = await findFreePort();
  return { port, controlPort };
}

/**
 * Spawn a per-session proxy as a child process (NOT a detached daemon).
 * The proxy dies when the parent CC session exits.
 *
 * @returns The child process and health info, or null if proxy script missing
 */
export async function spawnSessionProxy(options: {
  port: number;
  controlPort: number;
  debug?: boolean;
  sessionId?: string;
}): Promise<{ child: ChildProcess; healthy: boolean; health?: Record<string, unknown>; logFile?: string } | null> {
  const { port, controlPort, debug, sessionId } = options;

  if (!existsSync(PROXY_SCRIPT)) {
    return null;
  }

  // Debug mode: write proxy stderr to a log file
  let stdio: StdioOptions = ["ignore", "ignore", "ignore"];
  let logFile: string | undefined;

  if (debug) {
    const logName = sessionId ? `proxy-${sessionId}.log` : `proxy-${Date.now()}.log`;
    logFile = join(INSTALL_DIR, logName);
    const fd = openSync(logFile, "w");
    stdio = ["ignore", fd, fd]; // stdout + stderr → log file
  }

  // Spawn as attached child process — dies with parent
  const child = spawn("bun", ["run", PROXY_SCRIPT, "--port", String(port), "--control-port", String(controlPort)], {
    stdio,
    env: { ...process.env },
    windowsHide: true,
  });

  // Wait for proxy to become healthy (up to 3s)
  let healthy = false;
  let health: Record<string, unknown> | undefined;
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      health = await checkHealth(String(controlPort));
      if (health?.status === "ok") {
        healthy = true;
        break;
      }
    } catch {
      // Keep waiting
    }
  }

  return { child, healthy, health, logFile };
}

/**
 * Spawn a detached proxy daemon that survives parent exit.
 * Used by `cc` when launching in a terminal window (parent returns immediately).
 *
 * @returns PID, health status, and optional log file path, or null if proxy script missing
 */
export async function spawnDetachedProxy(options: {
  port: number;
  controlPort: number;
  debug?: boolean;
  sessionId: string;
}): Promise<{ pid: number; healthy: boolean; logFile?: string } | null> {
  const { port, controlPort, debug, sessionId } = options;

  if (!existsSync(PROXY_SCRIPT)) {
    return null;
  }

  let stdio: StdioOptions = ["ignore", "ignore", "ignore"];
  let logFile: string | undefined;

  if (debug) {
    logFile = join(INSTALL_DIR, `proxy-${sessionId}.log`);
    const fd = openSync(logFile, "w");
    stdio = ["ignore", fd, fd];
  }

  const child = spawn("bun", ["run", PROXY_SCRIPT, "--port", String(port), "--control-port", String(controlPort)], {
    detached: true,
    stdio,
    env: { ...process.env },
    windowsHide: true,
  });
  child.unref();

  const pid = child.pid;
  if (!pid) {
    return null;
  }

  // Wait for proxy to become healthy (up to 3s)
  let healthy = false;
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const health = await checkHealth(String(controlPort));
      if (health?.status === "ok") {
        healthy = true;
        break;
      }
    } catch {
      // Keep waiting
    }
  }

  return { pid, healthy, logFile };
}

/**
 * Ensure proxy is running as a shared daemon. Used by `oh-my-claude proxy start`.
 *
 * @returns Whether the proxy is running and the PID (if newly started)
 */
export async function ensureProxyRunning(options: {
  port: string;
  controlPort: string;
}): Promise<{ alreadyRunning: boolean; started: boolean; pid?: number }> {
  const { port, controlPort } = options;

  // Check if already running
  try {
    const parsed = await checkHealth(controlPort);
    if (parsed.status === "ok") {
      return { alreadyRunning: true, started: true };
    }
  } catch {
    // Not running
  }

  // Check proxy script exists
  if (!existsSync(PROXY_SCRIPT)) {
    return { alreadyRunning: false, started: false };
  }

  // Spawn daemon
  const child = spawn("bun", ["run", PROXY_SCRIPT, "--port", port, "--control-port", controlPort], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env },
    windowsHide: true,
  });
  child.unref();

  if (child.pid) {
    try { writeFileSync(PID_FILE, String(child.pid), "utf-8"); } catch {}
  }

  // Wait for health (up to 3s)
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const parsed = await checkHealth(controlPort);
      if (parsed.status === "ok") {
        return { alreadyRunning: false, started: true, pid: child.pid };
      }
    } catch {
      // Keep waiting
    }
  }

  return { alreadyRunning: false, started: false, pid: child.pid };
}
