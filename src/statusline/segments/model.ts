/**
 * Model segment - shows current Claude model
 * Data source: Claude Code stdin JSON (model.id, model.display_name)
 * Graceful degradation: Shows "?" if data unavailable
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { readSwitchState, isTimedOut } from "../../proxy/state";

// Model display names mapping
const MODEL_DISPLAY: Record<string, string> = {
  // Claude 4.5 models
  "claude-opus-4-5-20251101": "opus-4.5",
  "claude-sonnet-4-5-20251101": "sonnet-4.5",
  "claude-haiku-4-5-20251101": "haiku-4.5",
  // Shorter aliases
  "opus-4.5": "opus-4.5",
  "sonnet-4.5": "sonnet-4.5",
  "haiku-4.5": "haiku-4.5",
  // Legacy
  "claude-3-opus": "opus-3",
  "claude-3-sonnet": "sonnet-3",
  "claude-3-haiku": "haiku-3",
};

/**
 * Abbreviate model name for display
 */
function getModelDisplay(modelId: string, displayName?: string): string {
  // First try exact match
  if (MODEL_DISPLAY[modelId]) {
    return MODEL_DISPLAY[modelId];
  }

  // Try display name
  if (displayName && MODEL_DISPLAY[displayName]) {
    return MODEL_DISPLAY[displayName];
  }

  // Extract meaningful part from model ID
  const lower = modelId.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";

  // Use display name if available
  if (displayName) {
    return displayName.length > 12 ? displayName.slice(0, 10) + ".." : displayName;
  }

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
 */
async function collectModelData(context: SegmentContext): Promise<SegmentData | null> {
  // Check if proxy is actively switched
  try {
    const switchState = readSwitchState();
    if (switchState.switched && !isTimedOut(switchState) && switchState.provider && switchState.model) {
      const display = `→${switchState.model}`;
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
  } catch {
    // Proxy state unavailable — fall through to native model
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
  const displayName = claudeCodeInput.model.display_name;
  const display = getModelDisplay(modelId, displayName);
  const color = getModelColor(modelId);

  return {
    primary: display,
    metadata: {
      modelId,
      displayName: displayName || "",
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
