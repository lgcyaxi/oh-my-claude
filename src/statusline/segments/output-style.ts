/**
 * Output Style segment - shows current output mode
 * Data source: Claude Code stdin JSON (output_style.name)
 * Graceful degradation: Shows "?" if data unavailable
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";

// Output style abbreviations for compact display
const STYLE_ABBREV: Record<string, string> = {
  normal: "normal",
  concise: "concise",
  explanatory: "explain",
  "formal": "formal",
  // Custom styles
  "engineer-professional": "eng-pro",
  "code-focused": "code",
  "documentation": "docs",
  // Plan mode indicator
  plan: "plan",
};

/**
 * Get abbreviated style name
 */
function getStyleAbbrev(styleName: string): string {
  const lower = styleName.toLowerCase();

  // Check exact match
  if (STYLE_ABBREV[lower]) {
    return STYLE_ABBREV[lower];
  }

  // Check partial match
  for (const [key, abbrev] of Object.entries(STYLE_ABBREV)) {
    if (lower.includes(key)) {
      return abbrev;
    }
  }

  // Truncate if too long
  return styleName.length > 8 ? styleName.slice(0, 6) + ".." : styleName;
}

/**
 * Collect output style information from Claude Code input
 */
async function collectOutputStyleData(context: SegmentContext): Promise<SegmentData | null> {
  const { claudeCodeInput } = context;

  // Graceful degradation - no data available
  if (!claudeCodeInput?.output_style?.name) {
    return {
      primary: "?",
      metadata: {},
      color: "neutral",
    };
  }

  const styleName = claudeCodeInput.output_style.name;
  const display = getStyleAbbrev(styleName);

  // Color based on style type
  let color: SegmentData["color"] = "neutral";
  const lower = styleName.toLowerCase();
  if (lower.includes("plan")) {
    color = "warning"; // Plan mode - attention needed
  } else if (lower.includes("concise") || lower.includes("code")) {
    color = "good"; // Efficient modes
  }

  return {
    primary: display,
    metadata: {
      styleName,
    },
    color,
  };
}

/**
 * Format output style segment for display
 */
function formatOutputStyleSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export const outputStyleSegment: Segment = {
  id: "output-style",
  collect: collectOutputStyleData,
  format: formatOutputStyleSegment,
};
