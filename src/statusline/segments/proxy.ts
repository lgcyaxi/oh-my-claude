/**
 * Proxy segment - shows proxy switch status
 *
 * Hidden when not switched (no visual noise).
 * When switched: [→DS/R ×2] (arrow prefix = redirected, provider/model abbrev, remaining count)
 * Color: yellow when switched (attention-grabbing)
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { readSwitchState, isTimedOut } from "../../proxy/state";

/** Provider name abbreviations */
const PROVIDER_ABBREV: Record<string, string> = {
  deepseek: "DS",
  zhipu: "ZP",
  minimax: "MM",
  openrouter: "OR",
};

/** Model name abbreviations */
function abbreviateModel(model: string): string {
  const abbrevMap: Record<string, string> = {
    "deepseek-reasoner": "R",
    "deepseek-chat": "C",
    "glm-4.7": "4.7",
    "glm-4v-flash": "4vF",
    "MiniMax-M2.1": "M2",
    "minimax-m2.1": "M2",
  };

  return abbrevMap[model] ?? model.slice(0, 6);
}

/**
 * Collect proxy switch data
 */
async function collectProxyData(_context: SegmentContext): Promise<SegmentData | null> {
  try {
    const state = readSwitchState();

    // Hidden when not switched
    if (!state.switched) {
      return null;
    }

    // Check if timed out
    if (isTimedOut(state)) {
      return null;
    }

    const provider = state.provider ?? "?";
    const model = state.model ?? "?";
    const remaining = state.requestsRemaining;

    const providerAbbrev = PROVIDER_ABBREV[provider] ?? provider.slice(0, 2).toUpperCase();
    const modelAbbrev = abbreviateModel(model);

    const remainingStr = remaining < 0 ? "∞" : `×${remaining}`;
    const primary = `→${providerAbbrev}/${modelAbbrev} ${remainingStr}`;

    return {
      primary,
      metadata: {
        provider,
        model,
        remaining: String(remaining),
      },
      color: "warning", // Yellow — attention-grabbing
    };
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
