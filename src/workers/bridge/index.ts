import { BridgeOrchestratorImpl } from "./core";
import type { BridgeConfig, DaemonFactory } from "./types";
import type { AIConfig } from "../daemon/types";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { CodexDaemon, CodexAppServerDaemon, OpenCodeDaemon, CCDaemon } from "../daemon/ais";
import { createTerminalBackend, type TerminalBackendPreference, getSystemTerminalBackend } from "../terminal";

export type {
  RequestStatus,
  BridgeResponse,
  AIStatus,
  RequestInfo,
  HealthState,
  HealthStatus,
  SystemStatus,
  DaemonFactory,
  BridgeConfig,
  BridgeOrchestrator,
} from "./types";

export { DaemonRegistry } from "./registry";
export { BridgeOrchestratorImpl } from "./core";

let bridgeOrchestratorInstance: BridgeOrchestratorImpl | null = null;

function getDefaultTerminalBackend(): TerminalBackendPreference {
  return getSystemTerminalBackend();
}

function createDefaultConfig(): BridgeConfig {
  const backend = getDefaultTerminalBackend();
  
  return {
    runDir: join(tmpdir(), "oh-my-claude-bridge"),
    logLevel: "info",
    ais: [],
    terminal: {
      backend,
      autoCreatePanes: false,
      paneLayout: "horizontal",
    },
    daemon: {
      idleTimeoutMs: 30000,
      maxRetries: 3,
      requestTimeoutMs: 60000,
    },
    daemonFactories: {
      codex: createCodexAppServerFactory(),
      opencode: createOpenCodeFactory(),
      cc: createCCFactory(),
    },
  };
}

/** Sanitize an AI name for use as a directory component (replaces : with -). */
function safeDirName(name: string): string {
  return name.replace(/:/g, "-");
}

/** Headless proc-based factory — uses CodexAppServerDaemon (no terminal pane). */
function createCodexAppServerFactory(): DaemonFactory {
  return async (config: AIConfig) => new CodexAppServerDaemon({ config, projectPath: process.cwd() });
}

/** Legacy terminal-pane factory — kept as fallback reference, not used by default. */
function createCodexTerminalFactory(): DaemonFactory {
  return async (config: AIConfig) => {
    const backend = getDefaultTerminalBackend();
    const terminal = await createTerminalBackend(backend);
    const projectPath = process.cwd();
    const runtimeDir = join(tmpdir(), "oh-my-claude-bridge", safeDirName(config.name));
    await mkdir(runtimeDir, { recursive: true });

    return new CodexDaemon({
      config,
      terminal,
      projectPath,
      runtimeDir,
    });
  };
}

function createOpenCodeFactory(): DaemonFactory {
  return async (config: AIConfig) => {
    const backend = getDefaultTerminalBackend();
    const terminal = await createTerminalBackend(backend);
    const projectPath = process.cwd();
    const runtimeDir = join(tmpdir(), "oh-my-claude-bridge", safeDirName(config.name));
    await mkdir(runtimeDir, { recursive: true });

    return new OpenCodeDaemon({
      config,
      terminal,
      projectPath,
      runtimeDir,
    });
  };
}

function createCCFactory(): DaemonFactory {
  return async (config: AIConfig) => {
    const backend = getDefaultTerminalBackend();
    const terminal = await createTerminalBackend(backend);
    const projectPath = process.cwd();
    const runtimeDir = join(tmpdir(), "oh-my-claude-bridge", safeDirName(config.name));
    await mkdir(runtimeDir, { recursive: true });

    return new CCDaemon({
      config,
      terminal,
      projectPath,
      runtimeDir,
    });
  };
}

export function getBridgeOrchestrator(): BridgeOrchestratorImpl {
  if (!bridgeOrchestratorInstance) {
    bridgeOrchestratorInstance = new BridgeOrchestratorImpl(createDefaultConfig());
  }
  return bridgeOrchestratorInstance;
}

/** Reset the singleton (e.g., for testing or when cwd changes) */
export function resetBridgeOrchestrator(): void {
  bridgeOrchestratorInstance = null;
}
