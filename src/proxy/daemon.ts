/**
 * Daemon wrapper for oh-my-claude proxy server
 *
 * Manages the proxy server as a background process with PID tracking.
 * Cross-platform support for Windows, macOS, and Linux.
 */

import { spawn } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const INSTALL_DIR = join(homedir(), ".claude", "oh-my-claude");
const PID_FILE = join(INSTALL_DIR, "proxy.pid");
const SERVER_SCRIPT = join(INSTALL_DIR, "dist", "proxy", "server.js");

/** Check if a process is running */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Get the proxy server script path */
export function getServerScript(): string {
  return SERVER_SCRIPT;
}

/** Check if the daemon is running */
export function isRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    return isProcessRunning(pid);
  } catch {
    return false;
  }
}

/** Start the proxy daemon */
export async function startDaemon(options?: {
  port?: number;
  controlPort?: number;
  foreground?: boolean;
}): Promise<{ pid: number; port: number; controlPort: number }> {
  const port = options?.port ?? 18910;
  const controlPort = options?.controlPort ?? 18911;

  // Check if already running
  if (isRunning()) {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
    if (isProcessRunning(pid)) {
      return { pid, port, controlPort };
    }
    // Stale PID file, clean up
    unlinkSync(PID_FILE);
  }

  // Check if server script exists
  if (!existsSync(SERVER_SCRIPT)) {
    throw new Error(
      `Proxy server not found at ${SERVER_SCRIPT}\nRun 'oh-my-claude install' first.`
    );
  }

  // Check if Bun is available
  try {
    execSync("bun --version", { stdio: "pipe" });
  } catch {
    throw new Error("Bun runtime not found. Please install Bun: https://bun.sh");
  }

  // Spawn the proxy server
  const args = [];
  if (options?.port) {
    args.push("--port", String(options.port));
  }
  if (options?.controlPort) {
    args.push("--control-port", String(options.controlPort));
  }

  const proc = spawn("bun", [SERVER_SCRIPT, ...args], {
    detached: true,
    stdio: options?.foreground ? "inherit" : "ignore",
    windowsHide: true,
  });

  const pid = proc.pid;
  if (pid === undefined) {
    throw new Error("Failed to get process PID");
  }

  if (options?.foreground) {
    // Running in foreground, don't unref
    return { pid, port, controlPort };
  }

  // Background mode: detach from parent
  proc.unref();

  // Write PID file
  writeFileSync(PID_FILE, String(pid));

  return { pid, port, controlPort };
}

/** Stop the proxy daemon */
export function stopDaemon(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());

    if (!isProcessRunning(pid)) {
      // Stale PID file
      unlinkSync(PID_FILE);
      return false;
    }

    // Try graceful shutdown first (SIGTERM)
    process.kill(pid, "SIGTERM");

    // Wait up to 2 seconds for process to exit
    const start = Date.now();
    while (Date.now() - start < 2000) {
      if (!isProcessRunning(pid)) {
        break;
      }
      // Busy wait (short duration)
    }

    // Force kill if still running
    if (isProcessRunning(pid)) {
      process.kill(pid, "SIGKILL");
    }

    unlinkSync(PID_FILE);
    return true;
  } catch (error) {
    // If we can't read the PID file, try to delete it
    try {
      unlinkSync(PID_FILE);
    } catch {
      // Ignore
    }
    throw error;
  }
}

/** Get the PID from the PID file */
export function getPid(): number | null {
  try {
    if (!existsSync(PID_FILE)) {
      return null;
    }
    return parseInt(readFileSync(PID_FILE, "utf-8").trim());
  } catch {
    return null;
  }
}
