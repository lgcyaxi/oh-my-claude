import { BridgeOrchestratorImpl } from "./core";
import type { BridgeConfig, DaemonFactory } from "./types";
import type { AIConfig } from "../daemon/types";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { CodexDaemon, OpenCodeDaemon, CCDaemon } from "../daemon/ais";
import { createTerminalBackend, type TerminalBackendPreference } from "../terminal";

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
  // On Windows, always use WezTerm — even inside tmux ($TMUX set).
  // WezTerm is the host terminal; tmux runs inside it. The WezTerm CLI
  // (`wezterm cli spawn/send-text`) is reliably accessible from any subprocess,
  // while tmux server sockets may not be reachable from MCP/daemon subprocesses.
  if (process.platform === "win32") {
    return "wezterm";
  }

  // On Unix, prefer tmux (native, lightweight)
  if (process.env.TMUX) {
    return "tmux";
  }

  return "tmux";
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
      codex: createCodexFactory(),
      opencode: createOpenCodeFactory(),
      cc: createCCFactory(),
    },
  };
}

function createCodexFactory(): DaemonFactory {
  return async (config: AIConfig) => {
    const backend = getDefaultTerminalBackend();
    const terminal = await createTerminalBackend(backend);
    const projectPath = process.cwd();
    const runtimeDir = join(tmpdir(), "oh-my-claude-bridge", config.name);
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
    const runtimeDir = join(tmpdir(), "oh-my-claude-bridge", config.name);
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
    const runtimeDir = join(tmpdir(), "oh-my-claude-bridge", config.name);
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
