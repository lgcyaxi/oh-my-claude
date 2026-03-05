/**
 * Bridge Bus Lifecycle — daemon management for the bus server.
 * Follows src/cli/utils/proxy-lifecycle.ts patterns.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from "node:fs";
import { BUS_DEFAULT_PORT } from "./types";
import type { BusHealthResponse } from "./types";

// Lazy imports to avoid circular deps — resolved at runtime
let BUS_SCRIPT: string;
let BUS_PID_FILE: string;

function resolvePaths() {
  if (BUS_SCRIPT) return;
  const { join } = require("node:path") as typeof import("node:path");
  const { homedir } = require("node:os") as typeof import("node:os");
  const installDir = join(homedir(), ".claude", "oh-my-claude");
  BUS_SCRIPT = join(installDir, "dist", "bridge-bus", "server.js");
  BUS_PID_FILE = join(installDir, "bridge-bus.pid");
}

/**
 * Resolve path to `bun` executable.
 */
function resolveBunPath(): string {
  try {
    const bunPath = execSync("which bun", {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (bunPath) return bunPath;
  } catch {}
  throw new Error("Bun runtime not found. Install: curl -fsSL https://bun.sh/install | bash");
}

/**
 * Check bus health by fetching /health endpoint.
 */
export async function checkBusHealth(port = BUS_DEFAULT_PORT): Promise<BusHealthResponse | null> {
  try {
    const resp = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as BusHealthResponse;
  } catch {
    return null;
  }
}

/**
 * Check if bus is running (PID alive + health check).
 */
export async function isBusRunning(port = BUS_DEFAULT_PORT): Promise<boolean> {
  resolvePaths();

  // Quick PID check first
  if (existsSync(BUS_PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(BUS_PID_FILE, "utf-8").trim(), 10);
      process.kill(pid, 0); // check if alive
    } catch {
      // PID file stale — remove
      try { unlinkSync(BUS_PID_FILE); } catch {}
      return false;
    }
  }

  // Health check confirms actual responsiveness
  const health = await checkBusHealth(port);
  return health?.status === "ok";
}

/**
 * Spawn the bus server as a detached daemon.
 */
export async function spawnDetachedBus(options?: {
  port?: number;
  debug?: boolean;
}): Promise<{ pid: number; healthy: boolean; logFile?: string }> {
  resolvePaths();

  const port = options?.port ?? BUS_DEFAULT_PORT;

  if (!existsSync(BUS_SCRIPT)) {
    throw new Error(
      `Bus server script not found at ${BUS_SCRIPT}. Run: bun run build:bus`,
    );
  }

  // Set up stdio
  let logFile: string | undefined;
  let stderrFd: number | "ignore" = "ignore";

  if (options?.debug) {
    const { join } = require("node:path") as typeof import("node:path");
    const { homedir } = require("node:os") as typeof import("node:os");
    logFile = join(homedir(), ".claude", "oh-my-claude", `bridge-bus.log`);
    stderrFd = openSync(logFile, "w");
  }

  const bunPath = resolveBunPath();
  const isWindows = process.platform === "win32";

  const child = spawn(bunPath, ["run", BUS_SCRIPT, "--port", String(port)], {
    detached: !isWindows,
    stdio: ["ignore", "ignore", stderrFd],
    env: { ...process.env },
    windowsHide: true,
  });
  child.unref();

  const pid = child.pid;
  if (!pid) {
    throw new Error("Failed to spawn bus server — no PID returned");
  }

  // Write PID file
  writeFileSync(BUS_PID_FILE, String(pid), "utf-8");

  // Wait for healthy (up to 3s)
  let healthy = false;
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const health = await checkBusHealth(port);
    if (health?.status === "ok") {
      healthy = true;
      break;
    }
  }

  return { pid, healthy, logFile };
}

/**
 * Stop the bus server.
 */
export async function stopBus(port = BUS_DEFAULT_PORT): Promise<boolean> {
  resolvePaths();

  // Try graceful shutdown via /stop
  try {
    await fetch(`http://localhost:${port}/stop`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
    // Wait briefly for shutdown
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // Server may already be down
  }

  // Kill by PID file if still alive
  if (existsSync(BUS_PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(BUS_PID_FILE, "utf-8").trim(), 10);
      process.kill(pid, "SIGTERM");
    } catch {
      // Already dead
    }
    try { unlinkSync(BUS_PID_FILE); } catch {}
  }

  return true;
}

/**
 * Ensure the bus is running — start if not.
 * Uses a simple lock via PID file existence check.
 */
export async function ensureBusRunning(port = BUS_DEFAULT_PORT): Promise<{ started: boolean; port: number }> {
  const running = await isBusRunning(port);
  if (running) {
    return { started: false, port };
  }

  const result = await spawnDetachedBus({ port });
  if (!result.healthy) {
    throw new Error("Bus server spawned but failed health check");
  }

  return { started: true, port };
}
