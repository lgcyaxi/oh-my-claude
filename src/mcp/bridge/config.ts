import type { AIConfig } from "../../workers/daemon/types";
import type { WorkerRole } from "../../assets/agents/types";
import { getSystemTerminalBackend } from "../../workers/terminal/platform";

type BridgeAIConfigDefaults = Omit<AIConfig, "name"> & {
  role: WorkerRole;
  taskCategories: string[];
};

export const DEFAULT_BRIDGE_AI_CONFIGS: Record<string, BridgeAIConfigDefaults> = {
  codex: {
    cliCommand: "codex",
    cliArgs: ["app-server"],
    idleTimeoutMs: 60000,
    requestTimeoutMs: 300000,
    maxRetries: 3,
    role: "audit",
    taskCategories: ["review", "analyze", "think", "audit", "check", "inspect"],
  },
  opencode: {
    cliCommand: "opencode",
    cliArgs: [],
    idleTimeoutMs: 60000,
    requestTimeoutMs: 300000,
    maxRetries: 3,
    role: "general",
    taskCategories: [],
  },
  cc: {
    cliCommand: "oh-my-claude",
    cliArgs: ["cc", "-t", "none", "-skip"],
    idleTimeoutMs: 120000,
    requestTimeoutMs: 600000,
    maxRetries: 1,
    role: "general",
    taskCategories: [],
  },
  // Provider-switched CC variants — spawn CC pre-connected to a specific provider
  "cc:kimi": {
    cliCommand: "oh-my-claude",
    cliArgs: ["cc", "-t", "none", "-skip"],
    idleTimeoutMs: 120000,
    requestTimeoutMs: 600000,
    maxRetries: 1,
    switchProvider: "kimi",
    switchModel: "kimi-for-coding",
    role: "design",
    taskCategories: ["ui", "image", "media", "visual", "design", "screenshot", "multimodal"],
  },
  "cc:zp": {
    cliCommand: "oh-my-claude",
    cliArgs: ["cc", "-t", "none", "-skip"],
    idleTimeoutMs: 120000,
    requestTimeoutMs: 600000,
    maxRetries: 1,
    switchProvider: "zhipu",
    switchModel: "glm-5",
    role: "code",
    taskCategories: ["edit", "implement", "refactor", "patch", "fix", "change"],
  },
  "cc:qwen": {
    cliCommand: "oh-my-claude",
    cliArgs: ["cc", "-t", "none", "-skip"],
    idleTimeoutMs: 120000,
    requestTimeoutMs: 600000,
    maxRetries: 1,
    switchProvider: "aliyun",
    switchModel: "qwen3.5-plus",
    role: "general",
    taskCategories: [],
  },
  "cc:mm-cn": {
    cliCommand: "oh-my-claude",
    cliArgs: ["cc", "-t", "none", "-skip"],
    idleTimeoutMs: 120000,
    requestTimeoutMs: 600000,
    maxRetries: 1,
    switchProvider: "minimax-cn",
    switchModel: "MiniMax-M2.5",
    role: "docs",
    taskCategories: ["document", "write", "explain", "readme", "comment", "spec"],
  },
  "cc:ds": {
    cliCommand: "oh-my-claude",
    cliArgs: ["cc", "-t", "none", "-skip"],
    idleTimeoutMs: 120000,
    requestTimeoutMs: 600000,
    maxRetries: 1,
    switchProvider: "deepseek",
    switchModel: "deepseek-chat",
    role: "general",
    taskCategories: [],
  },
};

export function getBridgeBaseAIName(name: string): string {
  const colonIdx = name.indexOf(":");
  return colonIdx > 0 ? name.slice(0, colonIdx) : name;
}

export function createBridgeAIConfig(name: string): AIConfig {
  // Exact match first (e.g. "cc:mm-cn", "cc:ds"), then base name fallback (e.g. "cc:2" → "cc")
  const defaults = DEFAULT_BRIDGE_AI_CONFIGS[name] ?? DEFAULT_BRIDGE_AI_CONFIGS[getBridgeBaseAIName(name)];
  if (!defaults) {
    throw new Error(`Unknown AI: ${name}. Supported: ${Object.keys(DEFAULT_BRIDGE_AI_CONFIGS).join(", ")}`);
  }
  return {
    name,
    ...defaults,
  };
}

export function detectBridgeTerminalBackend(): "tmux" | "wezterm" {
  return getSystemTerminalBackend();
}

/**
 * Get bridge bus env vars to pass to CC workers.
 * sessionId scopes workers to a specific main CC session for multi-session isolation.
 */
export function getBusBridgeEnvVars(workerName: string, sessionId?: string): Record<string, string> {
  const vars: Record<string, string> = {
    OMC_BUS_PORT: process.env.OMC_BUS_PORT ?? "18912",
    OMC_BRIDGE_WORKER_ID: workerName,
  };
  if (sessionId) {
    vars.OMC_SESSION_ID = sessionId;
  }
  return vars;
}
