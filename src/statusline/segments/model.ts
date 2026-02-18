/**
 * Model segment - shows current Claude model
 * Data source: Claude Code stdin JSON (model.id, model.display_name)
 * Graceful degradation: Shows "?" if data unavailable
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { readSwitchState } from "../../proxy/state";
import type { ProxySwitchState } from "../../proxy/types";
import { DEFAULT_PROXY_CONFIG } from "../../proxy/types";

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
async function fetchStatusFromControlApi(sessionId: string): Promise<ProxySwitchState | null> {
  try {
    const controlPort = getControlPort();
    const url = `http://localhost:${controlPort}/status?session=${sessionId}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!resp.ok) return null;
    return await resp.json() as ProxySwitchState;
  } catch {
    return null;
  }
}


// Model display names mapping - FULL names for native Claude models
const MODEL_DISPLAY: Record<string, string> = {
  // Claude 4.6 models (latest)
  "claude-opus-4-6-20251101": "Opus 4.6",
  "claude-sonnet-4-6-20251101": "Sonnet 4.6",
  "claude-haiku-4-6-20251101": "Haiku 4.6",
  // Claude 4.5 models
  "claude-opus-4-5-20251101": "Opus 4.5",
  "claude-sonnet-4-5-20251101": "Sonnet 4.5",
  "claude-haiku-4-5-20251101": "Haiku 4.5",
  // Shorter aliases
  "opus-4.6": "Opus 4.6",
  "sonnet-4.6": "Sonnet 4.6",
  "haiku-4.6": "Haiku 4.6",
  "opus-4.5": "Opus 4.5",
  "sonnet-4.5": "Sonnet 4.5",
  "haiku-4.5": "Haiku 4.5",
  // Legacy
  "claude-3-opus": "Opus 3",
  "claude-3-sonnet": "Sonnet 3",
  "claude-3-haiku": "Haiku 3",
  // Aliases for detection
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-6": "Haiku 4.6",
};

/** Full model names for external providers (used when switched) */
const EXTERNAL_MODEL_DISPLAY: Record<string, string> = {
  // DeepSeek
  "deepseek-reasoner": "DeepSeek R",
  "deepseek-chat": "DeepSeek Chat",
  // ZhiPu
  "GLM-5": "GLM-5",
  "glm-4v-flash": "GLM-4V Flash",
  // MiniMax
  "minimax-m2.5": "MiniMax-M2.5",
  "MiniMax-M2.5": "MiniMax-M2.5",
  // Kimi
  "k2.5": "Kimi K2.5",
  "K2.5": "Kimi K2.5",
  // OpenAI
  "gpt-5.2": "GPT-5.2",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "o3-mini": "o3-mini",
};

/**
 * Get full model name for display
 * @param modelId - The model ID (e.g., "claude-opus-4-6-20251101" or "MiniMax-M2.5")
 * @param isExternal - If true, use external provider naming; otherwise use Claude naming
 */
function getModelDisplay(modelId: string, isExternal: boolean = false): string {
  // For external providers, check EXTERNAL_MODEL_DISPLAY first
  if (isExternal) {
    if (EXTERNAL_MODEL_DISPLAY[modelId]) {
      return EXTERNAL_MODEL_DISPLAY[modelId];
    }
    // Try case-insensitive match
    const lower = modelId.toLowerCase();
    for (const [key, value] of Object.entries(EXTERNAL_MODEL_DISPLAY)) {
      if (key.toLowerCase() === lower) {
        return value;
      }
    }
    // Return as-is if not found
    return modelId;
  }

  // For Claude models, check MODEL_DISPLAY
  if (MODEL_DISPLAY[modelId]) {
    return MODEL_DISPLAY[modelId];
  }

  // Extract meaningful part from model ID
  const lower = modelId.toLowerCase();
  if (lower.includes("opus")) return "Opus";
  if (lower.includes("sonnet")) return "Sonnet";
  if (lower.includes("haiku")) return "Haiku";

  // Fallback to abbreviated model ID
  return modelId.length > 12 ? modelId.slice(0, 10) + ".." : modelId;
}

/**
 * Determine color based on model tier
 */
function getModelColor(modelId: string): SegmentData["color"] {
  const lower = modelId.toLowerCase();
  if (lower.includes("opus")) return "critical"; // Premium - red for emphasis
  if (lower.includes("sonnet")) return "warning"; // Mid-tier - yellow
  if (lower.includes("haiku")) return "good"; // Economy - green
  return "neutral";
}

/**
 * Collect model information from Claude Code input
 *
 * Proxy-aware: when the proxy is switched to an external provider,
 * shows the switched model name instead of Claude's native model.
 * Session-aware: reads from control API for accurate per-session state.
 */
async function collectModelData(context: SegmentContext): Promise<SegmentData | null> {
  // Try to get session-scoped state first, then fall back to global
  let switchState: ProxySwitchState | null = null;
  const sessionId = extractSessionId();

  try {
    if (sessionId) {
      switchState = await fetchStatusFromControlApi(sessionId);
    }
    // Fallback to global file state
    if (!switchState) {
      switchState = readSwitchState();
    }
  } catch {
    // Proxy state unavailable — fall through to native model
  }

  // Check if proxy is actively switched
  if (switchState?.switched && switchState.provider && switchState.model) {
    // External provider - show full model name with arrow prefix
    const display = `→${getModelDisplay(switchState.model, true)}`;
    return {
      primary: display,
      metadata: {
        modelId: switchState.model,
        displayName: `${switchState.provider}/${switchState.model}`,
        proxySwitched: "true",
      },
      color: "warning", // Yellow to indicate switched state
    };
  }

  const { claudeCodeInput } = context;

  // Graceful degradation - no data available
  if (!claudeCodeInput?.model?.id) {
    return {
      primary: "?",
      metadata: {},
      color: "neutral",
    };
  }

  const modelId = claudeCodeInput.model.id;
  const display = getModelDisplay(modelId, false);
  const color = getModelColor(modelId);

  return {
    primary: display,
    metadata: {
      modelId,
      displayName: display,
    },
    color,
  };
}

/**
 * Format model segment for display
 */
function formatModelSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export const modelSegment: Segment = {
  id: "model",
  collect: collectModelData,
  format: formatModelSegment,
};
