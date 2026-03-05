/**
 * Proxy segment - shows proxy switch status
 *
 * Hidden when not switched (no visual noise).
 * When switched: [→DeepSeek/DeepSeek R] (arrow prefix = redirected, full provider/model)
 * Color: yellow when switched (attention-grabbing)
 *
 * Session-aware: extracts session ID from ANTHROPIC_BASE_URL and queries
 * the control API for session-scoped status (accurate per-session state).
 * Falls back to global file state if control API is unreachable.
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { readSwitchState } from "../../../proxy/state";
import type { ProxySwitchState } from "../../../proxy/types";
import { DEFAULT_PROXY_CONFIG } from "../../../proxy/types";

/**
 * Get the control port from environment variable OMC_PROXY_CONTROL_PORT,
 * or fall back to the default port.
 */
function getControlPort(): number {
  const envPort = process.env.OMC_PROXY_CONTROL_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_PROXY_CONFIG.controlPort;
}

/** Full provider display names */
const PROVIDER_DISPLAY: Record<string, string> = {
  deepseek: "DeepSeek",
  zhipu: "ZhiPu",
  "zhipu-global": "Z.AI",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax CN",
  kimi: "Kimi",
  openai: "OpenAI",
  aliyun: "Aliyun",
};

/** Full model display names */
function getModelDisplay(model: string): string {
  const displayMap: Record<string, string> = {
    // DeepSeek
    "deepseek-reasoner": "DeepSeek R",
    "deepseek-chat": "DeepSeek Chat",
    // ZhiPu / Z.AI
    "glm-5": "GLM-5",
    "GLM-5": "GLM-5",
    "glm-4.7": "GLM-4.7",
    // MiniMax
    "MiniMax-M2.5": "MiniMax-M2.5",
    "minimax-m2.5": "MiniMax-M2.5",
    // Kimi
    "kimi-for-coding": "Kimi K2.5",
    "kimi-k2.5": "Kimi K2.5",
    "kimi2p5": "Kimi K2.5",
    "k2.5": "Kimi K2.5",
    "K2.5": "Kimi K2.5",
    // Aliyun / Qwen
    "qwen3.5-plus": "Qwen 3.5+",
    "qwen3.5": "Qwen 3.5+",
    "qwen3-max-2026-01-23": "Qwen 3 Max",
    "qwen3-coder-next": "Qwen Coder Next",
    "qwen3-coder-plus": "Qwen Coder+",
    // OpenAI / Codex
    "gpt-5.2": "GPT-5.2",
    "gpt-5.3-codex": "GPT-5.3 Codex",
    "o3-mini": "o3-mini",
  };

  return displayMap[model] ?? model;
}

/**
 * Extract session ID from ANTHROPIC_BASE_URL.
 * Matches paths like /s/{sessionId} at the end of the URL.
 */
function extractSessionId(): string | undefined {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Try to get switch state from the control API (session-scoped).
 * Returns null if the control API is unreachable.
 */
async function fetchStatusFromControlApi(sessionId?: string): Promise<ProxySwitchState | null> {
  try {
    const controlPort = getControlPort();
    const url = sessionId
      ? `http://localhost:${controlPort}/status?session=${sessionId}`
      : `http://localhost:${controlPort}/status`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!resp.ok) return null;
    return await resp.json() as ProxySwitchState;
  } catch {
    return null;
  }
}

/**
 * Collect proxy switch data
 */
async function collectProxyData(_context: SegmentContext): Promise<SegmentData | null> {
  try {
    const sessionId = extractSessionId();

    // Prefer control API for session-accurate status
    let state: ProxySwitchState | null = null;
    if (sessionId) {
      state = await fetchStatusFromControlApi(sessionId);
    }

    // Fallback to global file state
    if (!state) {
      state = readSwitchState();
    }

    const isSwitched = state.switched;

    // Hidden when not switched AND no session (not connected through proxy)
    if (!isSwitched && !sessionId) {
      return null;
    }

    if (sessionId) {
      const isBridgeWorker = process.env.OMC_BRIDGE_PANE === "1";

      if (isSwitched && state.provider) {
        const providerLabel = PROVIDER_DISPLAY[state.provider] ?? state.provider;

        if (isBridgeWorker) {
          // Bridge worker — compact format: [session ~Provider]
          return {
            primary: `session ~${providerLabel}`,
            metadata: { newLine: "true" },
            color: "neutral",
          };
        }

        // Main session — explicit switch active
        return {
          primary: `s:${sessionId.slice(0, 8)} →${providerLabel}`,
          metadata: { newLine: "true" },
          color: "warning",
        };
      }

      if (isBridgeWorker) {
        // Bridge worker passthrough — just show session tag
        return {
          primary: `session`,
          metadata: { newLine: "true" },
          color: "neutral",
        };
      }

      // Plain proxy session (passthrough)
      return {
        primary: `s:${sessionId.slice(0, 8)}`,
        metadata: { newLine: "true" },
        color: "neutral",
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Format proxy segment for display
 */
function formatProxySegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export const proxySegment: Segment = {
  id: "proxy",
  collect: collectProxyData,
  format: formatProxySegment,
};
